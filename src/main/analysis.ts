import { sql, type SQL } from 'drizzle-orm'
import type {
  ActivityKind,
  ActivityQuery,
  ActivityRow,
  AllocationBy,
  AllocationSlice,
  DividendPayer,
  Insight,
  MonthlyFlow,
  PieGoalStatus,
  PieInstrumentRow,
  PieIssue,
  PiesState,
  PortfolioSummary,
  PositionRow
} from '../shared/ipc'
import { getDb } from './db'

/**
 * Everything the overview and the AI tools know about the portfolio, as plain SQL over
 * the local database. Nothing here talks to the network.
 */

const DAY = 86_400_000

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** First millisecond of the month `monthsBack` months before the current one, local time. */
function monthStart(monthsBack: number, now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
}

// ---------- Summary and positions ----------

export function portfolioSummary(): PortfolioSummary | null {
  const db = getDb()
  const snap = db.get<{
    taken_at: number
    currency: string
    total_cents: number
    invested_cents: number
    unrealized_cents: number
    realized_cents: number
    cash_cents: number
  }>(sql`SELECT * FROM account_snapshot ORDER BY taken_at DESC LIMIT 1`)
  if (!snap) return null
  const positions = db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM position`)?.n ?? 0
  return {
    currency: snap.currency,
    totalCents: snap.total_cents,
    investedCents: snap.invested_cents,
    unrealizedCents: snap.unrealized_cents,
    realizedCents: snap.realized_cents,
    cashCents: snap.cash_cents,
    positions,
    takenAt: snap.taken_at
  }
}

export function listPositions(): PositionRow[] {
  const rows = getDb().all<{
    ticker: string
    name: string
    isin: string | null
    instrument_currency: string | null
    type: string | null
    quantity: number
    average_price: number
    current_price: number
    value_cents: number
    cost_cents: number
    unrealized_cents: number
    fx_cents: number
    opened_at: number | null
  }>(sql`
    SELECT p.*, i.type AS type
    FROM position p LEFT JOIN instrument i ON i.ticker = p.ticker
    ORDER BY p.value_cents DESC
  `)
  const total = rows.reduce((a, r) => a + r.value_cents, 0)
  return rows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    isin: r.isin,
    instrumentCurrency: r.instrument_currency,
    type: r.type,
    quantity: r.quantity,
    averagePrice: r.average_price,
    currentPrice: r.current_price,
    valueCents: r.value_cents,
    costCents: r.cost_cents,
    unrealizedCents: r.unrealized_cents,
    fxCents: r.fx_cents,
    returnPct: r.cost_cents ? r.unrealized_cents / r.cost_cents : 0,
    weight: total ? r.value_cents / total : 0,
    openedAt: r.opened_at
  }))
}

/** GBX is pence; group it with GBP. */
function baseCurrency(currency: string | null): string {
  if (!currency) return 'Unknown'
  return currency === 'GBX' ? 'GBP' : currency
}

const TYPE_LABELS: Record<string, string> = {
  STOCK: 'Stocks',
  ETF: 'ETFs',
  CRYPTOCURRENCY: 'Crypto',
  CRYPTO: 'Crypto',
  WARRANT: 'Warrants'
}

const MAX_POSITION_SLICES = 10

export function allocation(by: AllocationBy): AllocationSlice[] {
  const positions = listPositions()
  const total = positions.reduce((a, p) => a + p.valueCents, 0)
  const groups = new Map<string, { label: string; valueCents: number }>()
  for (const p of positions) {
    const key =
      by === 'position'
        ? p.ticker
        : by === 'currency'
          ? baseCurrency(p.instrumentCurrency)
          : (p.type ?? 'UNKNOWN')
    const label =
      by === 'position'
        ? p.name
        : by === 'currency'
          ? key
          : (TYPE_LABELS[key] ?? (key === 'UNKNOWN' ? 'Unknown' : key))
    const g = groups.get(key) ?? { label, valueCents: 0 }
    g.valueCents += p.valueCents
    groups.set(key, g)
  }
  let slices = [...groups.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      valueCents: g.valueCents,
      share: total ? g.valueCents / total : 0
    }))
    .sort((a, b) => b.valueCents - a.valueCents)
  if (by === 'position' && slices.length > MAX_POSITION_SLICES) {
    const rest = slices.slice(MAX_POSITION_SLICES - 1)
    const value = rest.reduce((a, s) => a + s.valueCents, 0)
    slices = [
      ...slices.slice(0, MAX_POSITION_SLICES - 1),
      {
        key: '__other',
        label: `${rest.length} others`,
        valueCents: value,
        share: total ? value / total : 0
      }
    ]
  }
  return slices
}

// ---------- Pies ----------

const GOAL_STATUSES: PieGoalStatus[] = ['AHEAD', 'ON_TRACK', 'BEHIND']

function parseIssues(json: string): PieIssue[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as PieIssue[]) : []
  } catch {
    return []
  }
}

/** Fraction of invested, preferring Trading 212's own figure. */
function returnOf(reported: number | null, resultCents: number, investedCents: number): number {
  if (reported !== null) return reported
  return investedCents ? resultCents / investedCents : 0
}

export function listPies(): PiesState {
  const db = getDb()
  const context = db.get<{
    currency: string | null
    pies_synced_at: number | null
    pies_error: string | null
  }>(sql`SELECT currency, pies_synced_at, pies_error FROM t212_context WHERE id = 1`)
  const pies = db.all<{
    id: number
    name: string
    value_cents: number
    invested_cents: number
    result_cents: number
    return_pct: number | null
    cash_cents: number
    dividends_gained_cents: number
    dividends_reinvested_cents: number
    dividends_in_cash_cents: number
    dividend_cash_action: string | null
    goal_cents: number | null
    progress: number | null
    status: string | null
    initial_investment_cents: number | null
    created_at: number | null
    end_at: number | null
    public_url: string | null
  }>(sql`SELECT * FROM pie ORDER BY value_cents + cash_cents DESC, name`)
  const instruments = db.all<{
    pie_id: number
    ticker: string
    name: string
    instrument_currency: string | null
    quantity: number
    expected_share: number
    current_share: number
    value_cents: number
    invested_cents: number
    result_cents: number
    return_pct: number | null
    issues: string
  }>(sql`
    SELECT pi.*,
      COALESCE(i.name, p.name, pi.ticker) AS name,
      COALESCE(i.currency, p.instrument_currency) AS instrument_currency
    FROM pie_instrument pi
    LEFT JOIN instrument i ON i.ticker = pi.ticker
    LEFT JOIN position p ON p.ticker = pi.ticker
    ORDER BY pi.value_cents DESC, pi.expected_share DESC
  `)
  const byPie = new Map<number, PieInstrumentRow[]>()
  for (const r of instruments) {
    const list = byPie.get(r.pie_id) ?? []
    list.push({
      ticker: r.ticker,
      name: r.name,
      instrumentCurrency: r.instrument_currency,
      quantity: r.quantity,
      valueCents: r.value_cents,
      investedCents: r.invested_cents,
      resultCents: r.result_cents,
      returnPct: returnOf(r.return_pct, r.result_cents, r.invested_cents),
      targetShare: r.expected_share,
      currentShare: r.current_share,
      issues: parseIssues(r.issues)
    })
    byPie.set(r.pie_id, list)
  }
  return {
    currency: context?.currency ?? null,
    syncedAt: context?.pies_synced_at ?? null,
    error: context?.pies_error ?? null,
    pies: pies.map((p) => ({
      id: p.id,
      name: p.name,
      valueCents: p.value_cents,
      investedCents: p.invested_cents,
      resultCents: p.result_cents,
      returnPct: returnOf(p.return_pct, p.result_cents, p.invested_cents),
      cashCents: p.cash_cents,
      dividendsGainedCents: p.dividends_gained_cents,
      dividendsReinvestedCents: p.dividends_reinvested_cents,
      dividendsInCashCents: p.dividends_in_cash_cents,
      dividendCashAction:
        p.dividend_cash_action === 'REINVEST' || p.dividend_cash_action === 'TO_ACCOUNT_CASH'
          ? p.dividend_cash_action
          : null,
      goalCents: p.goal_cents,
      progress: p.progress,
      goalStatus: GOAL_STATUSES.includes(p.status as PieGoalStatus)
        ? (p.status as PieGoalStatus)
        : null,
      initialInvestmentCents: p.initial_investment_cents,
      createdAt: p.created_at,
      endAt: p.end_at,
      publicUrl: p.public_url,
      instruments: byPie.get(p.id) ?? []
    }))
  }
}

// ---------- Activity feed ----------

/**
 * Orders, dividends and cash movements as one feed. A UNION ALL keeps it one query with
 * one ORDER BY, so paging stays stable across kinds.
 */
const ACTIVITY_SQL = sql`
  SELECT 'order:' || o.id AS id,
         CASE WHEN o.side = 'SELL' THEN 'sell' ELSE 'buy' END AS kind,
         o.ticker AS ticker, o.name AS label, o.quantity AS quantity, o.price AS price,
         o.amount_cents AS amount_cents, o.status AS status, o.at AS at,
         o.instrument_currency AS currency
  FROM "order" o
  UNION ALL
  SELECT 'dividend:' || d.reference, 'dividend', d.ticker, d.name, d.quantity, d.gross_per_share,
         d.amount_cents, d.type, d.paid_at, d.ticker_currency
  FROM dividend d
  UNION ALL
  SELECT 'cash:' || c.reference,
         CASE c.type WHEN 'DEPOSIT' THEN 'deposit' WHEN 'WITHDRAW' THEN 'withdrawal'
                     WHEN 'FEE' THEN 'fee' ELSE 'other' END,
         NULL,
         CASE c.type WHEN 'DEPOSIT' THEN 'Deposit' WHEN 'WITHDRAW' THEN 'Withdrawal'
                     WHEN 'FEE' THEN 'Fee' WHEN 'INTEREST_ON_FREE_CASH' THEN 'Interest on cash'
                     WHEN 'LENDING_INTEREST' THEN 'Share lending interest'
                     WHEN 'TRANSFER' THEN 'Transfer' ELSE c.type END,
         NULL, NULL, c.amount_cents, c.type, c.at, c.currency
  FROM cash_transaction c
`

const KINDS: ActivityKind[] = ['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'other']
export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && (KINDS as string[]).includes(value)
}

export function listActivity(query: ActivityQuery): { rows: ActivityRow[]; total: number } {
  const filters: SQL[] = [sql`1 = 1`]
  if (query.kind) filters.push(sql`a.kind = ${query.kind}`)
  if (query.ticker) filters.push(sql`a.ticker = ${query.ticker}`)
  if (query.search) {
    const pattern = `%${query.search.replace(/[%_]/g, '')}%`
    filters.push(sql`(a.ticker LIKE ${pattern} OR a.label LIKE ${pattern})`)
  }
  if (query.from) filters.push(sql`a.at >= ${query.from}`)
  if (query.to) filters.push(sql`a.at < ${query.to}`)
  const where = sql.join(filters, sql` AND `)
  const limit = Math.min(Math.max(query.limit, 1), 500)
  const offset = Math.max(query.offset, 0)

  const db = getDb()
  const rows = db.all<{
    id: string
    kind: ActivityKind
    ticker: string | null
    label: string
    quantity: number | null
    price: number | null
    amount_cents: number
    status: string | null
    at: number
    currency: string | null
  }>(
    sql`SELECT * FROM (${ACTIVITY_SQL}) a WHERE ${where} ORDER BY a.at DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`
  )
  const total =
    db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM (${ACTIVITY_SQL}) a WHERE ${where}`)?.n ?? 0

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      ticker: r.ticker,
      label: r.label,
      quantity: r.quantity,
      price: r.price,
      amountCents: r.amount_cents,
      status: r.status,
      at: r.at,
      currency: r.currency
    }))
  }
}

