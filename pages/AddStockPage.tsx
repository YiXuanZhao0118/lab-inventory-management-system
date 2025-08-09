//pages\admin\AllRentalStatuses\AllRentalStatuses.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import QRScanner from '@/components/QRScanner';
import { LocationPicker } from './LocationPicker';
import { LocationNode, ProductItem } from '@/lib/db';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from '@/app/data/language/hi.json';
import deDE from '@/app/data/language/de.json';
import { useSearchParams } from 'next/navigation';


// SWR fetcher
const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  });

export default function AddStockPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    'zh-TW': zhTW,
    'en-US': enUS,
    'hi-IN': hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).AddStock;

  // form and UI state
  const [form, setForm] = useState({ productId: '', locationId: '', qty: 1 });
  const [query, setQuery] = useState<string>('');
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [modalInfo, setModalInfo] = useState<any>(null);

  // get productId from URL if present
  const searchParams = useSearchParams();
  const initialId = searchParams?.get('productId') ?? '';
  useEffect(() => {
    if (initialId) {
      setQuery(initialId);
      setForm(f => ({ ...f, productId: initialId }));
    }
  }, [initialId]);

  // fetch products and locations
  const { data, error } = useSWR<{ products: ProductItem[]; locations: LocationNode[] }>(
    '/api/addStock',
    fetcher
  );

  const products = data?.products || [];
  const locationTree = data?.locations || [];

  // build id->label map
  const idMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    const walk = (nodes: LocationNode[]) => {
      nodes.forEach(n => {
        map[n.id] = n.label;
        if (n.children) walk(n.children);
      });
    };
    walk(locationTree);
    return map;
  }, [locationTree]);

  // filtered products
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p: ProductItem) =>
      [p.name, p.model, p.brand, p.specifications, p.id]
        .some(val => val.toLowerCase().includes(q))
    );
  }, [query, products]);

  // group by brand
  const groupedByBrand = useMemo(() => {
    const groups: Record<string, ProductItem[]> = {};
    filtered.forEach((p: ProductItem) => {
      const b = p.brand && p.brand !== '-' ? p.brand : '-';
      (groups[b] ||= []).push(p);
    });
    return groups;
  }, [filtered]);

  // sort brands
  const sortedBrands = useMemo(() => {
    const entries = Object.entries(groupedByBrand).filter(([b]) => b !== '-');
    entries.sort(([, a], [, b]) => b.length - a.length);
    const result = entries.map(([b]) => b);
    if (groupedByBrand['-']) result.push('-');
    return result;
  }, [groupedByBrand]);

  // selected product
  const selected = useMemo(
    () => products.find(p => p.id === form.productId),
    [form.productId, products]
  );

  // when selecting a product, auto qty=1 and disable if isPropertyManaged
  const handleSelectProduct = (p: ProductItem) => {
    setForm(f => ({
      ...f,
      productId: p.id,
      qty: p.isPropertyManaged ? 1 : f.qty,
    }));
  };

   // show modal on Add click
  const handleAddClick = () => {
    if (!form.productId || !form.locationId || form.qty < 1) return;
    setModalInfo({
      type: selected?.isPropertyManaged ? 'property' : 'normal',
      product: selected,
      location: idMap[form.locationId],
      qty: form.qty,
    });
    setShowModal(true);
  };

  // Confirm in modal -> real submit
  const handleConfirm = async () => {
    try {
      const res = await fetch('/api/addStock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          locationId: form.locationId,
          quantity: form.qty,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || res.statusText);
      setMessage(t.addSuccess);
      setTimeout(() => setMessage(null), 1500);
      // reset form
      setForm({ productId: '', locationId: '', qty: 1 });
      setQuery('');
    } catch (err: any) {
      alert(`${t.addFailed}: ${err.message}`);
    } finally {
      setShowModal(false);
    }
  };

  if (error) return <div className="p-4 text-red-600">{t.loadFailed}</div>;
  if (!data) return <div className="p-4 text-gray-600">{t.loading}…</div>;

  return (
    <div className="max-w-screen-lg mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">➕ {t.title}</h1>
      {message && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-100 dark:bg-green-800 text-green-900 dark:text-green-200 px-6 py-2 rounded-full shadow-md">
          {message}
        </div>
      )}

      {/* Search & Scanner */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <input
          type="text"
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button
          onClick={() => setScannerOpen(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-indigo-500">
          📷
        </button>
      </div>

      {scannerOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-lg w-full max-w-md">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t.scanTitle}</h3>
            <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden">
              <QRScanner
                onScan={code => { setQuery(code); setScannerOpen(false); }}
                onError={err => { alert(err.message); setScannerOpen(false); }}
              />
            </div>
            <button className="mt-4 text-sm text-red-500 hover:underline" onClick={() => setScannerOpen(false)}>{t.closeScanner}</button>
          </div>
        </div>
      )}

      {/* Product List */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.selectProduct}</label>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 max-h-64 overflow-y-auto">
          {sortedBrands.map(brand => (
            <React.Fragment key={brand}>
              <div className="px-4 py-1 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
                {brand === '-' ? 'unknown' : brand}
              </div>
              {groupedByBrand[brand].slice().sort((a, b) => (a.isPropertyManaged === b.isPropertyManaged
                ? a.name.localeCompare(b.name)
                : (a.isPropertyManaged ? 1 : 0) - (b.isPropertyManaged ? 1 : 0)))
                .map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 ${
                      form.productId === p.id ? 'bg-indigo-100 dark:bg-indigo-900' : ''
                    }`}>
                    {p.name} // {p.model}
                    {p.isPropertyManaged && (
                      <span className="ml-2 inline-block px-2 py-0.5 bg-blue-200 text-blue-800 text-xs font-semibold rounded">
                        {t.isPropertyManaged}
                      </span>
                    )}
                  </button>
              ))}
            </React.Fragment>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">{t.noMatch}</div>
          )}
        </div>
        {selected && (
          <p className="mt-1 text-sm text-green-600 dark:text-green-400">
            {selected.name} // {selected.model} // {selected.brand}
          </p>
        )}
      </div>

      {/* Location & Quantity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.selectLocation}</label>
          <LocationPicker value={form.locationId} onChange={loc => setForm(f => ({ ...f, locationId: loc }))} />
          {form.locationId && <p className="mt-1 text-sm text-green-600 dark:text-green-400">{idMap[form.locationId]}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.quantity}</label>
          <input
            type="number"
            min={1}
            disabled={!form.productId || selected?.isPropertyManaged}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            value={form.qty}
            onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) || 1 }))}
          />
          {selected?.isPropertyManaged}
        </div>
      </div>

       {/* Add Stock Button */}
      <button
        onClick={handleAddClick}
        disabled={!form.productId || !form.locationId || form.qty < 1}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {t.addStockButton}
      </button>

      {/* Modal */}
      {showModal && modalInfo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {modalInfo.type === 'property' ? t.modalPropertyTitle : t.modalNormalTitle}
            </h2>
            <p className="mb-2"><strong>{t.productLabel}:</strong> {modalInfo.product.name} // {modalInfo.product.model}</p>
            <p className="mb-2"><strong>{t.locationLabel}:</strong> {modalInfo.location}</p>
            {modalInfo.type === 'normal' && (
              <p className="mb-2"><strong>{t.quantityLabel}:</strong> {modalInfo.qty}</p>
            )}
            <div className="mt-4 flex justify-end space-x-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-300 rounded-lg">
                {t.cancel}
              </button>
              <button onClick={handleConfirm} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
