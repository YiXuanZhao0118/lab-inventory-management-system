"use client";

import LoanForm from "@/features/LongTermRentedPage";
import ReturnPage from "@/features/LongTermReturnPage";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

export default function LoanAndReturnPage() {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (translationMap[language] || zhTW).LoanAndReturn.Page;

  return (
    <div className="">
      <section className="p-1 ">
        <LoanForm />
      </section>
      <section className="p-1">
        <ReturnPage />
      </section>
    </div>
  );
}
