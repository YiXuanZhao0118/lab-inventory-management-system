// pages/admin/Product/EditProperty.tsx
'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { GoArrowRight, GoArrowLeft } from 'react-icons/go';

import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

interface Product {
  id: string;
  name: string;
  model: string;
  brand: string;
  [key: string]: any; // Allow other properties as well
}

const PropertyManagementPage = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [propertyManagedProductIds, setPropertyManagedProductIds] = useState<string[]>([]);
  const [nonPropertyManagedProducts, setNonPropertyManagedProducts] = useState<Product[]>([]);
  const [propertyManagedProducts, setPropertyManagedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 新增搜尋狀態
  const [nonManagedSearch, setNonManagedSearch] = useState('');
  const [managedSearch, setManagedSearch] = useState('');

  // Use project's language context
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de": deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = (translations.Admin as any).EditProperty;

  // Removed useEffect for fetching translations
  // useEffect(() => { ... }, [currentLanguage]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/edit-property-managed-products');
        if (!response.ok) {
          throw new Error(`Error fetching data: ${response.statusText}`);
        }
        const data = await response.json();
        setAllProducts(data.products);
        setPropertyManagedProductIds(data.propertyManagedProductIds);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const nonManaged = allProducts.filter(
      product => !propertyManagedProductIds.includes(product.id)
    );
    const managed = allProducts.filter(
      product => propertyManagedProductIds.includes(product.id)
    );
    setNonPropertyManagedProducts(nonManaged);
    setPropertyManagedProducts(managed);
  }, [allProducts, propertyManagedProductIds]);

  // 使用 useMemo 過濾產品列表
  const filteredNonManagedProducts = useMemo(() => {
    const query = nonManagedSearch.toLowerCase();
    return nonPropertyManagedProducts.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.model.toLowerCase().includes(query) ||
      product.brand.toLowerCase().includes(query)
    );
  }, [nonPropertyManagedProducts, nonManagedSearch]);

  const filteredPropertyManagedProducts = useMemo(() => {
    const query = managedSearch.toLowerCase();
    return propertyManagedProducts.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.model.toLowerCase().includes(query) ||
      product.brand.toLowerCase().includes(query)
    );
  }, [propertyManagedProducts, managedSearch]);

  const updateDatabase = async (updatedIds: string[]) => {
    try {
      const response = await fetch('/api/edit-property-managed-products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ propertyManagedProductIds: updatedIds }),
      });

      if (!response.ok) {
        throw new Error(`Error updating database: ${response.statusText}`);
      }

      // Update local state after successful database update
      setPropertyManagedProductIds(updatedIds);

    } catch (err: any) {
      console.error('Failed to update database:', err);
      alert('Failed to update database.');
    }
  };

  const handleMoveToManaged = (productId: string) => {
    const updatedIds = [...propertyManagedProductIds, productId];
    updateDatabase(updatedIds);
  };

  const handleMoveToNonManaged = (productId: string) => {
    const updatedIds = propertyManagedProductIds.filter(id => id !== productId);
    updateDatabase(updatedIds);
  };

  // Removed handleLanguageChange
  // const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => { ... };

  if (loading) {
    // Use translation key for loading
    return <div className="container mx-auto p-4">{t.loading}</div>;
  }

  if (error) {
    // Use translation key for error
    return <div className="container mx-auto p-4 text-red-500">{t.error}{error}</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-900 w-full h-full">
      <div className="flex flex-col h-full p-4 max-h-[calc(100vh - 3.5rem - 3rem)] overflow-y-auto">
        <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <span className="text-xl">🔧</span>{t.pageTitle}
        </h1>
        <div className="grid grid-cols-2 gap-8 flex-grow overflow-hidden">
          <div className="flex flex-col h-screen">
            <h2 className="text-xl font-semibold mb-2">{t.nonManagedTitle}</h2>
            {/* 非財產管理產品搜尋欄 */}
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className="border p-2 rounded-md mb-4"
              value={nonManagedSearch}
              onChange={(e) => setNonManagedSearch(e.target.value)}
            />
            {/* 移除 h-64，添加 flex-grow overflow-y-auto 讓列表填滿並滾動 */}
            <div className="border p-4 flex-grow overflow-y-auto">
              {filteredNonManagedProducts.map(product => ( // 使用過濾後的列表
                <div key={product.id} className="flex justify-between items-center mb-2 p-2 border-b">
                  <div>
                    {/* Use translation keys for product details */}
                    <p>{t.productName}: {product.name}</p>
                    <p>{t.productModel}: {product.model}</p>
                    <p>{t.productBrand}: {product.brand}</p>
                  </div>
                  <button
                    onClick={() => handleMoveToManaged(product.id)}
                    className="bg-blue-500 text-white px-2 py-1 rounded"
                  >
                    <GoArrowRight />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold mb-2">{t.managedTitle}</h2>
             {/* 財產管理產品搜尋欄 */}
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className="border p-2 rounded-md mb-4"
              value={managedSearch}
              onChange={(e) => setManagedSearch(e.target.value)}
            />
            <div className="border p-4 flex-grow overflow-y-auto">
              {filteredPropertyManagedProducts.map(product => ( // 使用過濾後的列表
                <div key={product.id} className="flex justify-between items-center mb-2 p-2 border-b">
                  <div>
                    <p>{t.productName}: {product.name}</p>
                    <p>{t.productModel}: {product.model}</p>
                    <p>{t.productBrand}: {product.brand}</p>
                  </div>
                  <button
                    onClick={() => handleMoveToNonManaged(product.id)}
                    className="bg-red-500 text-white px-2 py-1 rounded"
                  >
                    <GoArrowLeft />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyManagementPage;
