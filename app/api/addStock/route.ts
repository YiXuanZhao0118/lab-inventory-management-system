// app/api/addStock/route.ts
export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { addStockItem, getProductById } from '@/lib/db'

import {
  getProducts,
  getLocationTree,
} from '@/lib/db'

export async function GET() {
  const products = getProducts()
  const locations = getLocationTree()

  return NextResponse.json({
    products,
    locations,
  })
}


export async function POST(request: Request) {
  const { productId, locationId, quantity = 1 } = await request.json()

  const product = getProductById(productId)
  if (!product) {
    return NextResponse.json(
      { error: 'Product not found' },
      { status: 404 }
    )
  }

  if (product.isPropertyManaged && quantity > 1) {
    return NextResponse.json(
      { error: 'This product can only be added one at a time' },
      { status: 400 }
    )
  }

  const createdAt = new Date().toISOString()
  const newItems = []

  for (let i = 0; i < quantity; i++) {
    const item = addStockItem(productId, locationId, createdAt)
    newItems.push(item)
  }

  return NextResponse.json(newItems, { status: 201 })
}

