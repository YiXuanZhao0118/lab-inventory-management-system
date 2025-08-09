// pages/admin/Product/EditModal.tsx
import React from "react";
import { ProductForm, AdminProduct } from "@/lib/db";

import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from '@/app/data/language/hi.json';
import deDE from '@/app/data/language/de.json';

export interface EditModalProps {
  edit: AdminProduct;
  draft: ProductForm;
  setDraft: React.Dispatch<React.SetStateAction<ProductForm>>;
  onClose: () => void;
  onSave: () => void;
}

export const EditModal: React.FC<EditModalProps> = ({
  edit, // 目前僅用來區分編輯哪筆，可依需求顯示 id 或其他資訊
  draft,
  setDraft,
  onClose,
  onSave,
}) => {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de": deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.Admin.EditModal;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded w-96 space-y-4">
        <h2 className="font-bold mb-2">{t.title}</h2>

        {([
          { key: "name", label: t.name },
          { key: "model", label: t.model },
          { key: "brand", label: t.brand },
          { key: "specifications", label: t.specifications },
          { key: "imageLink", label: t.imageLink },
        ] as const).map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm mb-1">{label}</label>
            <input
              className="w-full border rounded p-2"
              value={draft[key] ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [key]: e.target.value }))
              }
            />
          </div>
        ))}

        <div className="text-right space-x-2 pt-2">
          <button className="border px-4 py-1" onClick={onClose}>
            {t.cancel}
          </button>
          <button className="bg-green-600 text-white px-4 py-1" onClick={onSave}>
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
};
