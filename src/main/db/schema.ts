import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Money in the account currency is integer cents (`*_cents`). Instrument prices and
 * share quantities are REAL, because they carry more precision than cents.
 * Timestamps are ms since epoch.
 */

/** Small key/value store for non-secret app settings. Secrets live in the OS keychain. */
export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

/** Non-secret state of the Trading 212 connection. Always a single row with id 1. */
export const t212Context = sqliteTable('t212_context', {
  id: integer('id').primaryKey(),
  environment: text('environment', { enum: ['demo', 'live'] }).notNull(),
  /** Trading 212 account number, from the account summary. */
  accountId: integer('account_id'),
  /** Primary account currency. Every wallet amount the API returns is in this currency. */
  currency: text('currency'),
  connectedAt: integer('connected_at').notNull(),
  lastSyncedAt: integer('last_synced_at'),
  instrumentsSyncedAt: integer('instruments_synced_at'),
  /** Last time pies were read successfully. */
  piesSyncedAt: integer('pies_synced_at'),
  /** Why the last pie read failed, e.g. a key without the pies permission. Null when it worked. */
  piesError: text('pies_error')
})

/**
 * One row per sync from `/equity/account/summary`. Trading 212 has no historical value
 * endpoint, so the value chart is built from these.
 */
export const accountSnapshot = sqliteTable(
  'account_snapshot',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    takenAt: integer('taken_at').notNull(),
    currency: text('currency').notNull(),
    totalCents: integer('total_cents').notNull(),
    /** Cost basis of open positions. */
    investedCents: integer('invested_cents').notNull(),
    /** Market value of open positions. */
    positionsValueCents: integer('positions_value_cents').notNull(),
    unrealizedCents: integer('unrealized_cents').notNull(),
    realizedCents: integer('realized_cents').notNull(),
    /** Cash available to trade. */
    cashCents: integer('cash_cents').notNull(),
    reservedCents: integer('reserved_cents').notNull().default(0),
    inPiesCents: integer('in_pies_cents').notNull().default(0)
  },
  (table) => [index('idx_snapshot_taken').on(table.takenAt)]
)

/** Instrument metadata, refreshed at most daily. Used for names, ISINs and asset types. */
export const instrument = sqliteTable(
  'instrument',
  {
    ticker: text('ticker').primaryKey(),
    name: text('name').notNull(),
    shortName: text('short_name'),
    isin: text('isin'),
    currency: text('currency'),
    /** STOCK | ETF | CRYPTOCURRENCY | … */
    type: text('type'),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [index('idx_instrument_isin').on(table.isin)]
)

/** Current open positions. Replaced wholesale on every sync. */
export const position = sqliteTable('position', {
  ticker: text('ticker').primaryKey(),
  name: text('name').notNull(),
  isin: text('isin'),
  instrumentCurrency: text('instrument_currency'),
  quantity: real('quantity').notNull(),
  quantityInPies: real('quantity_in_pies').notNull().default(0),
  /** Instrument currency, per share. */
  averagePrice: real('average_price').notNull(),
  /** Instrument currency, per share. */
  currentPrice: real('current_price').notNull(),
  valueCents: integer('value_cents').notNull(),
  costCents: integer('cost_cents').notNull(),
  unrealizedCents: integer('unrealized_cents').notNull(),
  fxCents: integer('fx_cents').notNull().default(0),
  openedAt: integer('opened_at'),
  updatedAt: integer('updated_at').notNull()
})

/** Pies from `/equity/pies` and `/equity/pies/{id}`. Replaced wholesale on every sync. */
export const pie = sqliteTable('pie', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  /** Market value of the pie's holdings. */
  valueCents: integer('value_cents').notNull(),
  investedCents: integer('invested_cents').notNull(),
  /** Unrealised P/L on the holdings. */
  resultCents: integer('result_cents').notNull(),
  /** P/L as a fraction of invested, as Trading 212 reports it. */
  returnPct: real('return_pct'),
  /** Uninvested cash sitting in the pie. */
  cashCents: integer('cash_cents').notNull().default(0),
  dividendsGainedCents: integer('dividends_gained_cents').notNull().default(0),
  dividendsReinvestedCents: integer('dividends_reinvested_cents').notNull().default(0),
  dividendsInCashCents: integer('dividends_in_cash_cents').notNull().default(0),
  /** REINVEST | TO_ACCOUNT_CASH */
  dividendCashAction: text('dividend_cash_action'),
  goalCents: integer('goal_cents'),
  /** Progress towards the goal, 0–1. */
  progress: real('progress'),
  /** AHEAD | ON_TRACK | BEHIND, relative to the goal. */
  status: text('status'),
  initialInvestmentCents: integer('initial_investment_cents'),
  createdAt: integer('created_at'),
  endAt: integer('end_at'),
  publicUrl: text('public_url'),
  updatedAt: integer('updated_at').notNull()
})