// ---------- Time series ----------

export { valueHistory } from './value-history'

export function monthlyFlows(months: number, now = new Date()): MonthlyFlow[] {
  const from = monthStart(months - 1, now).getTime()
  const db = getDb()
  const result = new Map<string, MonthlyFlow>()
  for (let i = months - 1; i >= 0; i--) {
    const key = monthKey(monthStart(i, now))
    result.set(key, {
      month: key,
      depositsCents: 0,
      withdrawalsCents: 0,
      buysCents: 0,
      sellsCents: 0,
      dividendsCents: 0,
      feesCents: 0
    })
  }
  const month = (column: string): SQL =>
    sql.raw(`strftime('%Y-%m', ${column} / 1000, 'unixepoch', 'localtime')`)

  for (const r of db.all<{ month: string; buys: number; sells: number; fees: number }>(sql`
    SELECT ${month('at')} AS month,
           SUM(CASE WHEN side = 'BUY' THEN -amount_cents ELSE 0 END) AS buys,
           SUM(CASE WHEN side = 'SELL' THEN amount_cents ELSE 0 END) AS sells,
           SUM(fees_cents) AS fees
    FROM "order" WHERE at >= ${from} GROUP BY month
  `)) {
    const m = result.get(r.month)
    if (!m) continue
    m.buysCents = r.buys
    m.sellsCents = r.sells
    m.feesCents += r.fees
  }
  for (const r of db.all<{ month: string; amount: number }>(sql`
    SELECT ${month('paid_at')} AS month, SUM(amount_cents) AS amount
    FROM dividend WHERE paid_at >= ${from} GROUP BY month
  `)) {
    const m = result.get(r.month)
    if (m) m.dividendsCents = r.amount
  }
  for (const r of db.all<{ month: string; type: string; amount: number }>(sql`
    SELECT ${month('at')} AS month, type, SUM(amount_cents) AS amount
    FROM cash_transaction WHERE at >= ${from} GROUP BY month, type
  `)) {
    const m = result.get(r.month)
    if (!m) continue
    if (r.type === 'DEPOSIT') m.depositsCents += r.amount
    else if (r.type === 'WITHDRAW') m.withdrawalsCents += -r.amount
    else if (r.type === 'FEE') m.feesCents += -r.amount
  }
  return [...result.values()]
}

