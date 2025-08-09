// pages/admin/Product/AddProduct.tsx
"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type ProductForm = {
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number | "";
  imageLink: string;
  localImage: string;
  isPropertyManaged: boolean;
};

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

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export default function AddProductPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Admin.AddProduct;

  const [productForm, setProductForm] = useState<ProductForm>({
    name: "",
    brand: "",
    model: "",
    specifications: "",
    price: 0,
    imageLink: "",
    localImage: "",
    isPropertyManaged: false,
  });

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 取得所有產品（用於重複檢查）
  const { data: allProducts = [] } = useSWR<ProductItem[]>("/api/products", fetcher);

  const canAddProduct =
    productForm.name.trim() !== "" &&
    productForm.model.trim() !== "" &&
    productForm.brand.trim() !== "" &&
    productForm.specifications.trim() !== "" &&
    productForm.price !== "" &&
    Number(productForm.price) >= 0;

  const normalize = (s: string) => s.trim().toLowerCase();

  const handleAdd = async () => {
    if (!canAddProduct) return;

    // 重複檢查（brand + model）
    const dup = allProducts.some(
      (p) =>
        normalize(p.brand) === normalize(productForm.brand) &&
        normalize(p.model) === normalize(productForm.model)
    );
    if (dup) {
      setMessage(t.addProduct_duplicate_error || "已有此產品");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: productForm.name.trim(),
        brand: productForm.brand.trim(),
        model: productForm.model.trim(),
        specifications: productForm.specifications.trim(),
        price: Number(productForm.price) || 0,
        imageLink: productForm.imageLink.trim(),
        localImage: productForm.localImage.trim() || null,
        isPropertyManaged: !!productForm.isPropertyManaged,
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || t.addProduct_fail);

      setMessage(t.addProduct_success);
      // 清空表單
      setProductForm({
        name: "",
        brand: "",
        model: "",
        specifications: "",
        price: 0,
        imageLink: "",
        localImage: "",
        isPropertyManaged: false,
      });
    } catch (err) {
      setMessage((err as Error).message || t.addProduct_fail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 p-6 rounded-xl shadow">
      <h1 className="text-3xl font-bold mb-6">{t.title_product}</h1>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {/* name */}
        <Field
          label={t.name}
          value={productForm.name}
          onChange={(v) => setProductForm((s) => ({ ...s, name: v }))}
        />
        {/* model */}
        <Field
          label={t.model}
          value={productForm.model}
          onChange={(v) => setProductForm((s) => ({ ...s, model: v }))}
        />
        {/* brand */}
        <Field
          label={t.brand}
          value={productForm.brand}
          onChange={(v) => setProductForm((s) => ({ ...s, brand: v }))}
        />
        {/* specifications */}
        <Field
          label={t.specifications}
          value={productForm.specifications}
          onChange={(v) => setProductForm((s) => ({ ...s, specifications: v }))}
        />
        {/* price */}
        <div>
          <label className="block text-sm mb-1">{t.price ?? "Price"}</label>
          <input
            type="number"
            min={0}
            step="1"
            className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
            value={productForm.price}
            onChange={(e) =>
              setProductForm((s) => ({ ...s, price: e.target.value === "" ? "" : Number(e.target.value) }))
            }
          />
        </div>
        {/* imageLink */}
        <Field
          label={t.imageLink}
          type="url"
          value={productForm.imageLink}
          onChange={(v) => setProductForm((s) => ({ ...s, imageLink: v }))}
        />
        {/* localImage */}
        <Field
          label={t.localImage ?? "Local image (optional)"}
          value={productForm.localImage}
          onChange={(v) => setProductForm((s) => ({ ...s, localImage: v }))}
          placeholder="/product_images/xxx.jpg"
        />
        {/* isPropertyManaged */}
        <div className="flex items-center gap-2">
          <input
            id="isPropertyManaged"
            type="checkbox"
            checked={productForm.isPropertyManaged}
            onChange={(e) => setProductForm((s) => ({ ...s, isPropertyManaged: e.target.checked }))}
          />
          <label htmlFor="isPropertyManaged" className="text-sm">
            {t.isPropertyManaged ?? "Property-managed (has individual stock records)"}
          </label>
        </div>
      </div>

      <button
        className="mt-4 bg-sky-600 hover:bg-sky-700 text-white px-6 py-2 rounded-md disabled:opacity-50"
        disabled={!canAddProduct || loading}
        onClick={handleAdd}
      >
        {loading ? (t.loading ?? "Saving…") : (t.add_product ?? "Add product")}
      </button>

      {message && (
        <div className="mt-4 p-3 bg-green-100 text-green-800 rounded">
          {message}
        </div>
      )}
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
  value: string;
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
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