/** One instrument in a pie, with its target and actual weight. */
export const pieInstrument = sqliteTable(
  'pie_instrument',
  {
    pieId: integer('pie_id')
      .notNull()
      .references(() => pie.id, { onDelete: 'cascade' }),
    ticker: text('ticker').notNull(),
    /** Shares held through this pie. */
    quantity: real('quantity').notNull(),
    /** Target weight set in the pie, 0–1. */
    expectedShare: real('expected_share').notNull(),
    /** Actual weight by value, 0–1. */
    currentShare: real('current_share').notNull(),
    valueCents: integer('value_cents').notNull(),
    investedCents: integer('invested_cents').notNull(),
    resultCents: integer('result_cents').notNull(),
    returnPct: real('return_pct'),
    /** JSON array of { name, severity }, e.g. DELISTED or MAX_POSITION_SIZE_REACHED. */
    issues: text('issues', { mode: 'json' })
      .notNull()
      .$type<{ name: string; severity: string | null }[]>()
  },
  (table) => [
    primaryKey({ columns: [table.pieId, table.ticker] }),
    index('idx_pie_instrument_ticker').on(table.ticker)
  ]
)

/** Historical orders from `/equity/history/orders`, one row per order and fill. */
export const order = sqliteTable(
  'order',
  {
    /** `${orderId}:${fillId}`, or `${orderId}:0` for orders that never filled. */
    id: text('id').primaryKey(),
    orderId: integer('order_id').notNull(),
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    /** MARKET | LIMIT | STOP | STOP_LIMIT */
    type: text('type').notNull(),
    /** FILLED | CANCELLED | REJECTED | … */
    status: text('status').notNull(),
    /** TRADE, or a corporate action such as STOCK_SPLIT. */
    fillType: text('fill_type'),
    quantity: real('quantity'),
    /** Fill price in the instrument currency. */
    price: real('price'),
    instrumentCurrency: text('instrument_currency'),
    /** Signed cash effect in the account currency: buys negative, sells positive. */
    amountCents: integer('amount_cents').notNull().default(0),
    realizedCents: integer('realized_cents').notNull().default(0),
    feesCents: integer('fees_cents').notNull().default(0),
    fxRate: real('fx_rate'),
    initiatedFrom: text('initiated_from'),
    createdAt: integer('created_at').notNull(),
    /** When it filled, or when it was created for orders that did not. */
    at: integer('at').notNull()
  },
  (table) => [
    index('idx_order_at').on(table.at),
    index('idx_order_ticker').on(table.ticker, table.at)
  ]
)

export const dividend = sqliteTable(
  'dividend',
  {
    reference: text('reference').primaryKey(),
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    quantity: real('quantity'),
    /** Net amount in the account currency. */
    amountCents: integer('amount_cents').notNull(),
    grossPerShare: real('gross_per_share'),
    tickerCurrency: text('ticker_currency'),
    /** ORDINARY | INTEREST | RETURN_OF_CAPITAL | … */
    type: text('type'),
    paidAt: integer('paid_at').notNull()
  },
  (table) => [
    index('idx_dividend_paid').on(table.paidAt),
    index('idx_dividend_ticker').on(table.ticker, table.paidAt)
  ]
)

/** Deposits, withdrawals, fees and interest from `/equity/history/transactions`. */
export const cashTransaction = sqliteTable(
  'cash_transaction',
  {
    reference: text('reference').primaryKey(),
    /** DEPOSIT | WITHDRAW | FEE | TRANSFER | INTEREST_ON_FREE_CASH | LENDING_INTEREST */
    type: text('type').notNull(),
    /** Signed as reported: withdrawals and fees are negative. */
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    at: integer('at').notNull()
  },
  (table) => [index('idx_cash_at').on(table.at)]
)

/**
 * Backfill state per history stream. Trading 212 pages newest to oldest; `next_path` is
 * where the backfill resumes if a sync is interrupted.
 */
export const historyCursor = sqliteTable('history_cursor', {
  stream: text('stream', { enum: ['orders', 'dividends', 'transactions'] }).primaryKey(),
  nextPath: text('next_path'),
  backfillDone: integer('backfill_done', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull()
})

export const syncRun = sqliteTable('sync_run', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  positionsSynced: integer('positions_synced').notNull().default(0),
  activitiesSynced: integer('activities_synced').notNull().default(0),
  error: text('error')
})

/** A chat thread. Messages are stored as AI SDK UIMessage JSON; nothing ever leaves the machine. */
export const chat = sqliteTable('chat', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  messages: text('messages', { mode: 'json' }).notNull().$type<unknown[]>(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})
