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
  storePies,
  storePositions,
  syncPies,
  syncStream
} from './sync'
import { T212Error, type RawPie, type RawPieDetail } from './api'
import { iso, resetDb, seedContext, teardownDb } from '../__tests__/helpers'

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
      historyPage: vi.fn(async () => empty),
      pies: vi.fn(async () => [])
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

  it('finishes the sync when pies cannot be read', async () => {
    seedContext()
    const empty = { items: [], nextPagePath: null }
    const client = {
      accountSummary: vi.fn(async () => ({ currency: 'EUR' })),
      positions: vi.fn(async () => []),
      instruments: vi.fn(async () => []),
      historyPage: vi.fn(async () => empty),
      pies: vi.fn(async () => {
        throw new T212Error(403, 'The API key is missing the "pies:read" permission.')
      })
    } as unknown as T212Client
    const events: string[] = []
    await expect(runSync((p) => events.push(p.phase), client)).resolves.toEqual({
      positions: 0,
      activities: 0
    })
    expect(events.at(-1)).toBe('done')
    expect(getDb().get(sql`SELECT pies_error FROM t212_context`)).toEqual({
      pies_error: 'The API key is missing the "pies:read" permission.'
    })
  })
})

const RAW_PIES: RawPie[] = [
  {
    id: 1,
    cash: 2.5,
    progress: 0.42,
    status: 'BEHIND',
    dividendDetails: { gained: 3.21, reinvested: 3, inCash: 0.21 },
    result: {
      priceAvgInvestedValue: 1000,
      priceAvgValue: 1100.55,
      priceAvgResult: 100.55,
      priceAvgResultCoef: 0.1006
    }
  },
  { id: 2, result: { priceAvgValue: 10 } },
  { cash: 1 } // no id: skipped
]

const RAW_DETAILS = new Map<number, RawPieDetail>([
  [
    1,
    {
      settings: {
        id: 1,
        name: ' Dividends ',
        goal: 5000,
        creationDate: '2025-03-01T10:00:00Z',
        endDate: '2030-01-01T00:00:00Z',
        dividendCashAction: 'REINVEST',
        publicUrl: 'https://www.trading212.com/pies/abc'
      },
      instruments: [
        {
          ticker: 'VUSAl_EQ',
          ownedQuantity: 3.5,
          expectedShare: 0.6,
          currentShare: 0.55,
          result: { priceAvgValue: 605.3, priceAvgInvestedValue: 550, priceAvgResult: 55.3 },
          issues: [{ name: 'MAX_POSITION_SIZE_REACHED', severity: 'REVERSIBLE' }, {}]
        },
        { ticker: 'VUSAl_EQ' }, // duplicate: skipped
        { ownedQuantity: 1 } // no ticker: skipped
      ]
    }
  ],
  [2, { settings: { goal: 0 } }]
])

describe('pies', () => {
  it('stores pies in cents with their instruments, and names pies that have none', () => {
    expect(storePies(RAW_PIES, RAW_DETAILS)).toBe(2)
    expect(getDb().get(sql`SELECT * FROM pie WHERE id = 1`)).toMatchObject({
      name: 'Dividends',
      value_cents: 110055,
      invested_cents: 100000,
      result_cents: 10055,
      return_pct: 0.1006,
      cash_cents: 250,
      dividends_gained_cents: 321,
      dividends_reinvested_cents: 300,
      dividends_in_cash_cents: 21,
      dividend_cash_action: 'REINVEST',
      goal_cents: 500000,
      progress: 0.42,
      status: 'BEHIND',
      created_at: Date.parse('2025-03-01T10:00:00Z')
    })
    // A goal of 0 means no goal, so progress and status mean nothing either.
    expect(
      getDb().get(sql`SELECT name, goal_cents, progress, status FROM pie WHERE id = 2`)
    ).toEqual({ name: 'Pie 2', goal_cents: null, progress: null, status: null })
    expect(getDb().all(sql`SELECT * FROM pie_instrument`)).toEqual([
      expect.objectContaining({
        pie_id: 1,
        ticker: 'VUSAl_EQ',
        quantity: 3.5,
        expected_share: 0.6,
        current_share: 0.55,
        value_cents: 60530,
        result_cents: 5530,
        issues: JSON.stringify([{ name: 'MAX_POSITION_SIZE_REACHED', severity: 'REVERSIBLE' }])
      })
    ])
  })

  it('replaces pies wholesale so deleted ones disappear', () => {
    storePies(RAW_PIES, RAW_DETAILS)
    storePies([{ id: 2 }], new Map())
    expect(count('pie')).toBe(1)
    expect(count('pie_instrument')).toBe(0)
  })

  it('reads the list, then each detail, and records the read', async () => {
    seedContext()
    const client = {
      pies: vi.fn(async () => RAW_PIES),
      pie: vi.fn(async (id: number) => RAW_DETAILS.get(id) ?? {})
    } as unknown as T212Client & { pie: ReturnType<typeof vi.fn> }
    const messages: string[] = []
    const stored = await syncPies(client, (p) => {
      if (p.phase === 'account') messages.push(p.message)
    })
    expect(stored).toBe(2)
    expect(client.pie.mock.calls.map(([id]) => id)).toEqual([1, 2])
    expect(messages).toEqual(['Loading pies', 'Loading pie 1 of 2', 'Loading pie 2 of 2'])
    const context = getDb().get<{ pies_synced_at: number; pies_error: string | null }>(
      sql`SELECT pies_synced_at, pies_error FROM t212_context`
    )
    expect(context?.pies_synced_at).toBeGreaterThan(0)
    expect(context?.pies_error).toBeNull()
  })

  it('keeps the last pies and records why when a read fails', async () => {
    seedContext({ piesSyncedAt: 123 })
    storePies(RAW_PIES, RAW_DETAILS)
    const client = {
      pies: vi.fn(async () => RAW_PIES),
      pie: vi.fn(async () => {
        throw new T212Error(404, 'Trading 212 returned 404 for /api/v0/equity/pies/2')
      })
    } as unknown as T212Client
    await expect(syncPies(client, () => undefined)).resolves.toBe(0)
    expect(count('pie')).toBe(2)
    expect(getDb().get(sql`SELECT pies_synced_at, pies_error FROM t212_context`)).toEqual({
      pies_synced_at: 123,
      pies_error: 'Trading 212 returned 404 for /api/v0/equity/pies/2'
    })
  })
})
