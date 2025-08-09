// pages/admin/productCategories/productCategories.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { GoArrowRight, GoArrowLeft } from "react-icons/go";
import { IoChevronDown, IoChevronForward } from "react-icons/io5";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

interface Product {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications?: string;
}
interface Category {
  id: string;
  name: string;
  productIds: string[];
}

export default function ProductCategoriesPage() {
  const [categoryName, setCategoryName] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editProductIds, setEditProductIds] = useState<string[]>([]);
  const [searchAll, setSearchAll] = useState("");
  const [searchCat, setSearchCat] = useState("");
  const [addProductSearch, setAddProductSearch] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const [isAddFormExpanded, setIsAddFormExpanded] = useState(true);
  const [selectedCategoryToCopy, setSelectedCategoryToCopy] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [originalCategory, setOriginalCategory] = useState<Category | null>(
    null
  );

  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.productCategories;
  const tProduct = translations.Product;

  // 一次取得 products + categories
  useEffect(() => {
    fetch("/api/Related-to-data/product-categories")
      .then((res) => res.json())
      .then(({ products, productCategories }) => {
        setProducts(products);
        setCategories(productCategories);
      })
      .catch((err) => console.error(err));
  }, []);

  // 新增分類
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName) {
      setMessage(t.nameRequired);
      return;
    }
    if (categories.some((c) => c.name === categoryName)) {
      setMessage(t.duplicateNameError);
      return;
    }
    const res = await fetch("/api/Related-to-data/product-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: categoryName,
        productIds: selectedProductIds,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setCategories((prev) => [...prev, created]);
      setCategoryName("");
      setSelectedProductIds([]);
      setMessage(t.addSuccess);
      setTimeout(() => {
        setMessage("");
      }, 1000);
    } else {
      setMessage(t.addFailed);
    }
  };

  // 選擇要從哪個分類複製產品（新增表單用）
  const handleCategorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setSelectedCategoryToCopy(selectedId);
    if (selectedId === "") {
      setSelectedProductIds([]);
      return;
    }
    const selectedCategory = categories.find((c) => c.id === selectedId);
    if (selectedCategory) {
      setSelectedProductIds([...selectedCategory.productIds]);
    }
  };

  // 編輯時匯入另一分類的產品（編輯表單用）
  const handleImportFromCategory = (categoryId: string) => {
    if (!categoryId) return;
    const sourceCategory = categories.find((c) => c.id === categoryId);
    if (!sourceCategory) return;

    // 過濾掉已經存在的
    const newIds = sourceCategory.productIds.filter(
      (id) => !editProductIds.includes(id)
    );
    if (newIds.length === 0) {
      setMessage(t.noNewProducts);
      return;
    }
    setEditProductIds((prev) => [...prev, ...newIds]);
    setMessage(t.productsImported.replace("{count}", String(newIds.length)));
  };

  // 編輯開始
  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditProductIds([...cat.productIds]);
    setOriginalCategory(cat);
    setSearchAll("");
    setSearchCat("");
    setShowChanges(false);
  };

  // 編輯取消
  const cancelEdit = () => {
    setShowChanges(false);
    setEditingId(null);
    setEditName("");
    setEditProductIds([]);
    setOriginalCategory(null);
  };

  // 儲存編輯
  const saveEdit = async () => {
    if (!editName) {
      setMessage(t.nameRequired);
      return;
    }
    if (
      editName !== originalCategory?.name &&
      categories.some((c) => c.name === editName && c.id !== editingId)
    ) {
      setMessage(t.duplicateNameError);
      return;
    }
    if (!showChanges) {
      setShowChanges(true);
      return;
    }
    const updated = {
      id: editingId!,
      name: editName,
      productIds: editProductIds,
    };
    const res = await fetch("/api/Related-to-data/product-categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setCategories((prev) =>
        prev.map((c) => (c.id === editingId ? updated : c))
      );
      setMessage(t.updateSuccess);
      cancelEdit();
    } else {
      setMessage(t.updateFailed);
    }
  };

  // 刪除分類
  const removeCategory = async (id: string) => {
    if (!window.confirm(t.removeConfirm)) return;
    const res = await fetch("/api/Related-to-data/product-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setMessage(t.removeSuccess);
    } else {
      setMessage(t.removeFailed);
    }
  };

  // 移動產品：加入編輯分類
  const moveToCat = (id: string) => {
    if (!editProductIds.includes(id)) {
      setEditProductIds((prev) => [...prev, id]);
    }
  };
  // 移動產品：移出編輯分類
  const moveToAll = (id: string) => {
    setEditProductIds((prev) => prev.filter((pid) => pid !== id));
  };

  // 新增表單：加入選擇產品
  const addToSelection = (id: string) => {
    if (!selectedProductIds.includes(id)) {
      setSelectedProductIds((prev) => [...prev, id]);
    }
  };
  // 新增表單：移除選擇產品
  const removeFromSelection = (id: string) => {
    setSelectedProductIds((prev) => prev.filter((pid) => pid !== id));
  };

  // 計算編輯中的差異（用 useMemo 做快取）
  const computeChangesMemo = useMemo(() => {
    if (!originalCategory || !editingId) return null;

    const addedIds = editProductIds.filter(
      (id) => !originalCategory.productIds.includes(id)
    );
    const removedIds = originalCategory.productIds.filter(
      (id) => !editProductIds.includes(id)
    );
    const addedProducts = products.filter((p) => addedIds.includes(p.id));
    const removedProducts = products.filter((p) => removedIds.includes(p.id));
    const nameChanged = originalCategory.name !== editName;
    const hasDuplicateName =
      nameChanged &&
      categories.some((c) => c.name === editName && c.id !== editingId);

    return {
      nameChanged,
      hasDuplicateName,
      original: originalCategory.name,
      new: editName,
      addedProducts,
      removedProducts,
      hasChanges:
        nameChanged || addedProducts.length > 0 || removedProducts.length > 0,
    };
  }, [
    editingId,
    editName,
    editProductIds,
    originalCategory,
    products,
    categories,
  ]);

  // 差異顯示組件
  const renderChanges = () => {
    const changes = computeChangesMemo;
    if (!changes || !changes.hasChanges) {
      return <div className="text-gray-500 italic">{t.noChanges}</div>;
    }
    if (changes.hasDuplicateName) {
      return (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900 rounded border border-red-500">
          <h4 className="font-bold mb-2 text-red-600">
            {t.duplicateNameError}
          </h4>
        </div>
      );
    }
    return (
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border">
        <h4 className="font-bold mb-2">{t.changes}</h4>
        {changes.nameChanged && (
          <div className="mb-3">
            <div className="text-gray-600 dark:text-gray-400">
              {t.beforeEdit}: {changes.original}
            </div>
            <div className="text-blue-600 dark:text-blue-400">
              {t.afterEdit}: {changes.new}
            </div>
          </div>
        )}
        {changes.addedProducts.length > 0 && (
          <div className="mb-3">
            <div className="font-semibold text-green-600">
              {t.addedProducts}:
            </div>
            {changes.addedProducts.map((p) => (
              <div key={p.id} className="ml-4">
                • {p.name} ({p.model})
              </div>
            ))}
          </div>
        )}
        {changes.removedProducts.length > 0 && (
          <div className="mb-3">
            <div className="font-semibold text-red-600">
              {t.removedProducts}:
            </div>
            {changes.removedProducts.map((p) => (
              <div key={p.id} className="ml-4">
                • {p.name} ({p.model})
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 篩選資料區段
  const allNotInCat = products.filter(
    (p) =>
      !editProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(searchAll.toLowerCase()) ||
        p.model?.toLowerCase().includes(searchAll.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchAll.toLowerCase()) ||
        p.specifications?.toLowerCase().includes(searchAll.toLowerCase()))
  );
  const inCat = products.filter(
    (p) =>
      editProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(searchCat.toLowerCase()) ||
        p.model?.toLowerCase().includes(searchCat.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchCat.toLowerCase()) ||
        p.specifications?.toLowerCase().includes(searchCat.toLowerCase()))
  );
  const filteredProducts = products.filter(
    (p) =>
      !selectedProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(addProductSearch.toLowerCase()) ||
        p.model?.toLowerCase().includes(addProductSearch.toLowerCase()) ||
        p.brand?.toLowerCase().includes(addProductSearch.toLowerCase()) ||
        p.specifications
          ?.toLowerCase()
          .includes(addProductSearch.toLowerCase()))
  );
  const selectedProducts = products.filter(
    (p) =>
      selectedProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(selectedSearch.toLowerCase()) ||
        p.model?.toLowerCase().includes(selectedSearch.toLowerCase()) ||
        p.brand?.toLowerCase().includes(selectedSearch.toLowerCase()) ||
        p.specifications?.toLowerCase().includes(selectedSearch.toLowerCase()))
  );

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-xl">📁</span>
        {t.pageTitle}
      </h1>

      {/* 新增分類區塊 */}
      <div className="mb-8">
        <div
          className="flex items-center cursor-pointer bg-white dark:bg-gray-800 p-4 rounded-t border-b border-blue-200 dark:border-gray-600 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200"
          onClick={() => setIsAddFormExpanded(!isAddFormExpanded)}>
          <span className="mr-3 text-blue-500 dark:text-blue-400">
            {isAddFormExpanded ? (
              <IoChevronDown size={20} />
            ) : (
              <IoChevronForward size={20} />
            )}
          </span>
          <span className="font-semibold text-lg text-gray-700 dark:text-gray-200">
            {t.addCategory}
          </span>
        </div>

        {isAddFormExpanded && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b p-6 shadow-lg">
            <form onSubmit={handleAddCategory}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t.categoryName}
                </label>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
                  {t.categoryNamePlaceholder}
                </div>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder={t.categoryNamePlaceholder}
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t.copyFromExisting}
                </label>
                <select
                  value={selectedCategoryToCopy}
                  onChange={handleCategorySelect}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white appearance-none">
                  <option value="">{t.selectSourceCategory}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t.selectProducts}
                </label>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2 flex justify-between">
                      <span>{t.availableProducts}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {filteredProducts.length} items
                      </span>
                    </div>
                    <input
                      type="text"
                      value={addProductSearch}
                      onChange={(e) => setAddProductSearch(e.target.value)}
                      placeholder={tProduct.search_placeholder}
                      className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <div className="border border-gray-200 dark:border-gray-600 rounded-lg h-[400px] overflow-y-auto bg-white dark:bg-gray-700 shadow-inner">
                      {filteredProducts.length > 0 ? (
                        filteredProducts.map((p) => (
                          <div
                            key={p.id}
                            className="flex justify-between items-center border-b border-gray-200 dark:border-gray-600 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-150">
                            <div className="flex-1 min-w-0">
                              <b>{p.name}</b>
                              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                                {p.model && <span>{p.model}</span>}
                                {p.brand && <span>•</span>}
                                {p.brand && <span>{p.brand}</span>}
                                {p.specifications && <span>•</span>}
                                {p.specifications && (
                                  <span>{p.specifications}</span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => addToSelection(p.id)}
                              className="ml-4 p-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-full transition-colors duration-150">
                              <GoArrowRight size={20} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-400 p-2">
                          {tProduct.no_matching_products}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2 flex justify-between">
                      <span>{t.categoryProducts}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedProducts.length} items
                      </span>
                    </div>
                    <input
                      type="text"
                      value={selectedSearch}
                      onChange={(e) => setSelectedSearch(e.target.value)}
                      placeholder={tProduct.search_placeholder}
                      className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <div className="border border-gray-200 dark:border-gray-600 rounded-lg h-[400px] overflow-y-auto bg-white dark:bg-gray-700 shadow-inner">
                      {selectedProducts.length > 0 ? (
                        selectedProducts.map((p) => (
                          <div
                            key={p.id}
                            className="flex justify-between items-center border-b border-gray-200 dark:border-gray-600 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-150">
                            <span>
                              <b>{p.name}</b>
                              <span className="ml-2 text-gray-500">
                                {p.model}
                              </span>
                              <span className="ml-2 text-gray-500">
                                {p.brand}
                              </span>
                              <span className="ml-2 text-gray-500">
                                {p.specifications}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFromSelection(p.id)}
                              className="ml-4 p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-full transition-colors duration-150">
                              <GoArrowLeft />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-400 p-2">
                          {tProduct.no_matching_products}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                {t.addCategory}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 訊息 */}
      {message && <div className="text-green-600 mb-4">{message}</div>}

      {/* 既有分類 */}
      <h3 className="text-xl font-semibold mb-2">{t.existingCategories}</h3>
      <div className="space-y-6">
        {categories.length === 0 && <div>{t.noCategories}</div>}
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="border rounded p-4 bg-gray-50 dark:bg-gray-800">
            {editingId === cat.id ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <label>{t.categoryName}:</label>
                  <input
                    className="border p-1 rounded w-1/2"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t.categoryNamePlaceholder}
                    disabled={showChanges}
                  />
                </div>
                {!showChanges && (
                  <div className="mb-4">
                    <label>{t.importFromCategory}:</label>
                    <select
                      className="ml-2 px-2 py-1 border rounded"
                      onChange={(e) => handleImportFromCategory(e.target.value)}
                      value="">
                      <option value="">{t.selectSourceCategory}</option>
                      {categories
                        .filter((c) => c.id !== editingId)
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {!showChanges ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-semibold mb-1">
                          {t.availableProducts}
                        </div>
                        <input
                          className="border p-1 rounded w-full mb-2"
                          placeholder={tProduct.search_placeholder}
                          value={searchAll}
                          onChange={(e) => setSearchAll(e.target.value)}
                        />
                        <div className="border border-gray-200 dark:border-gray-600 rounded-lg h-[400px] overflow-y-auto bg-white dark:bg-gray-700 shadow-inner">
                          {allNotInCat.length > 0 ? (
                            allNotInCat.map((p) => (
                              <div
                                key={p.id}
                                className="flex justify-between items-center border-b border-gray-200 dark:border-gray-600 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-150">
                                <span>
                                  <b>{p.name}</b>
                                  <span className="ml-2 text-gray-500">
                                    {p.model}
                                  </span>
                                  <span className="ml-2 text-gray-500">
                                    {p.brand}
                                  </span>
                                  <span className="ml-2 text-gray-500">
                                    {p.specifications}
                                  </span>
                                </span>
                                <button
                                  className="ml-4 p-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-full transition-colors duration-150"
                                  type="button"
                                  onClick={() => moveToCat(p.id)}>
                                  <GoArrowRight />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 p-2">
                              {tProduct.no_matching_products}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold mb-1">
                          {t.categoryProducts}
                        </div>
                        <input
                          className="border p-1 rounded w-full mb-2"
                          placeholder={tProduct.search_placeholder}
                          value={searchCat}
                          onChange={(e) => setSearchCat(e.target.value)}
                        />
                        <div className="border border-gray-200 dark:border-gray-600 rounded-lg h-[400px] overflow-y-auto bg-white dark:bg-gray-700 shadow-inner">
                          {inCat.length > 0 ? (
                            inCat.map((p) => (
                              <div
                                key={p.id}
                                className="flex justify-between items-center border-b border-gray-200 dark:border-gray-600 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-150">
                                <span>
                                  <b>{p.name}</b>
                                  <span className="ml-2 text-gray-500">
                                    {p.model}
                                  </span>
                                  <span className="ml-2 text-gray-500">
                                    {p.brand}
                                  </span>
                                  <span className="ml-2 text-gray-500">
                                    {p.specifications}
                                  </span>
                                </span>
                                <button
                                  className="ml-4 p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-full transition-colors duration-150"
                                  type="button"
                                  onClick={() => moveToAll(p.id)}>
                                  <GoArrowLeft />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 p-2">
                              {tProduct.no_matching_products}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700"
                        type="button"
                        onClick={saveEdit}>
                        {t.save}
                      </button>
                      <button
                        className="bg-gray-400 text-white px-4 py-1 rounded hover:bg-gray-500"
                        type="button"
                        onClick={cancelEdit}>
                        {t.cancel}
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    {renderChanges()}
                    <div className="mt-4 text-center font-semibold">
                      {t.confirmSave}
                    </div>
                    <div className="mt-4 flex gap-2 justify-center">
                      <button
                        className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700"
                        type="button"
                        onClick={saveEdit}>
                        {t.save}
                      </button>
                      <button
                        className="bg-gray-400 text-white px-4 py-1 rounded hover:bg-gray-500"
                        type="button"
                        onClick={() => setShowChanges(false)}>
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <b>{cat.name}</b>: {cat.productIds.length} {t.items}
                </div>
                <div>
                  <button
                    className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                    type="button"
                    onClick={() => startEdit(cat)}>
                    {t.edit}
                  </button>
                  <button
                    className="bg-red-500 text-white px-3 py-1 rounded ml-2 hover:bg-red-600"
                    type="button"
                    onClick={() => removeCategory(cat.id)}>
                    {t.remove}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
