// pages/admin/Product/AddProduct.tsx
"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { fetcher } from "@/services/apiClient";

type ProductItem = {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  imageLink: string;
  localImage: string | null;
  isPropertyManaged: boolean;
};

type ProductForm = {
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number | "";
  imageLink: string;
  isPropertyManaged: boolean;
};

export default function AddProductPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Admin.AddProduct;

  const [form, setForm] = useState<ProductForm>({
    name: "",
    brand: "",
    model: "",
    specifications: "",
    price: 0,
    imageLink: "",
    isPropertyManaged: false,
  });

  const { data: allProducts = [], mutate } = useSWR<ProductItem[]>("/api/products", fetcher);

  const canSubmit =
    form.name.trim() &&
    form.brand.trim() &&
    form.model.trim() &&
    form.specifications.trim() &&
    form.price !== "" &&
    Number(form.price) >= 0;

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalize = (s: string) => s.trim().toLowerCase();

  const handleAdd = async () => {
    if (!canSubmit) return;

    // duplicate check: brand + model
    const dup = allProducts.some(
      (p) => normalize(p.brand) === normalize(form.brand) && normalize(p.model) === normalize(form.model)
    );
    if (dup) {
      setMsg(t.addProduct_duplicate_error || "已有此產品");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand.trim(),
          model: form.model.trim(),
          specifications: form.specifications.trim(),
          price: Number(form.price) || 0,
          imageLink: form.imageLink.trim(),  // 後端會嘗試下載
          isPropertyManaged: !!form.isPropertyManaged,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Create failed");

      setMsg(
        json.localImage
          ? (t.addProduct_success_with_image ?? "新增成功（圖片已下載）")
          : (t.addProduct_success_no_image ?? "新增成功（圖片下載失敗，已設為 null）")
      );
      setForm({
        name: "",
        brand: "",
        model: "",
        specifications: "",
        price: 0,
        imageLink: "",
        isPropertyManaged: false,
      });
      mutate();
    } catch (e: any) {
      setMsg(e.message || (t.addProduct_fail ?? "新增失敗"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [msg]);

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 p-6 rounded-xl shadow">
      <h1 className="text-3xl font-bold mb-6">{t.title_product}</h1>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Field label={t.name} value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
        <Field label={t.model} value={form.model} onChange={(v) => setForm((s) => ({ ...s, model: v }))} />
        <Field label={t.brand} value={form.brand} onChange={(v) => setForm((s) => ({ ...s, brand: v }))} />
        <Field label={t.specifications} value={form.specifications} onChange={(v) => setForm((s) => ({ ...s, specifications: v }))} />

        <div>
          <label className="block text-sm mb-1">{t.price ?? "Price"}</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
            value={form.price}
            onChange={(e) =>
              setForm((s) => ({ ...s, price: e.target.value === "" ? "" : Number(e.target.value) }))
            }
          />
        </div>

        <Field
          label={t.imageLink}
          type="url"
          value={form.imageLink}
          onChange={(v) => setForm((s) => ({ ...s, imageLink: v }))}
          placeholder="https://example.com/image.jpg"
        />

        <div className="flex items-center gap-2">
          <input
            id="isPropertyManaged"
            type="checkbox"
            checked={form.isPropertyManaged}
            onChange={(e) => setForm((s) => ({ ...s, isPropertyManaged: e.target.checked }))}
          />
          <label htmlFor="isPropertyManaged" className="text-sm">
            {t.isPropertyManaged ?? "財產管理（個別建庫存）"}
          </label>
        </div>

        <p className="sm:col-span-2 text-xs text-gray-500">
          ※ 送出後後端會自動嘗試下載圖片至 <code>/public/product_images/&lt;id&gt;.&lt;ext&gt;</code>，失敗則把 <code>localImage</code> 設為 <code>null</code>。
        </p>
      </div>

      <button
        className="mt-2 bg-sky-600 hover:bg-sky-700 text-white px-6 py-2 rounded-md disabled:opacity-50"
        disabled={!canSubmit || loading}
        onClick={handleAdd}
      >
        {loading ? (t.loading ?? "Saving…") : (t.add_product ?? "Add product")}
      </button>

      {msg && <div className="mt-4 p-3 bg-green-100 text-green-800 rounded">{msg}</div>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number | "";
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <input
        type={type}
        className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
        value={value as any}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