export function dividendPayers(months: number, limit: number, now = new Date()): DividendPayer[] {
  const from = monthStart(months - 1, now).getTime()
  return getDb()
    .all<{ ticker: string; name: string; amount: number; payments: number }>(
      sql`
      SELECT ticker, MAX(name) AS name, SUM(amount_cents) AS amount, COUNT(*) AS payments
      FROM dividend WHERE paid_at >= ${from}
      GROUP BY ticker ORDER BY amount DESC LIMIT ${limit}
    `
    )
    .map((r) => ({ ticker: r.ticker, name: r.name, amountCents: r.amount, payments: r.payments }))
}

/** Totals for one date range, for the AI tools. */
export function rangeTotals(from: number, to: number) {
  const db = getDb()
  const orders = db.get<{
    buys: number
    sells: number
    realized: number
    fees: number
    n: number
  }>(sql`
    SELECT COALESCE(SUM(CASE WHEN side = 'BUY' THEN -amount_cents ELSE 0 END), 0) AS buys,
           COALESCE(SUM(CASE WHEN side = 'SELL' THEN amount_cents ELSE 0 END), 0) AS sells,
           COALESCE(SUM(realized_cents), 0) AS realized,
           COALESCE(SUM(fees_cents), 0) AS fees,
           COUNT(*) AS n
    FROM "order" WHERE at >= ${from} AND at <= ${to}
  `)
  const dividends =
    db.get<{ amount: number }>(sql`
      SELECT COALESCE(SUM(amount_cents), 0) AS amount FROM dividend
      WHERE paid_at >= ${from} AND paid_at <= ${to}
    `)?.amount ?? 0
  const cash = db.get<{
    deposits: number
    withdrawals: number
    fees: number
    interest: number
  }>(sql`
    SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount_cents ELSE 0 END), 0) AS deposits,
           COALESCE(SUM(CASE WHEN type = 'WITHDRAW' THEN -amount_cents ELSE 0 END), 0) AS withdrawals,
           COALESCE(SUM(CASE WHEN type = 'FEE' THEN -amount_cents ELSE 0 END), 0) AS fees,
           COALESCE(SUM(CASE WHEN type IN ('INTEREST_ON_FREE_CASH', 'LENDING_INTEREST') THEN amount_cents ELSE 0 END), 0) AS interest
    FROM cash_transaction WHERE at >= ${from} AND at <= ${to}
  `)
  return {
    buysCents: orders?.buys ?? 0,
    sellsCents: orders?.sells ?? 0,
    realizedCents: orders?.realized ?? 0,
    orders: orders?.n ?? 0,
    dividendsCents: dividends,
    depositsCents: cash?.deposits ?? 0,
    withdrawalsCents: cash?.withdrawals ?? 0,
    interestCents: cash?.interest ?? 0,
    feesCents: (orders?.fees ?? 0) + (cash?.fees ?? 0)
  }
}

