import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  allocation,
  dividendPayers,
  insights,
  listActivity,
  listPies,
  listPositions,
  monthlyFlows,
  portfolioSummary,
  rangeTotals,
  valueHistory
} from './analysis'
import {
  storeCashTransactions,
  storeDividends,
  storeInstruments,
  storeOrders,
  storePies
} from './t212/sync'
import {
  DAY,
  daysAgo,
  iso,
  resetDb,
  seedContext,
  seedPosition,
  seedSnapshot,
  teardownDb
} from './__tests__/helpers'

beforeEach(() => resetDb())
afterAll(() => teardownDb())

function seedPortfolio(): void {
  seedPosition({
    ticker: 'AAPL_US_EQ',
    name: 'Apple',
    instrumentCurrency: 'USD',
    valueCents: 60_000,
    costCents: 40_000
  })
  seedPosition({
    ticker: 'VUSAl_EQ',
    name: 'S&P 500 ETF',
    instrumentCurrency: 'GBX',
    valueCents: 30_000,
    costCents: 30_000
  })
  seedPosition({
    ticker: 'ASML_NL_EQ',
    name: 'ASML',
    instrumentCurrency: 'EUR',
    valueCents: 10_000,
    costCents: 15_000
  })
  storeInstruments([
    { ticker: 'AAPL_US_EQ', name: 'Apple', type: 'STOCK' },
    { ticker: 'VUSAl_EQ', name: 'S&P 500 ETF', type: 'ETF' },
    { ticker: 'ASML_NL_EQ', name: 'ASML', type: 'STOCK' }
  ])
  seedSnapshot({
    takenAt: daysAgo(0),
    totalCents: 120_000,
    investedCents: 85_000,
    unrealizedCents: 15_000,
    cashCents: 20_000
  })
}

describe('positions and summary', () => {
  it('returns null before the first sync', () => {
    expect(portfolioSummary()).toBeNull()
  })

  it('reads the latest snapshot and counts positions', () => {
    seedPortfolio()
    seedSnapshot({ takenAt: daysAgo(3), totalCents: 1 })
    expect(portfolioSummary()).toMatchObject({
      totalCents: 120_000,
      cashCents: 20_000,
      positions: 3
    })
  })

  it('computes return on cost and weight, largest first', () => {
    seedPortfolio()
    const rows = listPositions()
    expect(rows.map((p) => p.ticker)).toEqual(['AAPL_US_EQ', 'VUSAl_EQ', 'ASML_NL_EQ'])
    expect(rows[0]).toMatchObject({ weight: 0.6, returnPct: 0.5, type: 'STOCK' })
    expect(rows[2].returnPct).toBeCloseTo(-1 / 3)
  })
})

describe('allocation', () => {
  it('groups by currency with GBX folded into GBP, and by type', () => {
    seedPortfolio()
    expect(allocation('currency').map((s) => [s.key, s.share])).toEqual([
      ['USD', 0.6],
      ['GBP', 0.3],
      ['EUR', 0.1]
    ])
    expect(allocation('type').map((s) => [s.label, s.valueCents])).toEqual([
      ['Stocks', 70_000],
      ['ETFs', 30_000]
    ])
  })

  it('folds the long tail of positions into one slice', () => {
    for (let i = 0; i < 14; i++) seedPosition({ ticker: `T${i}`, valueCents: 1000 * (i + 1) })
    const slices = allocation('position')
    expect(slices).toHaveLength(10)
    expect(slices.at(-1)).toMatchObject({ key: '__other', label: '5 others' })
    expect(slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1)
  })
})

