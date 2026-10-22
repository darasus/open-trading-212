// Fills a fresh database with a made-up portfolio, for screenshots and demos. Nothing here comes
// from a real account: prices are a seeded random walk between two round numbers per instrument.
//
//   node scripts/demo-data.mjs <user-data-dir>
//
// Then run the app with `--user-data-dir=<user-data-dir>` to see it. Refuses to touch an existing
// database, so it can't overwrite real data.
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const DAY = 24 * 60 * 60 * 1000
const USD_GBP = 0.78
/**
 * Picked on 2026-10-22 so the last 90 days and the last year both trend up. The walk's length
 * depends on today's date, so if a later run looks flat or falling, try another seed.
 */
const SEED = 39

// p0 on the first day, p1 today, in the instrument currency (GBX is pence). Yields are yearly.
const INSTRUMENTS = [
  {
    ticker: 'VUSAl_EQ',
    name: 'Vanguard S&P 500 UCITS ETF',
    isin: 'IE00B3XXRP09',
    currency: 'GBP',
    type: 'ETF',
    p0: 62,
    p1: 98,
    vol: 0.008,
    yield: 0.011,
    months: [3, 6, 9, 12]
  },
  {
    ticker: 'VWRLl_EQ',
    name: 'Vanguard FTSE All-World UCITS ETF',
    isin: 'IE00B3RBWM25',
    currency: 'GBP',
    type: 'ETF',
    p0: 87,
    p1: 122,
    vol: 0.007,
    yield: 0.018,
    months: [3, 6, 9, 12]
  },
  {
    ticker: 'AZNl_EQ',
    name: 'AstraZeneca',
    isin: 'GB0009895292',
    currency: 'GBX',
    type: 'STOCK',
    p0: 11400,
    p1: 12800,
    vol: 0.013,
    yield: 0.02,
    months: [3, 9]
  },
  {
    ticker: 'KO_US_EQ',
    name: 'Coca-Cola',
    isin: 'US1912161007',
    currency: 'USD',
    type: 'STOCK',
    p0: 63,
    p1: 69,
    vol: 0.009,
    yield: 0.03,
    months: [4, 7, 10, 12],
    pie: 1
  },
  {
    ticker: 'O_US_EQ',
    name: 'Realty Income',
    isin: 'US7561091049',
    currency: 'USD',
    type: 'STOCK',
    p0: 62,
    p1: 57,
    vol: 0.011,
    yield: 0.055,
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    pie: 1
  },
  {
    ticker: 'LGENl_EQ',
    name: 'Legal & General',
    isin: 'GB0005603997',
    currency: 'GBX',
    type: 'STOCK',
    p0: 240,
    p1: 248,
    vol: 0.012,
    yield: 0.08,
    months: [6, 9],
    pie: 1
  },
  {
    ticker: 'ULVRl_EQ',
    name: 'Unilever',
    isin: 'GB00B10RZP78',
    currency: 'GBX',
    type: 'STOCK',
    p0: 4200,
    p1: 4650,
    vol: 0.01,
    yield: 0.035,
    months: [3, 6, 9, 12],
    pie: 1
  },
  {
    ticker: 'AAPL_US_EQ',
    name: 'Apple',
    isin: 'US0378331005',
    currency: 'USD',
    type: 'STOCK',
    p0: 166,
    p1: 248,
    vol: 0.015,
    yield: 0.005,
    months: [2, 5, 8, 11],
    pie: 2
  },
  {
    ticker: 'MSFT_US_EQ',
    name: 'Microsoft',
    isin: 'US5949181045',
    currency: 'USD',
    type: 'STOCK',
    p0: 288,
    p1: 512,
    vol: 0.015,
    yield: 0.008,
    months: [3, 6, 9, 12],
    pie: 2
  },
  {
    ticker: 'NVDA_US_EQ',
    name: 'NVIDIA',
    isin: 'US67066G1040',
    currency: 'USD',
    type: 'STOCK',
    p0: 27.5,
    p1: 182,
    vol: 0.03,
    yield: 0.0003,
    months: [3, 6, 9, 12],
    pie: 2
  }
]

