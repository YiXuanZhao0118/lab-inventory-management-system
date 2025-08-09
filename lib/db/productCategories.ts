// lib/productCategories.ts
import fs from 'fs';
import path from 'path';

const PRODUCTCATEGORIES_PATH = path.resolve(process.cwd(), 'app/data/productCategories.json');

export interface ProductCategory {
  id: string;
  name: string;
  productIds: string[];
}

export function getProductCategories(): ProductCategory[] {
  const raw = fs.readFileSync(PRODUCTCATEGORIES_PATH, 'utf-8');
  return JSON.parse(raw) as ProductCategory[];
}

export function saveProductCategories(categories: ProductCategory[]): void {
  fs.writeFileSync(
    PRODUCTCATEGORIES_PATH,
    JSON.stringify(categories, null, 2),
    'utf-8'
  );
}