// pages/Discarded.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/services/apiClient";

type BulkStatus = "in_stock" | "long_term";

type PMItem = {
  stockId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
  currentStatus: BulkStatus;
};

type NonPMGroup = {
  productId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
  quantity: number; // available at source
  currentStatus: BulkStatus;
};

type GetResp = {
  propertyManaged: PMItem[];
  nonPropertyManaged: NonPMGroup[];
};

type CartPM = { type: "pm"; stockId: string };
type CartNonPM = {
  type: "non";
  productId: string;
  locationId: string;
  currentStatus: BulkStatus;
  quantity: number;
  max: number;
};
type CartItem = CartPM | CartNonPM;

export default function DiscardedModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data, error } = useSWR<GetResp>("/api/discarded", fetcher, {
    revalidateOnFocus: true,
  });

  const [message, setMessage] = useState<string | null>(null);
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");

  // 狀態篩選（多選）
  const AVAILABLE: BulkStatus[] = ["in_stock", "long_term"];
  const [selectedStatuses, setSelectedStatuses] = useState<BulkStatus[]>([
    "in_stock",
    "long_term",
  ]);
  const toggleStatus = (st: BulkStatus) =>
    setSelectedStatuses((arr) =>
      arr.includes(st) ? arr.filter((x) => x !== st) : [...arr, st]
    );

  // ====== 來源清單處理 ======
  const allPM = data?.propertyManaged ?? [];
  const allNon = data?.nonPropertyManaged ?? [];

  // 依狀態與搜尋過濾（PM）
  const pmList = useMemo(() => {
    const base = allPM.filter((i) => selectedStatuses.includes(i.currentStatus));
    if (!searchPM.trim()) return base;
    const q = searchPM.trim().toLowerCase();
    return base.filter((i) =>
      [
        i.stockId,
        i.product.name,
        i.product.model,
        i.product.brand,
        i.locationPath.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [allPM, selectedStatuses, searchPM]);

  // 依狀態與搜尋過濾（Non-PM）
  const nonList = useMemo(() => {
    const base = allNon.filter((g) => selectedStatuses.includes(g.currentStatus));
    if (!searchNon.trim()) return base;
    const q = searchNon.trim().toLowerCase();
    return base.filter((g) =>
      [
        g.productId,
        g.product.name,
        g.product.model,
        g.product.brand,
        g.locationPath.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [allNon, selectedStatuses, searchNon]);

  // 取得目前 cap（防止後端資料更新後超量）
  const getCap = (productId: string, locationId: string, currentStatus: BulkStatus) => {
    const row = allNon.find(
      (g) =>
        g.productId === productId &&
        g.locationId === locationId &&
        g.currentStatus === currentStatus
    );
    return row?.quantity ?? 0;
  };

  // ====== 選擇區 ======
  const [cart, setCart] = useState<CartItem[]>([]);

  // 後端資料變動時，校正非財 cart 的 max/quantity
  useEffect(() => {
    if (!data) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.type === "non") {
          const n = c as CartNonPM;
          const newMax = getCap(n.productId, n.locationId, n.currentStatus);
          const newQty = Math.min(n.quantity, newMax);
          if (newMax !== n.max || newQty !== n.quantity) {
            changed = true;
            return { ...n, max: newMax, quantity: newQty };
          }
        }
        return c;
      });
      return changed ? next : prev;
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPM = (stockId: string) =>
    setCart((prev) =>
      prev.some((x) => x.type === "pm" && x.stockId === stockId)
        ? prev
        : [...prev, { type: "pm", stockId }]
    );

  const addNon = (productId: string, locationId: string, currentStatus: BulkStatus) =>
    setCart((prev) => {
      const idx = prev.findIndex(
        (x) =>
          x.type === "non" &&
          (x as CartNonPM).productId === productId &&
          (x as CartNonPM).locationId === locationId &&
          (x as CartNonPM).currentStatus === currentStatus
      );
      const cap = getCap(productId, locationId, currentStatus);
      if (cap <= 0) return prev;
      if (idx >= 0) {
        const cur = prev[idx] as CartNonPM;
        if (cur.quantity >= cur.max) return prev;
        const next = [...prev];
        next[idx] = { ...cur, quantity: Math.min(cur.quantity + 1, cap), max: cap };
        return next;
      }
      return [
        ...prev,
        {
          type: "non",
          productId,
          locationId,
          currentStatus,
          quantity: 1,
          max: cap,
        } as CartNonPM,
      ];
    });

  // 簡易拖拉
  const onDragStart = (e: React.DragEvent, dragId: string) =>
    e.dataTransfer.setData("text/plain", dragId);
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData("text/plain");
    if (!dragId) return;
    if (dragId.startsWith("pm::")) {
      addPM(dragId.slice(4));
    } else if (dragId.startsWith("non::")) {
      const [, productId, locationId, st] = dragId.split("::");
      addNon(productId, locationId, st as BulkStatus);
    }
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  // 原因/經辦 + 送出
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const openConfirm = () => {
    setMessage(null);
    if (cart.length === 0) return setMessage("請先加入要報廢的項目。");
    if (!reason.trim() || !operator.trim())
      return setMessage("請輸入 reason 與 operator。");
    setConfirmOpen(true);
  };

  const buildPayload = () => {
    const items: Array<
      | { stockId: string }
      | { productId: string; locationId: string; currentStatus: BulkStatus; quantity: number }
    > = [];
    for (const c of cart) {
      if (c.type === "pm") {
        items.push({ stockId: (c as CartPM).stockId });
      } else {
        const n = c as CartNonPM;
        if (n.quantity > 0) {
          items.push({
            productId: n.productId,
            locationId: n.locationId,
            currentStatus: n.currentStatus,
            quantity: n.quantity,
          });
        }
      }
    }
    return { reason: reason.trim(), operator: operator.trim(), items };
  };

  const doSubmit = async () => {
    setPosting(true);
    try {
      const res = await fetch("/api/discarded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);

      setMessage("報廢成功。");
      setCart([]);
      setReason("");
      setOperator("");
      setConfirmOpen(false);

      } catch (e: any) {
        setMessage(`報廢失敗：${e?.message || e}`);
        setTimeout(() => {
          setMessage(null);
        }, 500);
      } finally {
        setPosting(false);
      }
  };


  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="w-full max-w-7xl h-[calc(100vh-2rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold">🗑️ 多筆報廢</h2>
          <button onClick={onClose} className="text-red-500 hover:underline">
            關閉
          </button>
        </div>

        {error && (
          <div className="p-6 text-red-600">載入失敗：{(error as Error).message}</div>
        )}
        {!data && !error && <div className="p-6 text-gray-600">載入中…</div>}

        {data && (
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {message && (
              <div
                role="alert"
                className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              >
                {message}
              </div>
            )}

            {/* 狀態篩選 */}
            <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  顯示狀態：
                </span>
                {AVAILABLE.map((st) => {
                  const active = selectedStatuses.includes(st);
                  return (
                    <button
                      key={st}
                      className={`px-3 py-1 rounded-full border text-sm ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                      }`}
                      onClick={() => toggleStatus(st)}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 兩欄：PM / NonPM */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PM（逐一） */}
              <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">財產管理（逐一）</h3>
                  <input
                    className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                    placeholder="搜尋…"
                    value={searchPM}
                    onChange={(e) => setSearchPM(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
                  {pmList.length === 0 && (
                    <div className="text-sm text-gray-500">無可報廢項目</div>
                  )}
                  {pmList.map((s) => (
                    <div
                      key={s.stockId}
                      draggable
                      onDragStart={(e) => onDragStart(e, `pm::${s.stockId}`)}
                      className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {s.product.name} / {s.product.model} / {s.product.brand}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Stock: <code>{s.stockId}</code>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {s.currentStatus} · {s.locationPath.join(" → ")}
                        </div>
                      </div>
                      <button
                        className="px-2 py-1 text-xs rounded bg-blue-600 text-white"
                        onClick={() => addPM(s.stockId)}
                      >
                        加入
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Non-PM（聚合） */}
              <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">非財產（聚合）</h3>
                  <input
                    className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                    placeholder="搜尋…"
                    value={searchNon}
                    onChange={(e) => setSearchNon(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
                  {nonList.length === 0 && (
                    <div className="text-sm text-gray-500">無可報廢項目</div>
                  )}
                  {nonList.map((g) => (
                    <div
                      key={`${g.productId}::${g.locationId}::${g.currentStatus}`}
                      draggable
                      onDragStart={(e) =>
                        onDragStart(
                          e,
                          `non::${g.productId}::${g.locationId}::${g.currentStatus}`
                        )
                      }
                      className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {g.product.name} / {g.product.model} / {g.product.brand}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {g.currentStatus} · {g.locationPath.join(" → ")}
                          <div className="mt-1">可用數量：{g.quantity}</div>
                        </div>
                      </div>
                      <button
                        className="ml-3 px-2 py-1 text-xs rounded bg-blue-600 text-white"
                        onClick={() => addNon(g.productId, g.locationId, g.currentStatus)}
                      >
                        加入
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 選擇區 */}
            <section className="p-3 rounded-xl dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
              <h3 className="font-semibold text-lg">🧺 選擇區（拖拉或點「加入」）</h3>
              <div
                className="min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800"
                onDrop={onDropToSelection}
                onDragOver={onDragOver}
              >
                {cart.length === 0 ? (
                  <div className="text-center text-gray-500">
                    將上方卡片拖曳到此處，或在卡片上按「加入」
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((c, idx) =>
                      c.type === "pm" ? (
                        <div
                          key={`pm-${idx}`}
                          className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start justify-between gap-3"
                        >
                          <div className="text-sm font-medium">
                            #{(c as CartPM).stockId}
                          </div>
                          <button
                            className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                            onClick={() =>
                              setCart((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            移除
                          </button>
                        </div>
                      ) : (
                        (() => {
                          const n = c as CartNonPM;
                          const src = allNon.find(
                            (g) =>
                              g.productId === n.productId &&
                              g.locationId === n.locationId &&
                              g.currentStatus === n.currentStatus
                          );
                          return (
                            <div
                              key={`non-${idx}`}
                              className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {src?.product.name} / {src?.product.model} / {src?.product.brand}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  {n.currentStatus} · {src?.locationPath.join(" → ") || n.locationId}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">數量</span>
                                <button
                                  className="px-2 py-1 rounded border dark:border-gray-700"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...(x as CartNonPM),
                                              quantity: Math.max(
                                                1,
                                                (x as CartNonPM).quantity - 1
                                              ),
                                            } as CartItem)
                                          : x
                                      )
                                    )
                                  }
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  className="w-16 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-700"
                                  min={1}
                                  max={n.max}
                                  value={n.quantity}
                                  onChange={(e) => {
                                    const raw = parseInt(e.target.value || "1", 10);
                                    const val = Math.max(
                                      1,
                                      Math.min(n.max, isNaN(raw) ? 1 : raw)
                                    );
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({ ...(x as CartNonPM), quantity: val } as CartItem)
                                          : x
                                      )
                                    );
                                  }}
                                />
                                <button
                                  className="px-2 py-1 rounded border dark:border-gray-700"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...(x as CartNonPM),
                                              quantity: Math.min(
                                                (x as CartNonPM).max,
                                                (x as CartNonPM).quantity + 1
                                              ),
                                            } as CartItem)
                                          : x
                                      )
                                    )
                                  }
                                >
                                  ＋
                                </button>
                                <span className="text-xs text-gray-500">/ 最多 {n.max}</span>
                              </div>
                              <button
                                className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                                onClick={() =>
                                  setCart((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                移除
                              </button>
                            </div>
                          );
                        })()
                      )
                    )}
                  </div>
                )}
              </div>

              {/* reason / operator + actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">reason</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., 過期、損壞…"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">operator</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    placeholder="LabAdmin"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  className="text-gray-500 hover:underline"
                  onClick={() => setCart([])}
                >
                  清空選擇
                </button>
                <button
                  className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-60"
                  onClick={openConfirm}
                  disabled={cart.length === 0 || !reason.trim() || !operator.trim()}
                >
                  報廢
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* 確認彈窗 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl p-5">
            <h3 className="text-lg font-semibold mb-3">確認報廢總結</h3>
            <div className="space-y-4 max-h-[60vh] overflow-auto pr-1 text-sm">
              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div className="font-medium mb-2">財產品（單筆）</div>
                {cart.filter((c) => c.type === "pm").length === 0 ? (
                  <div className="text-gray-500">無</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {cart
                      .filter((c) => c.type === "pm")
                      .map((c, i) => (
                        <li key={`cpm-${i}`}>
                          <code>{(c as CartPM).stockId}</code>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div className="font-medium mb-2">非財產品（批次）</div>
                {cart.filter((c) => c.type === "non").length === 0 ? (
                  <div className="text-gray-500">無</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {cart
                      .filter((c) => c.type === "non")
                      .map((c, i) => {
                        const n = c as CartNonPM;
                        const src = allNon.find(
                          (g) =>
                            g.productId === n.productId &&
                            g.locationId === n.locationId &&
                            g.currentStatus === n.currentStatus
                        );
                        return (
                          <li key={`cnon-${i}`}>
                            {src?.product.name}/{src?.product.model}/{src?.product.brand} ·{" "}
                            {src?.locationPath.join(" → ") || n.locationId} · status: {n.currentStatus} · qty:{" "}
                            <b>{n.quantity}</b> (最多 {n.max})
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>

              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div>
                  <b>reason：</b> {reason}
                </div>
                <div>
                  <b>operator：</b> {operator}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded bg-gray-300 dark:bg-gray-700"
                onClick={() => setConfirmOpen(false)}
                disabled={posting}
              >
                取消
              </button>
              <button
                className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60"
                onClick={doSubmit}
                disabled={posting}
              >
                {posting ? "送出中…" : "確定報廢"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
