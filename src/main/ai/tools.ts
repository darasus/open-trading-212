import { sql } from 'drizzle-orm'
import { tool } from 'ai'
import { z } from 'zod'
import {
  allocation,
  dividendPayers,
  listActivity,
  listPositions,
  monthlyFlows,
  portfolioSummary,
  rangeTotals,
  valueHistory
} from '../analysis'
import { getDb } from '../db'
import { runReadonlySql, SQL_SCHEMA_DESCRIPTION } from './readonly-sql'

/**
 * Every tool runs in the main process against the local SQLite file. Whatever a tool
 * returns is exactly what the model receives, and the UI shows that payload under
 * "Sent to the AI" on each call. Keep outputs small. Money is in the account currency
 * unless a field says otherwise. None of these tools can trade: there is no such code.
 */

const money = (cents: number): number => Math.round(cents) / 100
const round = (n: number, digits = 4): number => Math.round(n * 10 ** digits) / 10 ** digits
const day = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString().slice(0, 10)

function parseDate(value: string, endOfDay = false): number {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) throw new Error(`Invalid date "${value}", use YYYY-MM-DD`)
  const d = new Date(ms)
  if (endOfDay) d.setHours(23, 59, 59, 999)
  return d.getTime()
}

const kind = z
  .enum(['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'other'])
  .optional()
  .describe('Restrict to one kind of activity')

export const tools = {
  portfolio_summary: tool({
    description:
      'Current account value, cash, invested cost basis, unrealised and realised P/L, from the latest sync.',
    inputSchema: z.object({}),
    execute: async () => {
      const s = portfolioSummary()
      if (!s) return { error: 'Nothing synced yet' }
      return {
        currency: s.currency,
        asOf: new Date(s.takenAt).toISOString(),
        totalValue: money(s.totalCents),
        cash: money(s.cashCents),
        investedCost: money(s.investedCents),
        unrealizedPL: money(s.unrealizedCents),
        unrealizedReturn: s.investedCents ? round(s.unrealizedCents / s.investedCents) : 0,
        realizedPL: money(s.realizedCents),
        positions: s.positions
      }
    }
  }),

  list_positions: tool({
    description:
      'Open positions with quantity, prices (instrument currency), value, cost and unrealised P/L (account currency), return on cost and weight in the portfolio.',
    inputSchema: z.object({
      sortBy: z.enum(['value', 'return', 'pl', 'name']).default('value'),
      limit: z.number().int().min(1).max(200).default(50)
    }),
    execute: async ({ sortBy, limit }) => {
      const rows = listPositions()
      const sorted =
        sortBy === 'return'
          ? rows.sort((a, b) => b.returnPct - a.returnPct)
          : sortBy === 'pl'
            ? rows.sort((a, b) => b.unrealizedCents - a.unrealizedCents)
            : sortBy === 'name'
              ? rows.sort((a, b) => a.name.localeCompare(b.name))
              : rows
      return {
        count: rows.length,
        positions: sorted.slice(0, limit).map((p) => ({
          ticker: p.ticker,
          name: p.name,
          isin: p.isin,
          type: p.type,
          quantity: p.quantity,
          averagePrice: p.averagePrice,
          currentPrice: p.currentPrice,
          priceCurrency: p.instrumentCurrency,
          value: money(p.valueCents),
          cost: money(p.costCents),
          unrealizedPL: money(p.unrealizedCents),
          fxImpact: money(p.fxCents),
          returnOnCost: round(p.returnPct),
          weight: round(p.weight),
          openedAt: day(p.openedAt)
        }))
      }
    }
  }),

  allocation: tool({
    description:
      'How invested value splits by position, by instrument currency, or by asset type (stocks, ETFs, …). Shares are fractions of total position value.',
    inputSchema: z.object({ by: z.enum(['position', 'currency', 'type']).default('position') }),
    execute: async ({ by }) =>
      allocation(by).map((s) => ({
        key: s.key,
        label: s.label,
        value: money(s.valueCents),
        share: round(s.share)
      }))
  }),

  search_activity: tool({
    description:
      'Search trades, dividends, deposits, withdrawals and fees, newest first. amount is the signed cash effect in the account currency (buys and withdrawals negative). price is in the instrument currency.',
    inputSchema: z.object({
      kind,
      ticker: z.string().optional().describe('Exact Trading 212 ticker, e.g. AAPL_US_EQ'),
      search: z.string().optional().describe('Case-insensitive match on ticker or name'),
      from: z.string().optional().describe('YYYY-MM-DD inclusive'),
      to: z.string().optional().describe('YYYY-MM-DD inclusive'),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0)
    }),
    execute: async (input) => {
      const result = listActivity({
        kind: input.kind,
        ticker: input.ticker,
        search: input.search,
        from: input.from ? parseDate(input.from) : undefined,
        to: input.to ? parseDate(input.to, true) + 1 : undefined,
        limit: input.limit,
        offset: input.offset
      })
      return {
        total: result.total,
        rows: result.rows.map((r) => ({
          date: day(r.at),
          kind: r.kind,
          ticker: r.ticker,
          name: r.label,
          quantity: r.quantity,
          price: r.price,
          amount: money(r.amountCents),
          status: r.status
        }))
      }
    }
  }),

  period_totals: tool({
    description:
      'Totals for a date range: money deposited and withdrawn, bought and sold, realised P/L from sells, dividends, interest, and fees plus taxes.',
    inputSchema: z.object({
      from: z.string().describe('YYYY-MM-DD inclusive'),
      to: z.string().describe('YYYY-MM-DD inclusive')
    }),
    execute: async ({ from, to }) => {
      const t = rangeTotals(parseDate(from), parseDate(to, true))
      return {
        from,
        to,
        deposited: money(t.depositsCents),
        withdrawn: money(t.withdrawalsCents),
        bought: money(t.buysCents),
        sold: money(t.sellsCents),
        realizedPL: money(t.realizedCents),
        dividends: money(t.dividendsCents),
        interest: money(t.interestCents),
        feesAndTaxes: money(t.feesCents),
        orders: t.orders
      }
    }
  }),

  monthly_flows: tool({
    description:
      'Per month for the last N months: deposits, withdrawals, buys, sells, dividends and fees.',
    inputSchema: z.object({ months: z.number().int().min(1).max(60).default(12) }),
    execute: async ({ months }) =>
      monthlyFlows(months).map((m) => ({
        month: m.month,
        deposits: money(m.depositsCents),
        withdrawals: money(m.withdrawalsCents),
        buys: money(m.buysCents),
        sells: money(m.sellsCents),
        dividends: money(m.dividendsCents),
        fees: money(m.feesCents)
      }))
  }),

  dividend_income: tool({
    description:
      'Dividend income over the last N months: the top paying instruments with totals and number of payments.',
    inputSchema: z.object({
      months: z.number().int().min(1).max(120).default(12),
      limit: z.number().int().min(1).max(50).default(15)
    }),
    execute: async ({ months, limit }) => {
      const payers = dividendPayers(months, limit)
      return {
        window: `${months} months`,
        total: money(payers.reduce((a, p) => a + p.amountCents, 0)),
        payers: payers.map((p) => ({
          ticker: p.ticker,
          name: p.name,
          amount: money(p.amountCents),
          payments: p.payments
        }))
      }
    }
  }),

  position_history: tool({
    description:
      'Everything recorded for one instrument: every fill, every dividend, realised P/L and fees, plus the current position if still held.',
    inputSchema: z.object({
      ticker: z.string().describe('Exact Trading 212 ticker, e.g. AAPL_US_EQ')
    }),
    execute: async ({ ticker }) => {
      const position = listPositions().find((p) => p.ticker === ticker) ?? null
      const activity = listActivity({ ticker, limit: 200, offset: 0 })
      const totals = getDb().get<{ realized: number; fees: number }>(sql`
        SELECT COALESCE(SUM(realized_cents), 0) AS realized, COALESCE(SUM(fees_cents), 0) AS fees
        FROM "order" WHERE ticker = ${ticker}
      `)
      const dividends = activity.rows.filter((r) => r.kind === 'dividend')
      return {
        ticker,
        held: position
          ? {
              quantity: position.quantity,
              value: money(position.valueCents),
              cost: money(position.costCents),
              unrealizedPL: money(position.unrealizedCents),
              returnOnCost: round(position.returnPct)
            }
          : null,
        realizedPL: money(totals?.realized ?? 0),
        feesAndTaxes: money(totals?.fees ?? 0),
        dividendsReceived: money(dividends.reduce((a, r) => a + r.amountCents, 0)),
        activityCount: activity.total,
        activity: activity.rows.slice(0, 60).map((r) => ({
          date: day(r.at),
          kind: r.kind,
          quantity: r.quantity,
          price: r.price,
          amount: money(r.amountCents),
          status: r.status
        }))
      }
    }
  }),

  value_history: tool({
    description:
      'Account value per day, with net deposits (paidIn). Days marked estimated are rebuilt from fills, cash movements and prices interpolated between trades, so they miss price moves between trades; other days are real synced snapshots. Say so when you use estimated days.',
    inputSchema: z.object({ days: z.number().int().min(2).max(3650).default(90) }),
    execute: async ({ days }) =>
      valueHistory(days).map((p) => ({
        day: p.day,
        value: money(p.totalCents),
        paidIn: money(p.investedCents),
        estimated: p.estimated
      }))
  }),

  find_instrument: tool({
    description:
      'Look up instruments available on Trading 212 by name, ticker or ISIN, from the locally cached instrument list.',
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(25).default(10)
    }),
    execute: async ({ query, limit }) => {
      const pattern = `%${query.replace(/[%_]/g, '')}%`
      return getDb().all<{
        ticker: string
        name: string
        isin: string | null
        currency: string | null
        type: string | null
      }>(sql`
        SELECT ticker, name, isin, currency, type FROM instrument
        WHERE ticker LIKE ${pattern} OR name LIKE ${pattern} OR short_name LIKE ${pattern} OR isin = ${query}
        ORDER BY length(name) LIMIT ${limit}
      `)
    }
  }),

  run_readonly_sql: tool({
    description: `Escape hatch: run one read-only SELECT against the local database when the other tools cannot answer. Max 200 rows.${SQL_SCHEMA_DESCRIPTION}`,
    inputSchema: z.object({ query: z.string().describe('A single SELECT statement') }),
    execute: async ({ query }) => runReadonlySql(query)
  })
}

export type Tools = typeof tools