const PIES = [
  { id: 1, name: 'Dividend income', goalCents: 2_000_000 },
  { id: 2, name: 'Big tech', goalCents: null }
]

// Each month's £600 deposit: £200 S&P 500, £100 All-World, £150 into each pie. AstraZeneca gets
// £300 every third month.
const MONTHLY = { VUSAl_EQ: 200, VWRLl_EQ: 100 }
const PIE_MONTHLY = 150

/** mulberry32: small, seeded, so the demo comes out the same every run. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand())
}

/** Daily prices from p0 to p1: a Brownian bridge around the straight line in log space. */
function pricePath(inst, days, rand) {
  const walk = [0]
  for (let d = 1; d < days; d++) walk.push(walk[d - 1] + gaussian(rand) * inst.vol)
  const end = walk[days - 1]
  const [a, b] = [Math.log(inst.p0), Math.log(inst.p1)]
  return walk.map((w, d) => {
    const t = d / (days - 1)
    return Math.exp(a + (b - a) * t + w - t * end)
  })
}

/** Instrument-currency amount to pounds. */
function toGbp(currency, amount) {
  if (currency === 'GBX') return amount / 100
  if (currency === 'USD') return amount * USD_GBP
  return amount
}

const cents = (pounds) => Math.round(pounds * 100)
const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits

