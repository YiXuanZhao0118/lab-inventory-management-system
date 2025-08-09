"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import Fuse from "fuse.js";
import { fetcher } from "@/services/apiClient";
import QRScanner from "@/components/QRScanner";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import Upload from "./Upload";
import ViewSpec from "./ViewSpec";

export interface ProductLiteWithLocal {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications: string;
  imageLink: string;
  localImage?: string;
}

function isValidImageLink(link?: string) {
  return !!link && /^(https?:\/\/|\/)\S+/.test(link);
}

function ProductCard({
  p,
  onContextMenu,
}: {
  p: ProductLiteWithLocal;
  onContextMenu: (
    e: React.MouseEvent | React.TouchEvent,
    productId: string
  ) => void;
}) {
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).Product;
  const [imgError, setImgError] = useState(false);
  const [srcIdx, setSrcIdx] = useState(0);
  const [specOpen, setSpecOpen] = useState(false);
  const sources = [p.localImage, p.imageLink].filter(isValidImageLink) as string[];

  const handleError = () => {
    if (srcIdx < sources.length - 1) setSrcIdx(srcIdx + 1);
    else setImgError(true);
  };

  // 禁用 iOS 長按預設選單
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (el) {
      el.style.setProperty("-webkit-touch-callout", "none");
      el.style.setProperty("-webkit-user-select", "none");
      el.style.setProperty("user-select", "none");
    }
  }, []);

  let touchTimeout: ReturnType<typeof setTimeout>;
  const handleTouchStart = (e: React.TouchEvent) => {
    touchTimeout = setTimeout(() => onContextMenu(e, p.id), 600);
  };
  const handleTouchEnd = () => clearTimeout(touchTimeout);

  return (
    <div
      ref={cardRef}
      className="bg-gray-50 dark:bg-gray-800 rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-colors duration-200"
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, p.id);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="relative w-full h-48 md:h-56 lg:h-64 bg-white">
        {!imgError && sources.length > 0 ? (
          <img
            src={sources[srcIdx]}
            alt={p.name}
            className="w-full h-full object-contain"
            onError={handleError}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-gray-400">
            {t.no_image}
          </div>
        )}
        <button
          className="absolute top-2 left-2 bg-indigo-600 text-white w-8 h-8 flex items-center justify-center rounded-full opacity-80 hover:opacity-100 transition text-base"
          onClick={() => setSpecOpen(true)}
          title={t.view_spec}
        >
          📄
        </button>
        <Upload productId={p.id} />
      </div>
      <div className="p-4 space-y-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
          {p.name}
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t.model}: {p.model}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t.brand}: {p.brand}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
          {t.specifications}: {p.specifications}
        </p>
      </div>
      {specOpen && <ViewSpec productId={p.id} onClose={() => setSpecOpen(false)} />}
    </div>
  );
}

