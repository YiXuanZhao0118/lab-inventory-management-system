// pages\LongTermReturnPage.tsx
"use client";

import React, { useState, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { ReturnItem } from "@/lib/types";
import { fetcher } from '@/services/apiClient';

interface ApiResponse {
  propertyManaged: ReturnItem[];
  nonPropertyManaged: ReturnItem[];
}

export default function ReturnPage() {
  const { mutate: mutateCache } = useSWRConfig();
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).LoanAndReturn.ReturnPage;

  const { data, error, mutate: mutateReturn } = useSWR<ApiResponse>(
    "/api/rentals/return",
    fetcher
  );

  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const all = [...data.propertyManaged, ...data.nonPropertyManaged];
    const lower = q.toLowerCase();
    return all.filter(r =>
      [r.product.name, r.product.model, r.locationPath.join(" - "), r.renter, r.borrower]
        .join(" ")
        .toLowerCase()
        .includes(lower)
    );
  }, [data, q]);

  if (error) {
    const message = (error as Error).message;
    return (
      <div className="max-w-screen-lg mx-auto p-6 bg-red-100 text-red-800 rounded-lg">
        {t.loadFailed ? t.loadFailed.replace("{errorMessage}", message) : `Error: ${message}`}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-screen-lg mx-auto p-6 text-gray-600 dark:text-gray-300">
        {t.loading}...
      </div>
    );
  }

  const doReturn = async (item: ReturnItem) => {
    const payload = item.isPropertyManaged
      ? {
          rentedItemId: item.id!,                 // ← 對應 POST
          returnDate: new Date().toISOString(),
        }
      : {
          productId: item.product.id,
          locationId: item.locationId,
          quantity: item.qty!,                    // ← 對應 POST
          renter: item.renter,
          borrower: item.borrower,
          loanType: item.loanType,                // ← 對應 POST
          returnDate: new Date().toISOString(),
        };

    try {
      const res = await fetch("/api/rentals/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      await mutateReturn();                  // 先刷新歸還列表
      await mutateCache("/api/rentals/rental"); // 再刷新借出清單（長租頁用）
      alert(t.returnSuccess);
    } catch (e: any) {
      const msg = e.message || "";
      if (t.returnFailed) alert(t.returnFailed.replace("{errorMessage}", msg));
      else alert(`Return failed: ${msg}`);
    }
  };

  return (
    <div className="max-w-screen-lg mx-auto p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🔄 {t.title}</h1>
        <input
          type="text"
          className="w-full md:w-1/3 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={t.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {[t.name, t.model, t.location, t.renter, t.borrower, t.loanDate, t.dueDate, t.actions].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {rows.length > 0 ? (
              rows.map((r, idx) => (
                <tr key={r.id ?? idx} className="hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-2 text-sm">{r.product.name}</td>
                  <td className="px-4 py-2 text-sm">{r.product.model}</td>
                  <td className="px-4 py-2 text-sm">{r.locationPath.join(" → ")}</td>
                  <td className="px-4 py-2 text-sm">{r.renter}</td>
                  <td className="px-4 py-2 text-sm">{r.borrower}</td>
                  <td className="px-4 py-2 text-sm">{new Date(r.loanDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-sm">{new Date(r.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-sm">
                    {r.isPropertyManaged ? (
                      <button
                        onClick={() => doReturn(r)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {t.returnButton}
                      </button>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min={1}
                          max={r.qty}
                          defaultValue={r.qty}
                          onChange={(e) => { r.qty = Number(e.target.value); }}
                          className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800"
                        />
                        <button
                          onClick={() => doReturn(r)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {t.returnButton}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                  {t.noRecords}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