export function seedDemo(userDataDir, { now = Date.now(), seed = SEED } = {}) {
  const dbPath = join(userDataDir, 'opentrading212.db')
  if (existsSync(dbPath))
    throw new Error(`${dbPath} already exists; demo data only goes into a fresh profile`)
  mkdirSync(userDataDir, { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  migrate(drizzle(sqlite), { migrationsFolder: resolve(import.meta.dirname, '../drizzle') })

  const today = new Date(now)
  today.setHours(18, 0, 0, 0)
  const start = new Date(today.getFullYear() - 3, today.getMonth() - 6, 3, 18).getTime()
  const days = Math.round((today.getTime() - start) / DAY) + 1
  const dayAt = (d) => start + d * DAY
  const rand = random(seed)
  const prices = new Map(INSTRUMENTS.map((inst) => [inst.ticker, pricePath(inst, days, rand)]))

  const holdings = new Map(
    INSTRUMENTS.map((inst) => [inst.ticker, { qty: 0, costGbp: 0, costCcy: 0, openedAt: null }])
  )
  const orders = []
  const dividends = []
  const cash = []
  let cashGbp = 0
  let orderId = 3_100_000_000

  const buy = (inst, gbp, d, from) => {
    const price = prices.get(inst.ticker)[d]
    const qty = round(gbp / toGbp(inst.currency, price), 6)
    const spent = qty * toGbp(inst.currency, price)
    const h = holdings.get(inst.ticker)
    h.qty += qty
    h.costGbp += spent
    h.costCcy += qty * price
    h.openedAt ??= dayAt(d)
    cashGbp -= spent
    const at = dayAt(d) - 7 * 60 * 60 * 1000 + orders.length * 1000
    orderId += 1
    orders.push({
      id: `${orderId}:${orderId + 7}`,
      orderId,
      inst,
      qty,
      price,
      amountCents: -cents(spent),
      fxRate: inst.currency === 'USD' ? USD_GBP : 1,
      from,
      at
    })
  }

  const deposit = (gbp, d) => {
    cashGbp += gbp
    cash.push({ type: 'DEPOSIT', amountCents: cents(gbp), at: dayAt(d) - 9 * 60 * 60 * 1000 })
  }

  for (let d = 0; d < days; d++) {
    const date = new Date(dayAt(d))
    const firstDay = d === 0
    if (firstDay) {
      deposit(5000, d)
      buy(INSTRUMENTS[0], 2000, d, 'WEB')
      buy(INSTRUMENTS[1], 1500, d, 'WEB')
      buy(INSTRUMENTS[2], 500, d, 'WEB')
    }
    if (date.getDate() === 3 && !firstDay) {
      deposit(600, d)
      for (const inst of INSTRUMENTS) {
        if (MONTHLY[inst.ticker]) buy(inst, MONTHLY[inst.ticker], d, 'AUTOINVEST')
      }
      for (const pie of PIES) {
        const members = INSTRUMENTS.filter((inst) => inst.pie === pie.id)
        for (const inst of members) buy(inst, PIE_MONTHLY / members.length, d, 'AUTOINVEST')
      }
      if (date.getMonth() % 3 === 0) {
        deposit(300, d)
        buy(INSTRUMENTS[2], 300, d, 'IOS')
      }
    }
    if (date.getDate() === 15) {
      for (const inst of INSTRUMENTS) {
        const h = holdings.get(inst.ticker)
        if (!inst.months.includes(date.getMonth() + 1) || h.qty === 0) continue
        const gross = (prices.get(inst.ticker)[d] * inst.yield) / inst.months.length
        const net = h.qty * toGbp(inst.currency, gross) * (inst.currency === 'USD' ? 0.85 : 1)
        cashGbp += net
        dividends.push({
          inst,
          qty: h.qty,
          gross,
          amountCents: cents(net),
          at: dayAt(d) - 4 * 60 * 60 * 1000
        })
      }
    }
    if (date.getDate() === 1 && cashGbp > 0 && !firstDay) {
      const interest = (cashGbp * 0.04) / 12
      cashGbp += interest
      cash.push({
        type: 'INTEREST_ON_FREE_CASH',
        amountCents: cents(interest),
        at: dayAt(d) - 12 * 60 * 60 * 1000
      })
    }
  }

  // Account snapshots: one a day, as if the app had been open every evening. Holdings are
  // replayed from the orders so each day's value matches its own prices.
  const snapshots = []
  {
    const qty = new Map()
    const cost = new Map()
    let o = 0
    let c = 0
    let running = 0
    const flows = [...cash, ...dividends].sort((x, y) => x.at - y.at)
    for (let d = 0; d < days; d++) {
      const end = dayAt(d) + 1
      for (; o < orders.length && orders[o].at < end; o++) {
        const ord = orders[o]
        qty.set(ord.inst.ticker, (qty.get(ord.inst.ticker) ?? 0) + ord.qty)
        cost.set(ord.inst.ticker, (cost.get(ord.inst.ticker) ?? 0) - ord.amountCents)
        running += ord.amountCents
      }
      for (; c < flows.length && flows[c].at < end; c++) running += flows[c].amountCents
      let valueCents = 0
      let inPiesCents = 0
      for (const inst of INSTRUMENTS) {
        const value = cents(
          (qty.get(inst.ticker) ?? 0) * toGbp(inst.currency, prices.get(inst.ticker)[d])
        )
        valueCents += value
        if (inst.pie) inPiesCents += value
      }
      const investedCents = [...cost.values()].reduce((a, b) => a + b, 0)
      snapshots.push({
        takenAt: dayAt(d),
        totalCents: valueCents + running,
        investedCents,
        positionsValueCents: valueCents,
        unrealizedCents: valueCents - investedCents,
        cashCents: running,
        inPiesCents
      })
    }
  }

  const insert = (table, row) => {
    const cols = Object.keys(row)
    sqlite
      .prepare(
        `INSERT INTO "${table}" (${cols.map((k) => `"${k}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      )
      .run(...cols.map((k) => row[k]))
  }

  const last = days - 1
  sqlite.transaction(() => {
    // Ollama needs no key and only ever talks to localhost, so the chat page renders without one.
    for (const [key, value] of [
      ['ai.provider', 'ollama'],
      ['ai.model.ollama', 'qwen3:14b'],
      ['ai.localOnly', 'true']
    ]) {
      insert('setting', { key, value, updated_at: now })
    }
    insert('t212_context', {
      id: 1,
      environment: 'live',
      account_id: 40012345,
      currency: 'GBP',
      connected_at: start,
      last_synced_at: now - 6 * 60 * 1000,
      instruments_synced_at: now,
      pies_synced_at: now,
      pies_error: null
    })

    for (const inst of INSTRUMENTS) {
      insert('instrument', {
        ticker: inst.ticker,
        name: inst.name,
        short_name: inst.ticker.split('_')[0].replace(/l$/, ''),
        isin: inst.isin,
        currency: inst.currency,
        type: inst.type,
        updated_at: now
      })
      const h = holdings.get(inst.ticker)
      const price = prices.get(inst.ticker)[last]
      const valueCents = cents(h.qty * toGbp(inst.currency, price))
      const costCents = cents(h.costGbp)
      insert('position', {
        ticker: inst.ticker,
        name: inst.name,
        isin: inst.isin,
        instrument_currency: inst.currency,
        quantity: round(h.qty, 6),
        quantity_in_pies: inst.pie ? round(h.qty, 6) : 0,
        average_price: round(h.costCcy / h.qty, 4),
        current_price: round(price, 4),
        value_cents: valueCents,
        cost_cents: costCents,
        unrealized_cents: valueCents - costCents,
        fx_cents: 0,
        opened_at: h.openedAt,
        updated_at: now
      })
    }

    for (const pie of PIES) {
      const members = INSTRUMENTS.filter((inst) => inst.pie === pie.id)
      const rows = members.map((inst) => {
        const h = holdings.get(inst.ticker)
        const valueCents = cents(h.qty * toGbp(inst.currency, prices.get(inst.ticker)[last]))
        return { inst, qty: h.qty, valueCents, investedCents: cents(h.costGbp) }
      })
      const valueCents = rows.reduce((a, r) => a + r.valueCents, 0)
      const investedCents = rows.reduce((a, r) => a + r.investedCents, 0)
      const dividendCents = dividends
        .filter((dv) => dv.inst.pie === pie.id)
        .reduce((a, dv) => a + dv.amountCents, 0)
      insert('pie', {
        id: pie.id,
        name: pie.name,
        icon: null,
        value_cents: valueCents,
        invested_cents: investedCents,
        result_cents: valueCents - investedCents,
        return_pct: round((valueCents - investedCents) / investedCents, 4),
        cash_cents: 0,
        dividends_gained_cents: dividendCents,
        dividends_reinvested_cents: 0,
        dividends_in_cash_cents: dividendCents,
        dividend_cash_action: 'TO_ACCOUNT_CASH',
        goal_cents: pie.goalCents,
        progress: pie.goalCents ? round(valueCents / pie.goalCents, 4) : null,
        status: pie.goalCents ? 'ON_TRACK' : null,
        initial_investment_cents: null,
        created_at: start + 30 * DAY,
        end_at: null,
        public_url: null,
        updated_at: now
      })
      for (const r of rows) {
        insert('pie_instrument', {
          pie_id: pie.id,
          ticker: r.inst.ticker,
          quantity: round(r.qty, 6),
          expected_share: round(1 / rows.length, 4),
          current_share: round(r.valueCents / valueCents, 4),
          value_cents: r.valueCents,
          invested_cents: r.investedCents,
          result_cents: r.valueCents - r.investedCents,
          return_pct: round((r.valueCents - r.investedCents) / r.investedCents, 4),
          issues: '[]'
        })
      }
    }

    for (const o of orders) {
      insert('order', {
        id: o.id,
        order_id: o.orderId,
        ticker: o.inst.ticker,
        name: o.inst.name,
        side: 'BUY',
        type: 'MARKET',
        status: 'FILLED',
        fill_type: 'TRADE',
        quantity: o.qty,
        price: round(o.price, 4),
        instrument_currency: o.inst.currency,
        amount_cents: o.amountCents,
        realized_cents: 0,
        fees_cents: 0,
        fx_rate: o.fxRate,
        initiated_from: o.from,
        created_at: o.at - 2000,
        at: o.at
      })
    }
    dividends.forEach((dv, i) => {
      insert('dividend', {
        reference: `demo-div-${i}`,
        ticker: dv.inst.ticker,
        name: dv.inst.name,
        quantity: round(dv.qty, 6),
        amount_cents: dv.amountCents,
        gross_per_share: round(dv.gross, 4),
        ticker_currency: dv.inst.currency,
        type: 'ORDINARY',
        paid_at: dv.at
      })
    })
    cash.forEach((tx, i) => {
      insert('cash_transaction', {
        reference: `demo-cash-${i}`,
        type: tx.type,
        amount_cents: tx.amountCents,
        currency: 'GBP',
        at: tx.at
      })
    })
    for (const s of snapshots) {
      insert('account_snapshot', {
        taken_at: s.takenAt,
        currency: 'GBP',
        total_cents: s.totalCents,
        invested_cents: s.investedCents,
        positions_value_cents: s.positionsValueCents,
        unrealized_cents: s.unrealizedCents,
        realized_cents: 0,
        cash_cents: s.cashCents,
        reserved_cents: 0,
        in_pies_cents: s.inPiesCents
      })
    }
    for (const stream of ['orders', 'dividends', 'transactions']) {
      insert('history_cursor', { stream, next_path: null, backfill_done: 1, updated_at: now })
    }
    insert('sync_run', {
      started_at: now - 6 * 60 * 1000 - 9000,
      finished_at: now - 6 * 60 * 1000,
      status: 'completed',
      positions_synced: INSTRUMENTS.length,
      activities_synced: 0,
      error: null
    })

    insert('chat', demoChat(sqlite, now))
  })()

  sqlite.close()
  return dbPath
}

/** One answered question, with the tool result computed from the demo data like the real tool. */
function demoChat(sqlite, now) {
  const from = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - 11, 1).getTime()
  const payers = sqlite
    .prepare(
      'SELECT ticker, MAX(name) AS name, SUM(amount_cents) AS amount, COUNT(*) AS payments FROM dividend WHERE paid_at >= ? GROUP BY ticker ORDER BY amount DESC LIMIT 5'
    )
    .all(from)
  const totalCents = sqlite
    .prepare('SELECT SUM(amount_cents) AS total FROM dividend WHERE paid_at >= ?')
    .get(from).total
  const pounds = (c) =>
    `£${(c / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const share = (c) => `${Math.round((c / totalCents) * 100)}%`
  const [first, second, third] = payers
  const steadiest = payers.reduce((a, b) => (b.payments > a.payments ? b : a))
  const answer = [
    `You received **${pounds(totalCents)}** in dividends over the last 12 months.`,
    '',
    '| Payer | Amount | Payments |',
    '| --- | ---: | ---: |',
    ...payers.map((p) => `| ${p.name} | ${pounds(p.amount)} | ${p.payments} |`),
    '',
    `${first.name} is the biggest source at ${share(first.amount)} of the total, followed by ${second.name} (${share(second.amount)}) and ${third.name} (${share(third.amount)}). ${steadiest.name} paid ${steadiest.payments} times, so it is the steadiest income; the rest pay two to four times a year.`
  ].join('\n')

  const messages = [
    {
      id: 'demo-user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Where did my dividend income come from over the last year?' }]
    },
    {
      id: 'demo-assistant-1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-dividend_income',
          toolCallId: 'demo-call-1',
          state: 'output-available',
          input: { months: 12, limit: 5 },
          output: {
            window: '12 months',
            total: totalCents / 100,
            payers: payers.map((p) => ({
              ticker: p.ticker,
              name: p.name,
              amount: p.amount / 100,
              payments: p.payments
            }))
          }
        },
        { type: 'step-start' },
        { type: 'text', text: answer, state: 'done' }
      ]
    }
  ]
  return {
    id: 'demo-chat-1',
    title: 'Dividend income over the last year',
    messages: JSON.stringify(messages),
    created_at: now - 20 * 60 * 1000,
    updated_at: now - 19 * 60 * 1000
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Usage: node scripts/demo-data.mjs <user-data-dir>')
    process.exit(1)
  }
  console.log(`Demo data written to ${seedDemo(resolve(dir))}`)
}