describe('activity feed', () => {
  beforeEach(() => {
    storeOrders([
      {
        order: {
          id: 1,
          ticker: 'AAPL_US_EQ',
          instrument: { name: 'Apple' },
          side: 'BUY',
          status: 'FILLED',
          createdAt: iso(daysAgo(10))
        },
        fill: {
          id: 1,
          quantity: 2,
          price: 190,
          filledAt: iso(daysAgo(10)),
          walletImpact: { netValue: 350, taxes: [{ quantity: 0.5 }] }
        }
      },
      {
        order: {
          id: 2,
          ticker: 'AAPL_US_EQ',
          instrument: { name: 'Apple' },
          side: 'SELL',
          status: 'FILLED',
          createdAt: iso(daysAgo(2))
        },
        fill: {
          id: 2,
          quantity: 1,
          price: 200,
          filledAt: iso(daysAgo(2)),
          walletImpact: { netValue: 185, realisedProfitLoss: 10 }
        }
      }
    ])
    storeDividends([
      {
        reference: 'd1',
        ticker: 'AAPL_US_EQ',
        instrument: { name: 'Apple' },
        amount: 1.2,
        paidOn: iso(daysAgo(5))
      }
    ])
    storeCashTransactions([
      {
        reference: 'c1',
        type: 'DEPOSIT',
        amount: 1000,
        currency: 'EUR',
        dateTime: iso(daysAgo(20))
      },
      { reference: 'c2', type: 'FEE', amount: 1, currency: 'EUR', dateTime: iso(daysAgo(1)) }
    ])
  })

  it('merges every kind into one newest-first feed', () => {
    const { rows, total } = listActivity({ limit: 50, offset: 0 })
    expect(total).toBe(5)
    expect(rows.map((r) => r.kind)).toEqual(['fee', 'sell', 'dividend', 'buy', 'deposit'])
    expect(rows.find((r) => r.kind === 'buy')).toMatchObject({
      label: 'Apple',
      amountCents: -35_000,
      quantity: 2
    })
    expect(rows.find((r) => r.kind === 'deposit')).toMatchObject({
      label: 'Deposit',
      amountCents: 100_000
    })
  })

  it('filters by kind, ticker, search and date, and pages stably', () => {
    expect(listActivity({ kind: 'dividend', limit: 50, offset: 0 }).total).toBe(1)
    expect(listActivity({ ticker: 'AAPL_US_EQ', limit: 50, offset: 0 }).total).toBe(3)
    expect(listActivity({ search: 'appl', limit: 50, offset: 0 }).total).toBe(3)
    expect(listActivity({ from: daysAgo(6), limit: 50, offset: 0 }).total).toBe(3)
    const page1 = listActivity({ limit: 2, offset: 0 }).rows.map((r) => r.id)
    const page2 = listActivity({ limit: 2, offset: 2 }).rows.map((r) => r.id)
    expect(new Set([...page1, ...page2]).size).toBe(4)
  })

  it('totals a range', () => {
    expect(rangeTotals(daysAgo(30), Date.now())).toMatchObject({
      buysCents: 35_000,
      sellsCents: 18_500,
      realizedCents: 1000,
      dividendsCents: 120,
      depositsCents: 100_000,
      feesCents: 150,
      orders: 2
    })
  })
})