export default function ProductGallery() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const translations = tMap[language] || zhTW;
  const t = translations.Product as typeof zhTW["Product"];
  const pg = translations.ProductGallery;
  const router = useRouter();

  // ★ 所有 Hook 必須在組件最上層、早期返回之前呼叫
  const { data, error } = useSWR<{
    products: ProductLiteWithLocal[];
    productCategories: { id: string; name: string; productIds: string[] }[];
  }>(
    "/api/Related-to-data/product-categories",
    fetcher
  );

  const products = data?.products ?? [];
  const categories = data?.productCategories ?? [];

  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: ["name", "model", "brand", "specifications", "id"],
        threshold: 0.3,
      }),
    [products]
  );
  const [query, setQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const byQuery = query ? fuse.search(query).map((r) => r.item) : products;
    if (selectedCategories.length === 0) return byQuery;
    const idSet = new Set<string>();
    categories.forEach((c) => {
      if (selectedCategories.includes(c.id)) {
        c.productIds.forEach((pid) => idSet.add(pid));
      }
    });
    return byQuery.filter((p) => idSet.has(p.id));
  }, [query, fuse, products, categories, selectedCategories]);

  const groupedByBrand = useMemo(() => {
    const groups: Record<string, ProductLiteWithLocal[]> = {};
    filtered.forEach((p) => {
      const b = p.brand && p.brand !== "-" ? p.brand : "-";
      (groups[b] ||= []).push(p);
    });
    return groups;
  }, [filtered]);

  const sortedBrands = useMemo(
    () =>
      Object.entries(groupedByBrand)
        .filter(([brand]) => brand !== "-")
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([brand]) => brand),
    [groupedByBrand]
  );

  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);

  const handleContext = (
    e: React.MouseEvent | React.TouchEvent,
    id: string
  ) => {
    e.preventDefault();
    const { pageX: x, pageY: y } =
      "pageX" in e ? e : (e as any).touches[0];
    setCtxMenu({ x, y, id });
  };

  const navigateTo = (path: string) => {
    if (!ctxMenu) return;
    router.push(`${path}?productId=${ctxMenu.id}`);
    setCtxMenu(null);
  };

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // ★ 錯誤／載入提示必須在這裡：所有 Hook 呼叫完成後
  if (error) return <div className="p-4 text-red-600">{t.loading_failed}</div>;
  if (!data) return <div className="p-4 text-gray-600">{t.loading}…</div>;

  return (
    <div className="max-w-screen mx-auto p-4 md:p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-lg space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
        📑 {t.title}
      </h1>

      {/* Search & Scanner */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <input
          type="text"
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          placeholder={pg.search_placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={() => setScannerOpen(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          📷
        </button>
      </div>
      {scannerOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-lg w-full max-w-md">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {pg.scanTitle}
            </h3>
            <div className="h-64 bg-black rounded-lg overflow-hidden">
              <QRScanner
                onScan={(code) => {
                  setQuery(code);
                  setScannerOpen(false);
                }}
                onError={(err) => {
                  alert(err.message);
                  setScannerOpen(false);
                }}
              />
            </div>
            <button
              className="mt-4 text-sm text-red-500 hover:underline"
              onClick={() => setScannerOpen(false)}
            >
              {pg.closeScanner}
            </button>
          </div>
        </div>
      )}

      {/* Filter Categories */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        <span className="font-medium text-gray-800 dark:text-gray-200">
        </span>
        <div className="flex flex-wrap gap-2">
          {categories
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <label key={c.id} className="inline-flex items-center space-x-1">
                <input
                  type="checkbox"
                  value={c.id}
                  checked={selectedCategories.includes(c.id)}
                  onChange={() => {
                    if (selectedCategories.includes(c.id)) {
                      setSelectedCategories(
                        selectedCategories.filter((id) => id !== c.id)
                      );
                    } else {
                      setSelectedCategories([...selectedCategories, c.id]);
                    }
                  }}
                  className="form-checkbox h-4 w-4 text-indigo-600"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  {c.name}
                </span>
              </label>
            ))}
        </div>
      </div>

      {/* Group By Brand */}
      {sortedBrands.map((brandName) => (
        <section key={brandName}>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            {brandName}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {groupedByBrand[brandName]
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <ProductCard key={p.id} p={p} onContextMenu={handleContext} />
              ))}
          </div>
        </section>
      ))}

      {/* Unknown Brand */}
      {groupedByBrand["-"] && (
        <section>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            {pg.unknown|| "Unknown Brand"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {groupedByBrand["-"]
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <ProductCard key={p.id} p={p} onContextMenu={handleContext} />
              ))}
          </div>
        </section>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <div
          className="absolute bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => setQuery(ctxMenu.id)}
          >
            {pg.products_overview}
          </button>
          <button
            className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => navigateTo("/add_inventory")}
          >
            {pg.add_inventory}
          </button>
          <button
            className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => navigateTo("/stocks")}
          >
            {pg.stocks}
          </button>
        </div>
      )}
    </div>
  );
}
