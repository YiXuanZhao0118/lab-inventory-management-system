// app/add_inventory/page.tsx
import React, { Suspense } from 'react';
import AddStockPage from '@/pages/AddStockPage';

export default function AddInventoryPage() {
  return (
    <Suspense fallback={<div>Loading inventory form…</div>}>
      <AddStockPage />
    </Suspense>
  );
}
