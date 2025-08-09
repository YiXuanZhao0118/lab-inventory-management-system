// pages\LongTermRentedPage.tsx
"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

import { fetcher } from '@/services/apiClient';

// ----- types aligned with GET /api/rentals/rental -----
type PropertyManagedItem = {
  stockId: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  locationLabelLink: string;
  isPropertyManaged: true;
};

type NonPropertyManagedItem = {
  productId: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  locationId: string;
  locationLabelLink: string;
  quantity: number;
  isPropertyManaged: false;
};

type LongTermGetResponse = {
  nonPropertyManaged: NonPropertyManagedItem[];
  propertyManaged: PropertyManagedItem[];
};

export default function LoanForm() {
  const { mutate } = useSWRConfig();
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).LoanAndReturn.LoanForm;

  // Fetch from API (GET you added)
  const { data: loanData, error: loanError } = useSWR<LongTermGetResponse>("/api/rentals/rental", fetcher);

  // Always define lists (avoid conditional hooks later)
  const propertyManaged = loanData?.propertyManaged ?? [];
  const nonPropertyManaged = loanData?.nonPropertyManaged ?? [];

  // Dropdown open state
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Form state
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    isPM: true,
    stockId: "",
    groupKey: "", // `${productId}-${locationId}`
    qty: 1,
    renter: "",
    borrower: "",
    dueDate: "",
  });

  // Filter lists (ALWAYS call hooks – stable order)
  const filteredPM = useMemo(
    () =>
      propertyManaged.filter((i) =>
        `${i.name} ${i.model} ${i.locationLabelLink} ${i.stockId}`.toLowerCase().includes(search.toLowerCase())
      ),
    [propertyManaged, search]
  );

  const filteredNon = useMemo(
    () =>
      nonPropertyManaged.filter((g) =>
        `${g.name} ${g.model} ${g.locationLabelLink}`.toLowerCase().includes(search.toLowerCase())
      ),
    [nonPropertyManaged, search]
  );

  const chosenPM = propertyManaged.find((i) => i.stockId === form.stockId);
  const chosenNon = nonPropertyManaged.find((g) => `${g.productId}-${g.locationId}` === form.groupKey);
  const availableQty = form.isPM ? 1 : chosenNon?.quantity ?? 0;

  const isLoading = !loanData && !loanError;
  const hasError = !!loanError;

  const submit = async () => {
    if ((form.isPM ? !form.stockId : !form.groupKey) || !form.renter || !form.borrower || !form.dueDate) {
      alert(t.fillAllFields);
      return;
    }

    const loanType = "long_term"; // this page is for long_term

    const payload = form.isPM
      ? {
          stockId: form.stockId,
          renter: form.renter,
          borrower: form.borrower,
          loanType,
          loanDate: new Date().toISOString(),
          dueDate: form.dueDate,
        }
      : {
          productId: chosenNon!.productId,
          locationId: chosenNon!.locationId,
          quantity: form.qty, // backend expects `quantity`
          renter: form.renter,
          borrower: form.borrower,
          loanType,
          loanDate: new Date().toISOString(),
          dueDate: form.dueDate,
        };

    try {
      const res = await fetch("/api/rentals/rental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      mutate("/api/rentals/rental");
      alert(t.loanSuccess);
      setForm({ isPM: true, stockId: "", groupKey: "", qty: 1, renter: "", borrower: "", dueDate: "" });
      setOpen(false);
    } catch (e: any) {
      alert(t.loanFailed + (e?.message ? `: ${e.message}` : ""));
    }
  };

  return (
    <div className="max-w-screen-lg mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">📤 {t.title}</h2>

      {/* Loading / Error banners (no early return – keep hook order stable) */}
      {isLoading && <div className="p-4 text-gray-600">{t.loading}…</div>}
      {hasError && <div className="p-4 text-red-600">{t.loadFailed}</div>}

      {/* Stock Selector & Quantity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" ref={ref} aria-disabled={isLoading}>
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.stockItem}</label>
          <button
            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            onClick={() => setOpen((o) => !o)}
            disabled={isLoading || hasError}
          >
            <span className="text-left">
              {form.isPM
                ? chosenPM
                  ? `${chosenPM.name} ${chosenPM.model} @ ${chosenPM.locationLabelLink} (ID:${form.stockId})`
                  : t.selectStock
                : chosenNon
                ? `${chosenNon.name} ${chosenNon.model} @ ${chosenNon.locationLabelLink} (${t.remaining || "剩"} ${chosenNon.quantity})`
                : t.selectStock}
            </span>
            <span className="text-gray-500">▾</span>
          </button>

          {open && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-72 overflow-auto">
              <input
                className="w-full px-4 py-2 border-b border-gray-200 dark:border-gray-600 focus:outline-none bg-white dark:bg-gray-700"
                placeholder={t.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {/* Property-managed list */}
              {filteredPM.length > 0 && (
                <div className="px-4 py-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t.propertyManaged || "Property-managed"}
                </div>
              )}
              {filteredPM.map((i) => (
                <div
                  key={i.stockId}
                  className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                  onClick={() => {
                    setForm((f) => ({ ...f, isPM: true, stockId: i.stockId, groupKey: "", qty: 1 }));
                    setOpen(false);
                  }}
                >
                  {i.name} {i.model} @ {i.locationLabelLink} (ID:{i.stockId})
                </div>
              ))}

              {/* Non property-managed list */}
              {filteredNon.length > 0 && (
                <div className="px-4 py-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t.nonPropertyManaged || "Non property-managed"}
                </div>
              )}
              {filteredNon.map((g) => {
                const key = `${g.productId}-${g.locationId}`;
                return (
                  <div
                    key={key}
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                    onClick={() => {
                      setForm((f) => ({ ...f, isPM: false, stockId: "", groupKey: key, qty: 1 }));
                      setOpen(false);
                    }}
                  >
                    {g.name} {g.model} @ {g.locationLabelLink} ({t.remaining || "剩"} {g.quantity})
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.quantity}</label>
          {form.isPM ? (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400">
              {t.propertyManagedInfo}
            </div>
          ) : (
            <input
              type="number"
              min={1}
              max={availableQty}
              value={form.qty}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  qty: Math.max(1, Math.min(availableQty, parseInt(e.target.value, 10) || 1)),
                }))
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>
      </div>

      {/* Renter, Borrower & Due Date */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.renter}</label>
          <input
            type="text"
            value={form.renter}
            onChange={(e) => setForm((f) => ({ ...f, renter: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.borrower}</label>
          <input
            type="text"
            value={form.borrower}
            onChange={(e) => setForm((f) => ({ ...f, borrower: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.dueDate}</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={submit}
        disabled={
          isLoading ||
          hasError ||
          (form.isPM ? !form.stockId : !form.groupKey) ||
          !form.renter ||
          !form.borrower ||
          !form.dueDate ||
          (!form.isPM && availableQty < 1)
        }
        className="w-full md:w-auto py-3 px-6 bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-700 hover:from-indigo-600 hover:to-sky-600 text-white font-semibold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 group focus:outline-none focus:ring-2 focus:ring-indigo-400"
        title={t.confirmLoan}
      >
        <span aria-hidden className="text-lg">📤</span>
        <span className="hidden md:inline-block text-base font-medium tracking-wide">
          {t.confirmLoan}
        </span>
      </button>
    </div>
  );
}
