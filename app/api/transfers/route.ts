// app/api/transfers/route.ts
import { NextResponse } from 'next/server'
import {
  getStock,
  saveStock,
  getProductById,
  getTransferLogs,
  saveTransferLogs,
  StockItem,
  TransferLog
} from '@/lib/db'
import { v4 as uuid } from 'uuid'

// Helper to validate a single stock item
function validateStockItem(
  stockId: string,
  fromLocation: string,
  stockItems: StockItem[],
  errorPrefix: string
): StockItem {
  const stock = stockItems.find((s) => s.id === stockId)
  if (!stock) throw { status: 404, message: `${errorPrefix} ${stockId} not found` }
  if (stock.discarded) throw { status: 400, message: `${errorPrefix} ${stockId} is discarded` }
  if (stock.currentStatus !== 'in_stock')
    throw { status: 400, message: `${errorPrefix} ${stockId} is not in stock` }
  if (stock.locationId !== fromLocation)
    throw { status: 400, message: `${errorPrefix} ${stockId} is not at ${fromLocation}` }
  return stock
}

export async function POST(request: Request) {
  let transfers: any[]
  try {
    transfers = await request.json()
    if (!Array.isArray(transfers)) {
      throw { status: 400, message: 'Request body must be an array' }
    }
  } catch (err: any) {
    const status = err.status || 400
    console.error('Transfer error full:', err)
    return NextResponse.json(
      { error: err.message || 'Invalid JSON body' },
      { status }
    )
  }

  const stockItems: StockItem[] = getStock()
  let transferLogs: TransferLog[] = []
  try {
    transferLogs = getTransferLogs()
  } catch (err) {
    console.warn('No existing transfer logs or invalid JSON, initializing empty array.')
    transferLogs = []
  }
  const newLogs: TransferLog[] = []
  const now = new Date().toISOString()

  try {
    for (const item of transfers) {
      if ('stockId' in item) {
        // single transfer (property-managed)
        const { stockId, fromLocation, toLocation } = item as {
          stockId: string
          fromLocation: string
          toLocation: string
        }
        const stock = validateStockItem(stockId, fromLocation, stockItems, 'Stock')

        const product = getProductById(stock.productId)
        if (!product || !product.isPropertyManaged) {
          throw { status: 400, message: `Product ${stock.productId} is not property-managed` }
        }

        const logEntry: TransferLog = { id: uuid(), stockId, fromLocation, toLocation, date: now }
        newLogs.push(logEntry)
        stock.locationId = toLocation
      } else {
        // bulk transfer (non-property-managed)
        const { productId, quantity, fromLocation, toLocation } = item as {
          productId: string
          quantity: number
          fromLocation: string
          toLocation: string
        }
        if (!productId || typeof quantity !== 'number' || quantity < 1) {
          throw { status: 400, message: 'Invalid bulk transfer fields' }
        }

        const product = getProductById(productId)
        if (!product || product.isPropertyManaged) {
          throw { status: 400, message: `Product ${productId} invalid for bulk transfer` }
        }

        const candidates = stockItems.filter(
          (s) =>
            s.productId === productId &&
            s.locationId === fromLocation &&
            s.currentStatus === 'in_stock' &&
            !s.discarded
        )
        if (candidates.length < quantity) {
          throw { status: 400, message: `Not enough stock: requested ${quantity}, available ${candidates.length}` }
        }

        for (let i = 0; i < quantity; i++) {
          const s = candidates[i]
          const logEntry: TransferLog = { id: uuid(), stockId: s.id, fromLocation, toLocation, date: now }
          newLogs.push(logEntry)
          s.locationId = toLocation
        }
      }
    }

    saveStock(stockItems)
    saveTransferLogs([...transferLogs, ...newLogs])
    return NextResponse.json(newLogs, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    console.error('Transfer error:', err.message || err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
