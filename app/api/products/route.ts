// app/api/products/route.ts
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  getProducts,
  saveProducts,
  type ProductItem,
} from "@/lib/db";

// GET: 全部產品
export async function GET() {
  const products = getProducts();
  return NextResponse.json(products);
}

// POST: 新增單一產品
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 基本驗證與整形
    const name = String(body.name ?? "").trim();
    const brand = String(body.brand ?? "").trim();
    const model = String(body.model ?? "").trim();
    const specifications = String(body.specifications ?? "").trim();
    const price = Number(body.price ?? 0);
    const imageLink = String(body.imageLink ?? "").trim();
    const localImageRaw = (body.localImage ?? "") as string | null;
    const localImage =
      localImageRaw && String(localImageRaw).trim() !== ""
        ? String(localImageRaw).trim()
        : null;
    const isPropertyManaged = Boolean(body.isPropertyManaged);

    if (!name || !brand || !model || !specifications) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (Number.isNaN(price) || price < 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }

    const list = getProducts();

    // 重複檢查：brand + model
    const normalize = (s: string) => s.trim().toLowerCase();
    const dup = list.some(
      (p) => normalize(p.brand) === normalize(brand) && normalize(p.model) === normalize(model)
    );
    if (dup) {
      return NextResponse.json(
        { error: "Product already exists (brand+model duplicate)" },
        { status: 409 }
      );
    }

    const item: ProductItem = {
      id: uuid(),
      name,
      brand,
      model,
      specifications,
      price,
      imageLink,
      localImage,
      isPropertyManaged,
    };

    const next = [...list, item];
    saveProducts(next);

    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
