// pages/admin/Product/EditProducts.tsx
"use client";

import React, { useState, useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Product, ProductForm, AdminProduct } from "@/lib/db";

import { EditModal } from "./EditModal"; // 如果同層資料夾有 EditModal
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

export default function EditProducts() {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.Admin.EditProducts;

  const { mutate } = useSWRConfig();
  const { data: products, error } = useSWR<Product[]>(
    "/api/Related-to-data/products",
    fetcher
  );

  const adminProducts: AdminProduct[] = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    model: p.model,
    brand: p.brand,
    specifications: p.specifications,
    imageLink: p.imageLink ?? null,
    localImage: p.localImage ?? null,
  }));

  const normalize = (s: string) => s.trim().toLowerCase();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof ProductForm>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const filteredProducts = adminProducts
    .filter((p) =>
      ["name", "model", "brand", "specifications"].some((field) =>
        normalize(p[field as keyof ProductForm] ?? "").includes(
          normalize(search)
        )
      )
    )
    .sort((a, b) =>
      sortAsc
        ? String(a[sortField]).localeCompare(String(b[sortField]))
        : String(b[sortField]).localeCompare(String(a[sortField]))
    );

  // 編輯 modal 狀態
  const [edit, setEdit] = useState<AdminProduct | null>(null);
  const [draft, setDraft] = useState<ProductForm>({
    name: "",
    model: "",
    brand: "",
    specifications: "",
    imageLink: null,
    localImage: null,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [message]);

  const editProduct = async (id: string, product: ProductForm) => {
    const res = await fetch(`/api/Related-to-data/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });
    if (!res.ok) throw new Error("Failed to edit product");
    return res.json();
  };

  const saveEdit = async () => {
    if (!edit) return;
    if (
      adminProducts.some(
        (p) =>
          p.id !== edit.id &&
          p.model.trim().toLowerCase() === draft.model.trim().toLowerCase() &&
          p.brand.trim().toLowerCase() === draft.brand.trim().toLowerCase()
      )
    ) {
      setMessage(t.editProduct_duplicate_error);
      return;
    }
    try {
      await editProduct(edit.id, draft);
      mutate("/api/Related-to-data/products");
      setEdit(null);
      setMessage(t.editProduct_success);
    } catch {
      setMessage(t.editProduct_fail);
    }
  };

  const [productForm, setProductForm] = useState<ProductForm>({
    name: "",
    model: "",
    brand: "",
    specifications: "",
    imageLink: undefined,
    localImage: undefined,
  });

  const canAddProduct =
    productForm.name.trim() !== "" &&
    productForm.model.trim() !== "" &&
    productForm.brand.trim() !== "" &&
    productForm.specifications.trim() !== "";

  const handleAdd = async () => {
    if (!canAddProduct) return;
    setLoading(true);
    try {
      const res = await fetch("/api/Related-to-data/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productForm),
      });
      if (!res.ok) throw new Error(t.addProduct_fail);
      setMessage(t.addProduct_success);
      setProductForm({
        name: "",
        model: "",
        brand: "",
        specifications: "",
        imageLink: undefined,
        localImage: undefined,
      });
      await mutate("/api/Related-to-data/products");
    } catch (err) {
      setMessage(
        (err as Error).message || t.addProduct_fail
      );
    } finally {
      setLoading(false);
    }
  };

  if (error)
    return (
      <div className="p-4 text-red-600">
        {t.load_fail || "載入產品資料失敗，請稍後再試。"}
      </div>
    );

  if (!products) return <div className="p-4">{t.loading || "載入中..."}</div>;

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-4">✏️ {t.title}</h1>

      <input
        type="text"
        placeholder={t.search || "搜尋產品..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border p-2 rounded mb-4 w-full sm:w-1/2"
      />

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm table-fixed">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              {[
                { label: t.name, field: "name" },
                { label: t.model, field: "model" },
                { label: t.brand, field: "brand" },
                { label: t.specifications, field: "specifications" },
                { label: t.actions || "操作", field: null },
              ].map(({ label, field }) => (
                <th
                  key={label}
                  className={`px-4 py-2 text-left select-none cursor-pointer ${
                    label === (t.actions || "操作") ? "w-20" : ""
                  }`}
                  onClick={() => {
                    if (!field) return;
                    if (sortField === field) {
                      setSortAsc(!sortAsc);
                    } else {
                      setSortField(field as keyof ProductForm);
                      setSortAsc(true);
                    }
                  }}>
                  {label}
                  {field && sortField === field && (sortAsc ? " 🔼" : " 🔽")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.model}</td>
                <td className="px-4 py-2">{p.brand}</td>
                <td className="px-4 py-2">{p.specifications}</td>
                <td className="px-4 py-2 space-x-2 w-20">
                  <button
                    className="px-2 py-1 bg-blue-600 text-white rounded"
                    onClick={() => {
                      setEdit(p);
                      setDraft({
                        name: p.name,
                        model: p.model,
                        brand: p.brand,
                        specifications: p.specifications,
                        imageLink: p.imageLink,
                        localImage: p.localImage,
                      });
                    }}>
                    {t.edit || "編輯"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <EditModal
          edit={edit}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setEdit(null)}
          onSave={saveEdit}
        />
      )}

      {message && (
        <div className="mt-4 px-4 py-2 bg-green-100 text-green-800 rounded">
          {message}
        </div>
      )}
    </div>
  );
}