describe('time series', () => {
  it('keeps the last snapshot of each day', () => {
    seedSnapshot({ takenAt: daysAgo(2, 9), totalCents: 100, cashCents: 10, investedCents: 50 })
    seedSnapshot({ takenAt: daysAgo(2, 18), totalCents: 110, cashCents: 10, investedCents: 50 })
    seedSnapshot({ takenAt: daysAgo(1), totalCents: 120, cashCents: 10, investedCents: 50 })
    seedSnapshot({ takenAt: daysAgo(400), totalCents: 1 })
    const points = valueHistory(30)
    // No trades or deposits synced, so nothing to rebuild the gaps from: snapshots only.
    expect(points.map((p) => p.totalCents)).toEqual([110, 120])
    expect(points.every((p) => !p.estimated)).toBe(true)
  })

  it('rebuilds value from deposits, fills and interpolated prices, and prefers snapshots', () => {
    const now = daysAgo(0, 18)
    storeCashTransactions([
      {
        reference: 'dep',
        type: 'DEPOSIT',
        amount: 1000,
        currency: 'EUR',
        dateTime: iso(daysAgo(10))
      }
    ])
    // Buy 10 shares for 500 (50 each) eight days ago.
    storeOrders([
      {
        order: { id: 1, ticker: 'X_EQ', side: 'BUY', status: 'FILLED', createdAt: iso(daysAgo(8)) },
        fill: {
          id: 1,
          quantity: 10,
          price: 50,
          filledAt: iso(daysAgo(8)),
          walletImpact: { netValue: 500 }
        }
      }
    ])
    // Today the 10 shares are worth 700 (70 each) and a real snapshot says 1200.
    seedPosition({ ticker: 'X_EQ', quantity: 10, valueCents: 70_000, costCents: 50_000 })
    seedSnapshot({ takenAt: now, totalCents: 120_000 })

    const points = valueHistory(3650, now)
    const at = (days: number) => points.find((p) => p.day === points.at(-1 - days)?.day)!
    expect(points).toHaveLength(11)
    expect(points[0]).toMatchObject({
      totalCents: 100_000,
      investedCents: 100_000,
      estimated: true
    })
    // Before the buy: all cash.
    expect(at(9).totalCents).toBe(100_000)
    // Four days after the buy the price is interpolated between 50 and 70, so ~60 a share.
    expect(at(4).totalCents).toBeGreaterThan(105_000)
    expect(at(4).totalCents).toBeLessThan(115_000)
    expect(at(4).estimated).toBe(true)
    // Today comes from the real snapshot.
    expect(points.at(-1)).toMatchObject({
      totalCents: 120_000,
      investedCents: 100_000,
      estimated: false
    })
  })

  it('ignores unfilled orders when replaying shares', () => {
    const now = daysAgo(0, 18)
    storeCashTransactions([
      { reference: 'dep', type: 'DEPOSIT', amount: 100, currency: 'EUR', dateTime: iso(daysAgo(3)) }
    ])
    storeOrders([
      {
        order: {
          id: 9,
          ticker: 'Y_EQ',
          side: 'BUY',
          status: 'CANCELLED',
          quantity: 5,
          createdAt: iso(daysAgo(2))
        }
      }
    ])
    const points = valueHistory(30, now)
    expect(points.map((p) => p.totalCents)).toEqual([10_000, 10_000, 10_000, 10_000])
  })

  it('fills every month, including empty ones', () => {
    const now = new Date(2026, 8, 15)
    storeDividends([
      { reference: 'a', ticker: 'X', amount: 2, paidOn: new Date(2026, 8, 1).toISOString() },
      { reference: 'b', ticker: 'X', amount: 3, paidOn: new Date(2026, 6, 10).toISOString() },
      { reference: 'c', ticker: 'Y', amount: 9, paidOn: new Date(2025, 0, 10).toISOString() }
    ])
    storeCashTransactions([
      {
        reference: 'd',
        type: 'DEPOSIT',
        amount: 500,
        currency: 'EUR',
        dateTime: new Date(2026, 7, 3).toISOString()
      },
      {
        reference: 'w',
        type: 'WITHDRAW',
        amount: 100,
        currency: 'EUR',
        dateTime: new Date(2026, 7, 4).toISOString()
      }
    ])
    const flows = monthlyFlows(3, now)
    expect(flows.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(flows.map((m) => m.dividendsCents)).toEqual([300, 0, 200])
    expect(flows[1]).toMatchObject({ depositsCents: 50_000, withdrawalsCents: 10_000 })
    expect(dividendPayers(3, 5, now)).toEqual([
      { ticker: 'X', name: 'X', amountCents: 500, payments: 2 }
    ])
  })
})

describe('insights', () => {
  it('flags concentration, cash share and big movers', () => {
    seedPortfolio()
    const ids = insights().map((i) => i.id)
    expect(ids).toContain('concentration-top')
    expect(ids).toContain('cash-share')
    expect(ids).toContain('mover-up-AAPL_US_EQ')
    expect(ids).toContain('mover-down-ASML_NL_EQ')
  })

  it('compares dividend income year on year', () => {
    seedSnapshot({ takenAt: Date.now(), totalCents: 1000 })
    storeDividends([
      { reference: 'new', ticker: 'X', amount: 50, paidOn: iso(Date.now() - 30 * DAY) },
      { reference: 'old', ticker: 'X', amount: 100, paidOn: iso(Date.now() - 400 * DAY) }
    ])
    const trend = insights().find((i) => i.id === 'dividends-trend')
    expect(trend).toMatchObject({
      severity: 'warn',
      title: 'Dividend income down 50% year on year'
    })
  })
})

describe('listPies', () => {
  it('returns pies largest first with named instruments and the read state', () => {
    seedContext({ currency: 'GBP', piesSyncedAt: 1_000, piesError: null })
    storeInstruments([{ ticker: 'VUSAl_EQ', name: 'Vanguard S&P 500', currencyCode: 'GBX' }])
    seedPosition({ ticker: 'AAPL_US_EQ', name: 'Apple', instrumentCurrency: 'USD', valueCents: 1 })
    storePies(
      [
        { id: 1, result: { priceAvgValue: 10, priceAvgInvestedValue: 8, priceAvgResult: 2 } },
        { id: 2, cash: 1, result: { priceAvgValue: 50, priceAvgResultCoef: -0.1 } }
      ],
      new Map([
        [
          1,
          {
            settings: { name: 'Small', dividendCashAction: 'TO_ACCOUNT_CASH' },
            instruments: [
              { ticker: 'AAPL_US_EQ', expectedShare: 0.3, result: { priceAvgValue: 3 } },
              { ticker: 'VUSAl_EQ', expectedShare: 0.7, result: { priceAvgValue: 7 } },
              { ticker: 'UNKNOWN', expectedShare: 0, result: { priceAvgValue: 0 } }
            ]
          }
        ],
        [2, { settings: { name: 'Big', dividendCashAction: 'SOMETHING_NEW' } }]
      ])
    )
    const state = listPies()
    expect(state).toMatchObject({ currency: 'GBP', syncedAt: 1_000, error: null })
    expect(state.pies.map((p) => p.name)).toEqual(['Big', 'Small'])
    const [big, small] = state.pies
    expect(big).toMatchObject({ returnPct: -0.1, cashCents: 100, dividendCashAction: null })
    // No reported return: derived from result over invested.
    expect(small).toMatchObject({ returnPct: 0.25, dividendCashAction: 'TO_ACCOUNT_CASH' })
    expect(small.instruments.map((i) => [i.ticker, i.name, i.instrumentCurrency])).toEqual([
      ['VUSAl_EQ', 'Vanguard S&P 500', 'GBX'],
      ['AAPL_US_EQ', 'Apple', 'USD'],
      ['UNKNOWN', 'UNKNOWN', null]
    ])
    expect(small.instruments[0]).toMatchObject({ targetShare: 0.7, issues: [] })
  })

  it('reports a failed read with no pies', () => {
    seedContext({ piesError: 'missing permission' })
    expect(listPies()).toEqual({
      currency: 'EUR',
      pies: [],
      syncedAt: null,
      error: 'missing permission'
    })
  })
})