// ---------- Insights ----------

const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`

/** Rule-based observations, computed locally on every call. No advice, just facts. */
export function insights(now = Date.now()): Insight[] {
  const out: Insight[] = []
  const summary = portfolioSummary()
  const positions = listPositions()
  if (!summary) return out

  const top = positions[0]
  if (top && positions.length > 1 && top.weight >= 0.25) {
    out.push({
      id: 'concentration-top',
      kind: 'concentration',
      severity: top.weight >= 0.4 ? 'warn' : 'info',
      title: `${top.name} is ${pct(top.weight)} of your holdings`,
      detail: 'A single position this large drives most of the portfolio’s swings.'
    })
  }
  const top3 = positions.slice(0, 3).reduce((a, p) => a + p.weight, 0)
  if (positions.length > 5 && top3 >= 0.6) {
    out.push({
      id: 'concentration-top3',
      kind: 'concentration',
      severity: 'info',
      title: `Top 3 positions hold ${pct(top3)}`,
      detail: `${positions
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ')}.`
    })
  }

  if (summary.totalCents > 0) {
    const cashShare = summary.cashCents / summary.totalCents
    if (cashShare >= 0.15) {
      out.push({
        id: 'cash-share',
        kind: 'cash',
        severity: 'info',
        title: `${pct(cashShare)} of the account is uninvested cash`,
        detail: 'Cash is not exposed to the market, for better and for worse.'
      })
    }
  }

  const winners = positions
    .filter((p) => p.returnPct >= 0.3)
    .sort((a, b) => b.returnPct - a.returnPct)
  const losers = positions
    .filter((p) => p.returnPct <= -0.2)
    .sort((a, b) => a.returnPct - b.returnPct)
  if (winners[0]) {
    out.push({
      id: `mover-up-${winners[0].ticker}`,
      kind: 'mover',
      severity: 'info',
      title: `${winners[0].name} is up ${pct(winners[0].returnPct)} on cost`,
      detail: `Unrealised gain of ${(winners[0].unrealizedCents / 100).toFixed(2)} ${summary.currency}.`
    })
  }
  if (losers[0]) {
    out.push({
      id: `mover-down-${losers[0].ticker}`,
      kind: 'mover',
      severity: 'warn',
      title: `${losers[0].name} is down ${pct(-losers[0].returnPct)} on cost`,
      detail: `Unrealised loss of ${(-losers[0].unrealizedCents / 100).toFixed(2)} ${summary.currency}.`
    })
  }

  const yearAgo = now - 365 * DAY
  const last12 = rangeTotals(yearAgo, now)
  const prev12 = rangeTotals(yearAgo - 365 * DAY, yearAgo)
  if (last12.dividendsCents > 0 && prev12.dividendsCents > 0) {
    const change = (last12.dividendsCents - prev12.dividendsCents) / prev12.dividendsCents
    if (Math.abs(change) >= 0.1) {
      out.push({
        id: 'dividends-trend',
        kind: 'dividends',
        severity: change < 0 ? 'warn' : 'info',
        title: `Dividend income ${change > 0 ? 'up' : 'down'} ${pct(Math.abs(change))} year on year`,
        detail: `${(last12.dividendsCents / 100).toFixed(2)} ${summary.currency} in the last 12 months.`
      })
    }
  }
  if (last12.feesCents >= 100) {
    out.push({
      id: 'fees-12m',
      kind: 'fees',
      severity: 'info',
      title: `${(last12.feesCents / 100).toFixed(2)} ${summary.currency} in fees and taxes over 12 months`,
      detail: 'Mostly FX conversion and stamp duty, recorded per order.'
    })
  }
  return out
}
