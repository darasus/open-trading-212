import { sql } from 'drizzle-orm'
import type { ValuePoint } from '../shared/ipc'
import { getDb } from './db'

/**
 * Account value per day, reconstructed from what Trading 212 gives us. There is no
 * historical value endpoint, so:
 *
 * - Days with a sync snapshot use the snapshot's real total.
 * - Every other day is an estimate: holdings are rebuilt by replaying fills, cash by
 *   replaying every cash movement, and each instrument is priced by interpolating between
 *   the prices we know for it, which are its fills and today's position price.
 * - "Paid in" (net deposits) is exact, straight from deposits and withdrawals.
 *
 * All prices are per share in the account currency, derived from what the fill cost
 * (net amount / quantity), so instrument currencies and GBX never need converting.
 */

const DAY = 86_400_000

function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function endOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

type Fill = { ticker: string; delta: number; amountCents: number; at: number }
type CashEvent = { amountCents: number; deposit: number; at: number }
type PricePoint = { at: number; cents: number }

/** Price per share at `at`, linear between known points and flat beyond the ends. */
export function priceAt(points: PricePoint[], at: number): number | null {
  if (points.length === 0) return null
  if (at <= points[0].at) return points[0].cents
  const last = points[points.length - 1]
  if (at >= last.at) return last.cents
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].at <= at) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  if (b.at === a.at) return b.cents
  return a.cents + ((b.cents - a.cents) * (at - a.at)) / (b.at - a.at)
}

function loadFills(): Fill[] {
  // Only rows with a fill carry a price; unfilled orders never moved shares or cash.
  return getDb()
    .all<{ ticker: string; side: string; quantity: number; amount_cents: number; at: number }>(
      sql`SELECT ticker, side, quantity, amount_cents, at FROM "order"
          WHERE price IS NOT NULL AND quantity IS NOT NULL AND quantity != 0
          ORDER BY at`
    )
    .map((r) => ({
      ticker: r.ticker,
      delta: r.side === 'SELL' ? -Math.abs(r.quantity) : Math.abs(r.quantity),
      amountCents: r.amount_cents,
      at: r.at
    }))
}

function loadCashEvents(): CashEvent[] {
  const db = getDb()
  const cash = db.all<{ type: string; amount_cents: number; at: number }>(
    sql`SELECT type, amount_cents, at FROM cash_transaction`
  )
  const dividends = db.all<{ amount_cents: number; paid_at: number }>(
    sql`SELECT amount_cents, paid_at FROM dividend`
  )
  return [
    ...cash.map((c) => ({
      amountCents: c.amount_cents,
      deposit: c.type === 'DEPOSIT' || c.type === 'WITHDRAW' ? c.amount_cents : 0,
      at: c.at
    })),
    ...dividends.map((d) => ({ amountCents: d.amount_cents, deposit: 0, at: d.paid_at }))
  ].sort((a, b) => a.at - b.at)
}

function priceHistory(fills: Fill[], now: number): Map<string, PricePoint[]> {
  const prices = new Map<string, PricePoint[]>()
  const add = (ticker: string, point: PricePoint): void => {
    const list = prices.get(ticker) ?? []
    list.push(point)
    prices.set(ticker, list)
  }
  for (const f of fills) {
    // Corporate actions (splits and the like) move shares without cash: no price signal.
    if (f.amountCents !== 0) add(f.ticker, { at: f.at, cents: Math.abs(f.amountCents / f.delta) })
  }
  const held = getDb().all<{ ticker: string; quantity: number; value_cents: number }>(
    sql`SELECT ticker, quantity, value_cents FROM position WHERE quantity > 0`
  )
  for (const p of held) add(p.ticker, { at: now, cents: p.value_cents / p.quantity })
  for (const list of prices.values()) list.sort((a, b) => a.at - b.at)
  return prices
}

function lastSnapshotPerDay(): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const r of getDb().all<{ taken_at: number; total_cents: number }>(
    sql`SELECT taken_at, total_cents FROM account_snapshot ORDER BY taken_at`
  )) {
    byDay.set(localDay(r.taken_at), r.total_cents)
  }
  return byDay
}

export function valueHistory(days: number, now = Date.now()): ValuePoint[] {
  const snapshots = lastSnapshotPerDay()
  const fills = loadFills()
  const cashEvents = loadCashEvents()
  const firstEvent = Math.min(fills[0]?.at ?? Infinity, cashEvents[0]?.at ?? Infinity)
  const firstSnapshot = snapshots.size
    ? Date.parse(`${[...snapshots.keys()][0]}T12:00:00`)
    : Infinity
  const start = Math.min(firstEvent, firstSnapshot)
  if (!Number.isFinite(start)) return []

  const prices = priceHistory(fills, now)
  const quantities = new Map<string, number>()
  let cash = 0
  let paidIn = 0
  let fi = 0
  let ci = 0
  const since = localDay(now - days * DAY)
  const points: ValuePoint[] = []

  // Walk local days by calendar date so DST changes never skip or repeat a day.
  const cursor = new Date(start)
  cursor.setHours(12, 0, 0, 0)
  for (; cursor.getTime() <= endOfLocalDay(now); cursor.setDate(cursor.getDate() + 1)) {
    const at = Math.min(endOfLocalDay(cursor.getTime()), now)
    for (; fi < fills.length && fills[fi].at <= at; fi++) {
      const f = fills[fi]
      quantities.set(f.ticker, (quantities.get(f.ticker) ?? 0) + f.delta)
      cash += f.amountCents
    }
    for (; ci < cashEvents.length && cashEvents[ci].at <= at; ci++) {
      cash += cashEvents[ci].amountCents
      paidIn += cashEvents[ci].deposit
    }

    const day = localDay(cursor.getTime())
    if (day < since) continue
    const real = snapshots.get(day)
    if (real !== undefined) {
      points.push({ day, totalCents: real, investedCents: paidIn, estimated: false })
      continue
    }
    if (fills.length === 0 && cashEvents.length === 0) continue
    let holdings = 0
    for (const [ticker, qty] of quantities) {
      if (qty <= 1e-9) continue
      holdings += qty * (priceAt(prices.get(ticker) ?? [], at) ?? 0)
    }
    // Missing history can drive replayed cash below zero; an account cannot hold that.
    const total = Math.round(Math.max(cash, 0) + holdings)
    points.push({ day, totalCents: total, investedCents: paidIn, estimated: true })
  }
  return points
}
