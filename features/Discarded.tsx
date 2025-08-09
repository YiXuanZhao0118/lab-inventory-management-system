// pages/Discarded.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "@/services/apiClient";

type BulkStatus = "in_stock" | "short_term" | "long_term";

type Product = {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications?: string;
  isPropertyManaged: boolean;
};

type StockRow = {
  id: string; // stockId
  productId: string;
  locationId: string;
  currentStatus: BulkStatus | "discarded";
  discarded?: boolean;
};

type LocationNode = { id: string; label: string; children?: LocationNode[] };

type StockListResp = {
  stock: StockRow[];
  products: Product[];
  locations: LocationNode[];
};

// ---- cart types ----
type CartPM = {
  type: "pm";
  stockId: string;
};

type CartNonPM = {
  type: "non";
  productId: string;
  locationId: string;
  currentStatus: BulkStatus;
  quantity: number;
  max: number; // cap available
};

type CartItem = CartPM | CartNonPM;

export default function DiscardedModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { mutate } = useSWRConfig();
  const { data, error } = useSWR<StockListResp>("/api/discarded", fetcher, {
    revalidateOnFocus: false,
  });

  const products = data?.products ?? [];
  const stock = data?.stock ?? [];
  const locations = data?.locations ?? [];

  const [message, setMessage] = useState<string | null>(null);

  // ----- status filter (multi-select) -----
  const AVAILABLE: Array<"in_stock" | "long_term"> = [
    "in_stock",
    "long_term",
  ];
  const [selectedStatuses, setSelectedStatuses] = useState<
    Array<"in_stock" | "long_term">
  >(["in_stock", "long_term"]);
  const toggleStatus = (st: "in_stock" | "long_term") =>
    setSelectedStatuses((arr) =>
      arr.includes(st) ? arr.filter((x) => x !== st) : [...arr, st]
    );

  // ----- maps -----
  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const locLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    const walk = (n: LocationNode, trail: string[]) => {
      const next = [...trail, n.label];
      m.set(n.id, next.join(" → "));
      n.children?.forEach((c) => walk(c, next));
    };
    locations.forEach((r) => walk(r, []));
    return m;
  }, [locations]);

  // ----- filter visible by selected statuses -----
  const visible = useMemo(
    () =>
      stock.filter(
        (s) =>
          !s.discarded &&
          (selectedStatuses as BulkStatus[]).includes(
            s.currentStatus as BulkStatus
          )
      ),
    [stock, selectedStatuses]
  );

  // left column: property-managed (individual)
  const pmList = useMemo(
    () =>
      visible.filter((s) => productMap.get(s.productId)?.isPropertyManaged),
    [visible, productMap]
  );

  // right column: non-property-managed grouped by (productId, locationId, currentStatus)
  type NonGroup = {
    productId: string;
    locationId: string;
    currentStatus: BulkStatus;
    quantity: number; // available count
  };
  const nonGroups = useMemo(() => {
    const map = new Map<string, NonGroup>();
    for (const s of visible) {
      const p = productMap.get(s.productId);
      if (!p || p.isPropertyManaged) continue;
      const key = `${s.productId}::${s.locationId}::${s.currentStatus}`;
      const g =
        map.get(key) ||
        ({
          productId: s.productId,
          locationId: s.locationId,
          currentStatus: s.currentStatus as BulkStatus,
          quantity: 0,
        } as NonGroup);
      g.quantity += 1;
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [visible, productMap]);

  // helper: compute available cap for a non-PM group (from raw stock)
  const nonCap = (productId: string, locationId: string, st: BulkStatus) =>
    stock.filter(
      (s) =>
        !s.discarded &&
        s.productId === productId &&
        s.locationId === locationId &&
        s.currentStatus === st &&
        !productMap.get(s.productId)?.isPropertyManaged
    ).length;

  // ----- selection cart -----
  const [cart, setCart] = useState<CartItem[]>([]);

  // keep cart caps in sync if data changes
  useEffect(() => {
    setCart(prev => {
      let changed = false;
      const next = prev.map(c => {
        if (c.type !== "non") return c;

        const newMax = nonCap(c.productId, c.locationId, c.currentStatus);
        const newQty = Math.min((c as CartNonPM).quantity, newMax);

        if (newMax !== (c as CartNonPM).max || newQty !== (c as CartNonPM).quantity) {
          changed = true;
          return { ...(c as CartNonPM), max: newMax, quantity: newQty };
        }
        return c;
      });

      // 只有真的有變動才回傳新陣列，否則回傳 prev（避免無限 re-render）
      return changed ? next : prev;
    });
  }, [stock, products]);

  // add handlers
  const addPM = (stockId: string) => {
    setCart((prev) =>
      prev.some((x) => x.type === "pm" && x.stockId === stockId)
        ? prev
        : [...prev, { type: "pm", stockId }]
    );
  };

  const addNon = (
    productId: string,
    locationId: string,
    currentStatus: BulkStatus
  ) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (x) =>
          x.type === "non" &&
          x.productId === productId &&
          x.locationId === locationId &&
          x.currentStatus === currentStatus
      );
      const cap = nonCap(productId, locationId, currentStatus);
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
  };

  // native drag helpers
  const onDragStart = (e: React.DragEvent, dragId: string) => {
    e.dataTransfer.setData("text/plain", dragId);
  };
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

  // reason & operator
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");

  // confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const openConfirm = () => {
    setMessage(null);
    if (cart.length === 0) return setMessage("請先加入要報廢的項目。");
    if (!reason.trim() || !operator.trim())
      return setMessage("請輸入 reason 與 operator。");
    setConfirmOpen(true);
  };

  // payload
  const buildPayload = () => {
    const items: Array<
      | { stockId: string }
      | {
          productId: string;
          locationId: string;
          currentStatus: BulkStatus;
          quantity: number;
        }
    > = [];
    for (const c of cart) {
      if (c.type === "pm") {
        items.push({ stockId: (c as CartPM).stockId });
      } else {
        const n = c as CartNonPM;
        if (n.quantity > 0)
          items.push({
            productId: n.productId,
            locationId: n.locationId,
            currentStatus: n.currentStatus,
            quantity: n.quantity,
          });
      }
    }
    return { reason: reason.trim(), operator: operator.trim(), items };
  };

  const doSubmit = async () => {
    setPosting(true);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/discarded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);

      setMessage("報廢成功。");
      setCart([]);
      setReason("");
      setOperator("");
      setConfirmOpen(false);
      await mutate("/api/discarded");
    } catch (e: any) {
      setMessage(`報廢失敗：${e?.message || e}`);
    } finally {
      setPosting(false);
    }
  };

  // UI card renderers
  const PMCard = ({ s }: { s: StockRow }) => {
    const p = productMap.get(s.productId);
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, `pm::${s.id}`)}
        className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
      >
        <div className="flex-1">
          <div className="text-sm font-medium">
            {p?.name} / {p?.model} / {p?.brand}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Stock: <code>{s.id}</code>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {s.currentStatus} · {locLabelMap.get(s.locationId) || s.locationId}
          </div>
        </div>
        <button
          className="px-2 py-1 text-xs rounded bg-blue-600 text-white"
          onClick={() => addPM(s.id)}
        >
          加入
        </button>
      </div>
    );
  };

  const NonGroupCard = ({ g }: { g: NonGroup }) => {
    const p = productMap.get(g.productId);
    return (
      <div
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
            {p?.name} / {p?.model} / {p?.brand}
          </div>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {g.currentStatus} · {locLabelMap.get(g.locationId) || g.locationId}
          <div className="mt-1">可用數量：{g.quantity}</div>
        </div>
        <button
          className="ml-3 px-2 py-1 text-xs rounded bg-blue-600 text-white"
          onClick={() => addNon(g.productId, g.locationId, g.currentStatus)}
        >
          加入
        </button>
      </div>
    );
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
          <div className="p-6 text-red-600">
            載入失敗：{(error as Error).message}
          </div>
        )}
        {!data && !error && (
          <div className="p-6 text-gray-600">載入中…</div>
        )}

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

            {/* status multi-select */}
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

            {/* two columns */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PM left */}
              <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <h3 className="font-semibold mb-3">
                  財產品（isPropertyManaged = true）
                </h3>
                <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
                  {pmList.length === 0 && (
                    <div className="text-sm text-gray-500">無可報廢項目</div>
                  )}
                  {pmList.map((s) => (
                    <PMCard key={s.id} s={s} />
                  ))}
                </div>
              </div>

              {/* Non-PM right (grouped with quantities) */}
              <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <h3 className="font-semibold mb-3">
                  非財產品（分組 + 可選數量）
                </h3>
                <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
                  {nonGroups.length === 0 && (
                    <div className="text-sm text-gray-500">無可報廢項目</div>
                  )}
                  {nonGroups.map((g) => (
                    <NonGroupCard
                      key={`${g.productId}::${g.locationId}::${g.currentStatus}`}
                      g={g}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* selection area */}
            <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
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
                    {cart.map((c, idx) => {
                      if (c.type === "pm") {
                        const s = stock.find((x) => x.id === (c as CartPM).stockId);
                        const p = s ? productMap.get(s.productId) : undefined;
                        return (
                          <div
                            key={`pm-${idx}`}
                            className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start justify-between gap-3"
                          >
                            <div>
                              <div className="text-sm font-medium">
                                #{(c as CartPM).stockId} — {p?.name} / {p?.model} / {p?.brand}
                              </div>
                              {s && (
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  {s.currentStatus} · {locLabelMap.get(s.locationId) || s.locationId}
                                </div>
                              )}
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
                      } else {
                        const n = c as CartNonPM;
                        const p = productMap.get(n.productId);
                        return (
                          <div
                            key={`non-${idx}`}
                            className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {p?.name} / {p?.model} / {p?.brand}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                {n.currentStatus} · {locLabelMap.get(n.locationId) || n.locationId}
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
                                  const val = Math.max(1, Math.min(n.max, isNaN(raw) ? 1 : raw));
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
                      }
                    })}
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
                    placeholder="labAdmin"
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

      {/* confirm modal */}
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
                        const p = productMap.get(n.productId);
                        return (
                          <li key={`cnon-${i}`}>
                            {p?.name}/{p?.model}/{p?.brand} ·{" "}
                            {locLabelMap.get(n.locationId) || n.locationId} ·{" "}
                            status: {n.currentStatus} · qty: <b>{n.quantity}</b>{" "}
                            (最多 {n.max})
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
