// app/api/discarded/route.ts
import { NextResponse } from 'next/server'
import { getStock, saveStock, getProductById, StockItem } from '@/lib/db'

export async function POST(request: Request) {
  let payload: any[]
  try {
    payload = await request.json()
    if (!Array.isArray(payload)) throw { status: 400, message: 'Body must be an array' }
  } catch (e: any) {
    const status = e.status || 400
    return NextResponse.json({ error: e.message || 'Invalid JSON' }, { status })
  }

  const stockItems: StockItem[] = getStock()
  const now = new Date().toISOString()

  try {
    for (const item of payload) {
      if ('stockId' in item) {
        // property-managed single discard
        const { stockId, reason, operator } = item as {
          stockId: string
          reason: string
          operator: string
        }
        if (!stockId || !reason || !operator) throw { status: 400, message: 'Missing fields for single discard' }
        const stock = stockItems.find((s) => s.id === stockId)
        if (!stock) throw { status: 404, message: `Stock ${stockId} not found` }
        if (stock.discarded) throw { status: 400, message: `Stock ${stockId} already discarded` }
        stock.discarded = true
        stock.currentStatus = 'discarded' // update status
        stock.discardLog = { date: now, reason, operator }
      } else {
        // non-managed bulk discard
        const { productId, locationId, currentStatus, quantity, reason, operator } = item as {
          productId: string
          locationId: string
          currentStatus: 'in_stock' | 'short_term_rented' | 'long_term_rented'
          quantity: number
          reason: string
          operator: string
        }
        // validate fields including currentStatus
        if (
          !productId || !locationId ||
          !currentStatus || !['in_stock', 'short_term_rented', 'long_term_rented'].includes(currentStatus) ||
          typeof quantity !== 'number' || quantity < 1 ||
          !reason || !operator
        ) throw { status: 400, message: 'Missing or invalid fields for bulk discard (requires currentStatus)' }
        const product = getProductById(productId)
        if (!product || product.isPropertyManaged) throw { status: 400, message: 'Use single discard for managed products' }
        // find matching items
        const candidates = stockItems.filter(
          (s) =>
            s.productId === productId &&
            s.locationId === locationId &&
            s.currentStatus === currentStatus &&
            !s.discarded
        )
        if (candidates.length < quantity) throw { status: 400, message: `Not enough to discard: available ${candidates.length}` }
        for (let i = 0; i < quantity; i++) {
          const s = candidates[i]
          s.discarded = true
          s.currentStatus = 'discarded' // update status
          s.discardLog = { date: now, reason, operator }
        }
      }
    }
    saveStock(stockItems)
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (e: any) {
    const status = e.status || 500
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status })
  }
}
