import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { getDb } from '../db'
import type { Page, T212Client } from './api'
import {
  runSync,
  signedCashAmount,
  storeCashTransactions,
  storeDividends,
  storeOrders,
  storePositions,
  syncStream
} from './sync'
import { iso, resetDb, teardownDb } from '../__tests__/helpers'

beforeEach(() => resetDb())
afterAll(() => teardownDb())

const count = (table: string): number =>
  getDb().get<{ n: number }>(sql.raw(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0

/** Dividends paged newest first, `size` per page, with cursors like Trading 212's. */
function pagedDividends(total: number, size: number): Map<string | null, Page<unknown>> {
  const pages = new Map<string | null, Page<unknown>>()
  const base = '/api/v0/equity/history/dividends'
  for (let start = 0; start < total; start += size) {
    const items = Array.from({ length: Math.min(size, total - start) }, (_, i) => {
      const n = total - (start + i) // newest first
      return { reference: `r${n}`, ticker: 'VUSAl_EQ', amount: 1, paidOn: iso(n * 86_400_000) }
    })
    const key = start === 0 ? null : `${base}?limit=${size}&cursor=${start}`
    const next = start + size < total ? `${base}?limit=${size}&cursor=${start + size}` : null
    pages.set(key, { items, nextPagePath: next })
  }
  return pages
}

function fakeClient(pages: Map<string | null, Page<unknown>>, failAt?: string) {
  const historyPage = vi.fn(async (_stream: string, next?: string | null) => {
    if (failAt && next === failAt) throw new Error('network down')
    const page = pages.get(next ?? null)
    if (!page) throw new Error(`unknown page ${next}`)
    return page
  })
  return { historyPage } as unknown as T212Client & { historyPage: typeof historyPage }
}

describe('store functions', () => {
  it('stores positions with wallet values in account-currency cents', () => {
    storePositions([
      {
        instrument: { ticker: 'AAPL_US_EQ', name: 'Apple', isin: 'US0378331005', currency: 'USD' },
        quantity: 2.5,
        averagePricePaid: 150.1234,
        currentPrice: 190.5,
        createdAt: '2025-01-02T10:00:00Z',
        walletImpact: {
          currentValue: 410.12,
          totalCost: 330.5,
          unrealizedProfitLoss: 79.62,
          fxImpact: -3.1
        }
      },
      { quantity: 1 } // no instrument: skipped
    ])
    const row = getDb().get<Record<string, unknown>>(sql`SELECT * FROM position`)
    expect(row).toMatchObject({
      ticker: 'AAPL_US_EQ',
      quantity: 2.5,
      average_price: 150.1234,
      value_cents: 41012,
      cost_cents: 33050,
      unrealized_cents: 7962,
      fx_cents: -310
    })
    expect(count('position')).toBe(1)
  })

  it('replaces positions wholesale so sold ones disappear', () => {
    storePositions([{ instrument: { ticker: 'A' }, walletImpact: { currentValue: 1 } }])
    storePositions([{ instrument: { ticker: 'B' }, walletImpact: { currentValue: 1 } }])
    expect(getDb().all(sql`SELECT ticker FROM position`)).toEqual([{ ticker: 'B' }])
  })

  it('signs orders by side and sums fees', () => {
    const result = storeOrders([
      {
        order: { id: 1, ticker: 'AAPL_US_EQ', side: 'BUY', status: 'FILLED', createdAt: iso(1000) },
        fill: {
          id: 10,
          price: 190,
          quantity: 1,
          filledAt: iso(2000),
          walletImpact: {
            netValue: 176.2,
            taxes: [
              { name: 'CURRENCY_CONVERSION_FEE', quantity: 0.26 },
              { name: 'FINRA_FEE', quantity: -0.01 }
            ]
          }
        }
      },
      {
        order: {
          id: 2,
          ticker: 'AAPL_US_EQ',
          side: 'SELL',
          status: 'FILLED',
          createdAt: iso(3000)
        },
        fill: { id: 11, walletImpact: { netValue: 200, realisedProfitLoss: 23.8 } }
      },
      {
        order: {
          id: 3,
          ticker: 'MSFT_US_EQ',
          side: 'BUY',
          status: 'CANCELLED',
          createdAt: iso(4000)
        },
        fill: null
      }
    ])
    expect(result).toEqual({ valid: 3, inserted: 3 })
    const rows = getDb().all<{
      id: string
      amount_cents: number
      fees_cents: number
      realized_cents: number
      at: number
    }>(sql`SELECT id, amount_cents, fees_cents, realized_cents, at FROM "order" ORDER BY id`)
    expect(rows).toEqual([
      { id: '1:10', amount_cents: -17620, fees_cents: 27, realized_cents: 0, at: 2000 },
      { id: '2:11', amount_cents: 20000, fees_cents: 0, realized_cents: 2380, at: 3000 },
      { id: '3:0', amount_cents: 0, fees_cents: 0, realized_cents: 0, at: 4000 }
    ])
    // The same page again inserts nothing.
    expect(
      storeOrders([
        { order: { id: 1, ticker: 'AAPL_US_EQ', createdAt: iso(1000) }, fill: { id: 10 } }
      ])
    ).toEqual({
      valid: 1,
      inserted: 0
    })
  })

  it('normalises cash transaction signs by type', () => {
    expect(signedCashAmount('DEPOSIT', -100)).toBe(10000)
    expect(signedCashAmount('WITHDRAW', 50)).toBe(-5000)
    expect(signedCashAmount('FEE', 1.5)).toBe(-150)
    expect(signedCashAmount('INTEREST_ON_FREE_CASH', 0.42)).toBe(42)
    expect(signedCashAmount('TRANSFER', -3)).toBe(-300)
    storeCashTransactions([
      { reference: 'a', type: 'DEPOSIT', amount: 1000, currency: 'EUR', dateTime: iso(1) },
      { reference: 'b', type: 'WITHDRAW', amount: 200, currency: 'EUR', dateTime: iso(2) },
      { reference: 'c', type: 'DEPOSIT' } // no date: skipped
    ])
    expect(count('cash_transaction')).toBe(2)
  })

  it('skips dividends without a reference or date', () => {
    const result = storeDividends([
      { reference: 'x', ticker: 'T', amount: 1.23, paidOn: iso(1) },
      { ticker: 'T', amount: 1, paidOn: iso(1) },
      { reference: 'y', ticker: 'T', amount: 1 }
    ])
    expect(result).toEqual({ valid: 1, inserted: 1 })
  })
})

describe('syncStream', () => {
  const progress = vi.fn()

  it('walks the full history on the first run and marks the backfill done', async () => {
    const client = fakeClient(pagedDividends(120, 50))
    expect(await syncStream(client, 'dividends', progress)).toBe(120)
    expect(client.historyPage).toHaveBeenCalledTimes(3)
    expect(getDb().get(sql`SELECT backfill_done FROM history_cursor`)).toEqual({ backfill_done: 1 })
  })

  it('stops the head pass at the first page holding known rows', async () => {
    await syncStream(fakeClient(pagedDividends(120, 50)), 'dividends', progress)
    // Five new dividends arrive; the newest page now overlaps what we have.
    const client = fakeClient(pagedDividends(125, 50))
    expect(await syncStream(client, 'dividends', progress)).toBe(5)
    expect(client.historyPage).toHaveBeenCalledTimes(1)
    expect(count('dividend')).toBe(125)
  })

  it('resumes an interrupted first backfill from the saved cursor', async () => {
    const pages = pagedDividends(150, 50)
    const cursor = '/api/v0/equity/history/dividends?limit=50&cursor=100'
    await expect(syncStream(fakeClient(pages, cursor), 'dividends', progress)).rejects.toThrow(
      /network down/
    )
    expect(count('dividend')).toBe(100)
    expect(getDb().get(sql`SELECT next_path, backfill_done FROM history_cursor`)).toEqual({
      next_path: cursor,
      backfill_done: 0
    })

    const client = fakeClient(pages)
    expect(await syncStream(client, 'dividends', progress)).toBe(50)
    // One head page (overlaps immediately), then the one missing page.
    expect(client.historyPage.mock.calls.map((c) => c[1] ?? null)).toEqual([null, cursor])
    expect(count('dividend')).toBe(150)
    expect(getDb().get(sql`SELECT backfill_done FROM history_cursor`)).toEqual({ backfill_done: 1 })
  })
})

describe('runSync', () => {
  it('stores a snapshot, positions and every stream, and reports progress', async () => {
    const empty = { items: [], nextPagePath: null }
    const client = {
      accountSummary: vi.fn(async () => ({
        id: 7,
        currency: 'EUR',
        totalValue: 1234.56,
        cash: { availableToTrade: 100 },
        investments: { currentValue: 1134.56, totalCost: 1000, unrealizedProfitLoss: 134.56 }
      })),
      positions: vi.fn(async () => [
        { instrument: { ticker: 'A', name: 'A' }, walletImpact: { currentValue: 1134.56 } }
      ]),
      instruments: vi.fn(async () => [{ ticker: 'A', name: 'A Inc', type: 'STOCK' }]),
      historyPage: vi.fn(async () => empty)
    } as unknown as T212Client
    const events: string[] = []
    const result = await runSync((p) => events.push(p.phase), client)
    expect(result).toEqual({ positions: 1, activities: 0 })
    expect(
      getDb().get(sql`SELECT total_cents, invested_cents, cash_cents FROM account_snapshot`)
    ).toEqual({
      total_cents: 123456,
      invested_cents: 100000,
      cash_cents: 10000
    })
    expect(count('instrument')).toBe(1)
    expect(events.at(-1)).toBe('done')
  })
})
