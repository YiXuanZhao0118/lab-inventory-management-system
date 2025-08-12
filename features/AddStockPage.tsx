// features/AddStockPage.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/services/apiClient";
import { ProductItem ,LocationNode } from "@/lib/database";

// ---- 型別 ----
type Draft = {
  productId: string;
  product: Pick<ProductItem, "id" | "name" | "model" | "brand" | "isPropertyManaged">;
  quantity: number;           // 財產固定 1；非財產可 >1
  locationId: "1";
};

export default function AddStockPage() {
  // 狀態
  const [message, setMessage] = useState<string | null>(null);
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // 讀取產品（沿用 /api/addStock 的 GET）
  const { data, error } = useSWR<{ products: ProductItem[] }>("/api/addStock", fetcher, {
    revalidateOnFocus: true,
  });
  const all = data?.products ?? [];

  // 讀取 locationTree，從 root 找到 id === "1" 的標籤
  const { data: locTree } = useSWR<LocationNode[]>("/api/location-tree", fetcher);
  const containerLabel = useMemo(() => {
    // 依你的需求，僅在「最上層」尋找 id === "1」的節點
    const label = locTree?.find((n) => n.id === "1")?.label;
    return label ?? "Container Area"; // 找不到時後備顯示
  }, [locTree]);

  // 兩欄分組 + 搜尋
  const pmList = useMemo(() => {
    const list = all.filter((p) => p.isPropertyManaged);
    if (!searchPM.trim()) return list;
    const q = searchPM.trim().toLowerCase();
    return list.filter((p) =>
      [p.name, p.model, p.brand, p.id].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [all, searchPM]);

  const nonList = useMemo(() => {
    const list = all.filter((p) => !p.isPropertyManaged);
    if (!searchNon.trim()) return list;
    const q = searchNon.trim().toLowerCase();
    return list.filter((p) =>
      [p.name, p.model, p.brand, p.id].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [all, searchNon]);

  // 加入草稿（財產：每按一下就多一筆；非財產：合併數量）
  const addDraftForProduct = (p: ProductItem) => {
    const base: Draft = {
      productId: p.id,
      product: { id: p.id, name: p.name, model: p.model, brand: p.brand, isPropertyManaged: p.isPropertyManaged },
      quantity: p.isPropertyManaged ? 1 : 1,
      locationId: "1",
    };
    setDrafts((prev) => {
      if (p.isPropertyManaged) return [...prev, base];
      const idx = prev.findIndex((d) => !d.product.isPropertyManaged && d.productId === p.id);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, base];
    });
  };

  // 原生拖拉：開始 / 丟到選擇區
  const onDragStart = (e: React.DragEvent, dragId: string) => {
    e.dataTransfer.setData("text/plain", dragId); // 'prod::<productId>'
  };
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData("text/plain");
    if (!dragId?.startsWith("prod::")) return;
    const pid = dragId.slice(6);
    const p = all.find((x) => x.id === pid);
    if (p) addDraftForProduct(p);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  // 草稿操作
  const updateDraftQty = (i: number, newQty: number) =>
    setDrafts((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, quantity: Math.max(1, Math.floor(newQty) || 1) } : d))
    );
  const removeDraft = (i: number) => setDrafts((prev) => prev.filter((_, idx) => i !== idx));
  const clearDrafts = () => setDrafts([]);

  // 送出
  const submitAll = async () => {
    if (drafts.length === 0) return;
    // 扁平化成 payload 陣列
    const payload: Array<{ productId: string; locationId: string; quantity: number }> = drafts.map((d) => ({
      productId: d.productId,
      locationId: d.locationId,
      quantity: d.product.isPropertyManaged ? 1 : d.quantity,
    }));

    try {
      const res = await fetch("/api/addStock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          j?.errors?.map((e: any) => `#${e.index}: ${e.message}`).join("；") ||
          j?.error ||
          `HTTP ${res.status}`;
        throw new Error(errMsg);
      }
      setMessage("新增成功");
      setDrafts([]);
      setTimeout(() => setMessage(null), 1200);
    } catch (e: any) {
      setMessage(`新增失敗：${e?.message || e}`);
      setTimeout(() => setMessage(null), 1800);
    }
  };

  if (error) return <div className="p-6 text-red-600">載入失敗：{String((error as Error).message)}</div>;
  if (!data) return <div className="p-6 text-gray-600">載入中…</div>;

  return (
    
    <div className="max-w-screen mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white">➕ 批次新增庫存</h2>


      {message && (
        <div className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {message}
        </div>
      )}

      {/* 兩欄：PM / Non-PM（可拖拉＋按鈕加入） */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PM */}
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
            {pmList.length === 0 && <div className="text-sm text-gray-500">無符合項目</div>}
            {pmList.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, `prod::${p.id}`)}
                className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {p.model} / {p.brand}
                  </div>
                  <span className="mt-1 inline-block px-2 py-0.5 bg-blue-200 text-blue-800 text-[11px] font-semibold rounded">
                    財產管理
                  </span>
                </div>
                <button
                  className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                  onClick={() => addDraftForProduct(p)}
                >
                  加入
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Non-PM */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">非財產（可調整數量）</h3>
            <input
              className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
              placeholder="搜尋…"
              value={searchNon}
              onChange={(e) => setSearchNon(e.target.value)}
            />
          </div>
          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
            {nonList.length === 0 && <div className="text-sm text-gray-500">無符合項目</div>}
            {nonList.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, `prod::${p.id}`)}
                className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {p.model} / {p.brand}
                  </div>
                </div>
                <button
                  className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                  onClick={() => addDraftForProduct(p)}
                >
                  加入
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 選擇區（待新增清單） */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <h3 className="font-semibold text-lg">🧺 待新增清單（拖拉卡片到此處，或按卡片上的「加入」）</h3>
        <div
          className="min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800"
          onDrop={onDropToSelection}
          onDragOver={onDragOver}
        >
          {drafts.length === 0 ? (
            <div className="text-center text-gray-500">尚無項目</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-3 py-2 text-left">產品</th>
                    <th className="px-3 py-2 text-left">型號 / 品牌</th>
                    <th className="px-3 py-2 text-left">類型</th>
                    <th className="px-3 py-2 text-left">地點</th>
                    <th className="px-3 py-2 text-left">數量</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {drafts.map((d, i) => (
                    <tr key={`${d.productId}-${i}`}>
                      <td className="px-3 py-2">{d.product.name}</td>
                      <td className="px-3 py-2">{d.product.model} / {d.product.brand}</td>
                      <td className="px-3 py-2">{d.product.isPropertyManaged ? "財產" : "非財產"}</td>
                      <td className="px-3 py-2 font-mono">{containerLabel}</td>
                      <td className="px-3 py-2">
                        {d.product.isPropertyManaged ? (
                          <span>1</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              className="px-2 py-1 rounded border dark:border-gray-700"
                              onClick={() => updateDraftQty(i, Math.max(1, d.quantity - 1))}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              className="w-20 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-700"
                              min={1}
                              value={d.quantity}
                              onChange={(e) =>
                                updateDraftQty(i, parseInt(e.target.value || "1", 10))
                              }
                            />
                            <button
                              className="px-2 py-1 rounded border dark:border-gray-700"
                              onClick={() => updateDraftQty(i, d.quantity + 1)}
                            >
                              ＋
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button className="text-red-500 hover:underline" onClick={() => removeDraft(i)}>
                          移除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button className="text-gray-500 hover:underline" onClick={clearDrafts}>
            清空
          </button>
          <button
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
            onClick={submitAll}
            disabled={drafts.length === 0}
          >
            送出新增
          </button>
        </div>
      </section>
    </div>
  );
}
