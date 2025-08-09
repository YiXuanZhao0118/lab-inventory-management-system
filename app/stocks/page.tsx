//app\stocks
"use client";

import { Suspense } from "react";
import StockList from "@/pages/StockList";

export default function StocksPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StockList />
    </Suspense>
  );
}
