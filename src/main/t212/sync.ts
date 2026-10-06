import { eq, sql } from 'drizzle-orm'
import type { HistoryStream, SyncProgress, SyncResult } from '../../shared/ipc'
import { getDb } from '../db'
import {
  accountSnapshot,
  cashTransaction,
  dividend,
  historyCursor,
  instrument,
  order,
  pie,
  pieInstrument,
  position,
  syncRun
} from '../db/schema'
import {
  getClient,
  getContext,
  markInstrumentsSynced,
  markPies,
  markSynced,
  type RawAccountSummary,
  type RawCashTransaction,
  type RawDividend,
  type RawHistoricalOrder,
  type RawInstrument,
  type RawPie,
  type RawPieDetail,
  type RawPosition,
  type Page,
  type T212Client
} from './api'

export type ProgressListener = (progress: SyncProgress) => void

const INSTRUMENTS_MAX_AGE_MS = 24 * 60 * 60 * 1000

let running = false
export function isSyncing(): boolean {
  return running
}

/** Account-currency amount to integer cents. */
export function toCents(value: number | null | undefined): number {
  return value == null || Number.isNaN(value) ? 0 : Math.round(value * 100)
}

export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

// ---------- Account and positions ----------

export function storeSnapshot(summary: RawAccountSummary, takenAt = Date.now()): void {
  const cash = summary.cash ?? {}
  const inv = summary.investments ?? {}
  getDb()
    .insert(accountSnapshot)
    .values({
      takenAt,
      currency: summary.currency ?? 'EUR',
      totalCents: toCents(summary.totalValue),
      investedCents: toCents(inv.totalCost),
      positionsValueCents: toCents(inv.currentValue),
      unrealizedCents: toCents(inv.unrealizedProfitLoss),
      realizedCents: toCents(inv.realizedProfitLoss),
      cashCents: toCents(cash.availableToTrade),
      reservedCents: toCents(cash.reservedForOrders),
      inPiesCents: toCents(cash.inPies)
    })
    .run()
}

export function storePositions(raw: RawPosition[]): number {
  const db = getDb()
  const now = Date.now()
  const rows = raw.filter((p) => p.instrument?.ticker)
  db.transaction((tx) => {
    tx.delete(position).run()
    for (const p of rows) {
      const wallet = p.walletImpact ?? {}
      tx.insert(position)
        .values({
          ticker: p.instrument!.ticker!,
          name: p.instrument?.name ?? p.instrument!.ticker!,
          isin: p.instrument?.isin ?? null,
          instrumentCurrency: p.instrument?.currency ?? null,
          quantity: p.quantity ?? 0,
          quantityInPies: p.quantityInPies ?? 0,
          averagePrice: p.averagePricePaid ?? 0,
          currentPrice: p.currentPrice ?? 0,
          valueCents: toCents(wallet.currentValue),
          costCents: toCents(wallet.totalCost),
          unrealizedCents: toCents(wallet.unrealizedProfitLoss),
          fxCents: toCents(wallet.fxImpact),
          openedAt: parseTime(p.createdAt),
          updatedAt: now
        })
        .run()
    }
  })
  return rows.length
}

export function storeInstruments(raw: RawInstrument[]): number {
  const db = getDb()
  const now = Date.now()
  let count = 0
  db.transaction((tx) => {
    for (const i of raw) {
      if (!i.ticker) continue
      const values = {
        name: i.name ?? i.shortName ?? i.ticker,
        shortName: i.shortName ?? null,
        isin: i.isin ?? null,
        currency: i.currencyCode ?? null,
        type: i.type ?? null,
        updatedAt: now
      }
      tx.insert(instrument)
        .values({ ticker: i.ticker, ...values })
        .onConflictDoUpdate({ target: instrument.ticker, set: values })
        .run()
      count++
    }
  })
  return count
}

// ---------- Pies ----------

const nullableCents = (value: number | null | undefined): number | null =>
  value == null || Number.isNaN(value) ? null : toCents(value)

/** Replaces every pie with the given list. Details are matched by id; a pie without one keeps a placeholder name. */
export function storePies(list: RawPie[], details: Map<number, RawPieDetail>): number {
  const db = getDb()
  const now = Date.now()
  const pies = list.filter((p) => p.id != null)
  db.transaction((tx) => {
    tx.delete(pieInstrument).run()
    tx.delete(pie).run()
    for (const p of pies) {
      const id = p.id!
      const detail = details.get(id)
      const settings = detail?.settings ?? {}
      const result = p.result ?? {}
      const dividends = p.dividendDetails ?? {}
      tx.insert(pie)
        .values({
          id,
          name: settings.name?.trim() || `Pie ${id}`,
          icon: settings.icon ?? null,
          valueCents: toCents(result.priceAvgValue),
          investedCents: toCents(result.priceAvgInvestedValue),
          resultCents: toCents(result.priceAvgResult),
          returnPct: result.priceAvgResultCoef ?? null,
          cashCents: toCents(p.cash),
          dividendsGainedCents: toCents(dividends.gained),
          dividendsReinvestedCents: toCents(dividends.reinvested),
          dividendsInCashCents: toCents(dividends.inCash),
          dividendCashAction: settings.dividendCashAction ?? null,
          // Trading 212 reports 0 when no goal is set.
          goalCents: settings.goal ? toCents(settings.goal) : null,
          progress: settings.goal ? (p.progress ?? null) : null,
          status: settings.goal ? (p.status ?? null) : null,
          initialInvestmentCents: nullableCents(settings.initialInvestment),
          createdAt: parseTime(settings.creationDate),
          endAt: parseTime(settings.endDate),
          publicUrl: settings.publicUrl ?? null,
          updatedAt: now
        })
        .run()
      const seen = new Set<string>()
      for (const i of detail?.instruments ?? []) {
        if (!i.ticker || seen.has(i.ticker)) continue
        seen.add(i.ticker)
        tx.insert(pieInstrument)
          .values({
            pieId: id,
            ticker: i.ticker,
            quantity: i.ownedQuantity ?? 0,
            expectedShare: i.expectedShare ?? 0,
            currentShare: i.currentShare ?? 0,
            valueCents: toCents(i.result?.priceAvgValue),
            investedCents: toCents(i.result?.priceAvgInvestedValue),
            resultCents: toCents(i.result?.priceAvgResult),
            returnPct: i.result?.priceAvgResultCoef ?? null,
            issues: (i.issues ?? [])
              .filter((issue) => issue.name)
              .map((issue) => ({ name: issue.name!, severity: issue.severity ?? null }))
          })
          .run()
      }
    }
  })
  return pies.length
}

/**
 * Reads every pie and its detail. Pies are optional: a key without the pies permission, or
 * the deprecated endpoint going away, is recorded for the Pies page and never fails the sync.
 * Each detail is its own request at 1 per 5 seconds, so this takes a while with many pies.
 */
export async function syncPies(client: T212Client, onProgress: ProgressListener): Promise<number> {
  try {
    onProgress({ phase: 'account', message: 'Loading pies' })
    const list = ((await client.pies()) ?? []).filter((p) => p.id != null)
    const details = new Map<number, RawPieDetail>()
    for (const [index, p] of list.entries()) {
      onProgress({ phase: 'account', message: `Loading pie ${index + 1} of ${list.length}` })
      details.set(p.id!, (await client.pie(p.id!)) ?? {})
    }
    const count = storePies(list, details)
    markPies(null)
    return count
  } catch (error) {
    markPies(error instanceof Error ? error.message : String(error))
    return 0
  }
}

// ---------- History streams ----------

/** How many rows of a page were usable, and how many of those were new. */
export type StoreResult = { valid: number; inserted: number }

export function storeOrders(items: RawHistoricalOrder[]): StoreResult {
  const db = getDb()
  let valid = 0
  let inserted = 0
  db.transaction((tx) => {
    for (const item of items) {
      const o = item.order
      if (o?.id == null || !o.ticker) continue
      const fill = item.fill ?? null
      const wallet = fill?.walletImpact
      const side = o.side === 'SELL' ? 'SELL' : 'BUY'
      const net = Math.abs(toCents(wallet?.netValue))
      const fees = (wallet?.taxes ?? []).reduce((a, t) => a + Math.abs(toCents(t.quantity)), 0)
      const createdAt = parseTime(o.createdAt) ?? Date.now()
      const result = tx
        .insert(order)
        .values({
          id: `${o.id}:${fill?.id ?? 0}`,
          orderId: o.id,
          ticker: o.ticker,
          name: o.instrument?.name ?? o.ticker,
          side,
          type: o.type ?? 'MARKET',
          status: o.status ?? 'FILLED',
          fillType: fill?.type ?? null,
          quantity: fill?.quantity ?? o.filledQuantity ?? o.quantity ?? null,
          price: fill?.price ?? null,
          instrumentCurrency: o.instrument?.currency ?? o.currency ?? null,
          amountCents: side === 'BUY' ? -net : net,
          realizedCents: toCents(wallet?.realisedProfitLoss),
          feesCents: fees,
          fxRate: wallet?.fxRate ?? null,
          initiatedFrom: o.initiatedFrom ?? null,
          createdAt,
          at: parseTime(fill?.filledAt) ?? createdAt
        })
        .onConflictDoNothing()
        .run()
      valid++
      inserted += result.changes
    }
  })
  return { valid, inserted }
}

export function storeDividends(items: RawDividend[]): StoreResult {
  const db = getDb()
  let valid = 0
  let inserted = 0
  db.transaction((tx) => {
    for (const d of items) {
      const ticker = d.ticker ?? d.instrument?.ticker
      const paidAt = parseTime(d.paidOn)
      if (!d.reference || !ticker || paidAt === null) continue
      const result = tx
        .insert(dividend)
        .values({
          reference: d.reference,
          ticker,
          name: d.instrument?.name ?? ticker,
          quantity: d.quantity ?? null,
          amountCents: toCents(d.amount),
          grossPerShare: d.grossAmountPerShare ?? null,
          tickerCurrency: d.tickerCurrency ?? d.instrument?.currency ?? null,
          type: d.type ?? null,
          paidAt
        })
        .onConflictDoNothing()
        .run()
      valid++
      inserted += result.changes
    }
  })
  return { valid, inserted }
}

/** Normalises the sign by type so sums work regardless of how the API reports it. */
export function signedCashAmount(type: string, amount: number): number {
  const cents = Math.abs(toCents(amount))
  switch (type) {
    case 'WITHDRAW':
    case 'FEE':
      return -cents
    case 'DEPOSIT':
    case 'INTEREST_ON_FREE_CASH':
    case 'LENDING_INTEREST':
      return cents
    default:
      return toCents(amount)
  }
}

export function storeCashTransactions(items: RawCashTransaction[]): StoreResult {
  const db = getDb()
  let valid = 0
  let inserted = 0
  db.transaction((tx) => {
    for (const t of items) {
      const at = parseTime(t.dateTime)
      if (!t.reference || !t.type || at === null) continue
      const result = tx
        .insert(cashTransaction)
        .values({
          reference: t.reference,
          type: t.type,
          amountCents: signedCashAmount(t.type, t.amount ?? 0),
          currency: t.currency ?? 'EUR',
          at
        })
        .onConflictDoNothing()
        .run()
      valid++
      inserted += result.changes
    }
  })
  return { valid, inserted }
}

const STORE: Record<HistoryStream, (items: never[]) => StoreResult> = {
  orders: storeOrders,
  dividends: storeDividends,
  transactions: storeCashTransactions
}

const MESSAGES: Record<HistoryStream, string> = {
  orders: 'orders',
  dividends: 'dividends',
  transactions: 'deposits and withdrawals'
}

function cursorOf(stream: HistoryStream): typeof historyCursor.$inferSelect | undefined {
  return getDb().select().from(historyCursor).where(eq(historyCursor.stream, stream)).get()
}

function saveCursor(stream: HistoryStream, nextPath: string | null, backfillDone: boolean): void {
  const values = { nextPath, backfillDone, updatedAt: Date.now() }
  getDb()
    .insert(historyCursor)
    .values({ stream, ...values })
    .onConflictDoUpdate({ target: historyCursor.stream, set: values })
    .run()
}

/**
 * Trading 212 pages each stream newest to oldest. Two passes:
 * 1. Head: from the newest page until a page holds rows we already have.
 * 2. Backfill: resume from the saved cursor until the stream runs out. Saved after every
 *    page, so a quit mid-backfill picks up where it stopped.
 * On the very first sync the head pass is the backfill, so it saves the cursor as it goes.
 */
export async function syncStream(
  client: T212Client,
  stream: HistoryStream,
  onProgress: ProgressListener
): Promise<number> {
  const store = STORE[stream]
  let fetched = 0
  const report = (message: string): void =>
    onProgress({ phase: 'history', stream, fetched, message })
  const state = cursorOf(stream)
  const firstRun = !state

  // 1. Head pass.
  report(firstRun ? `Loading ${MESSAGES[stream]}` : `Checking new ${MESSAGES[stream]}`)
  let next: string | null = null
  for (;;) {
    const page: Page<never> = await client.historyPage<never>(stream, next)
    const items = page?.items ?? []
    const { valid, inserted } = store(items)
    fetched += inserted
    next = page?.nextPagePath ?? null
    if (firstRun) saveCursor(stream, next, next === null)
    if (inserted > 0) report(firstRun ? `Loading ${MESSAGES[stream]}` : `New ${MESSAGES[stream]}`)
    // A page holding rows we already have means everything older is stored too.
    if (next === null || items.length === 0 || (!firstRun && inserted < valid)) break
  }
  if (firstRun) return fetched

  // 2. Resume an unfinished backfill.
  let cursor = state.nextPath
  let done = state.backfillDone || cursor === null
  while (!done) {
    report(`Backfilling ${MESSAGES[stream]}`)
    const page: Page<never> = await client.historyPage<never>(stream, cursor)
    const items = page?.items ?? []
    fetched += store(items).inserted
    cursor = page?.nextPagePath ?? null
    done = cursor === null || items.length === 0
    saveCursor(stream, cursor, done)
  }
  if (done && !state.backfillDone) saveCursor(stream, null, true)
  return fetched
}

// ---------- Orchestration ----------

/** Sync rows left in `running` by a crash or force-quit. Called once at startup. */
export function failInterruptedSyncs(): void {
  getDb()
    .update(syncRun)
    .set({ status: 'failed', finishedAt: Date.now(), error: 'Interrupted by app exit' })
    .where(eq(syncRun.status, 'running'))
    .run()
}

export async function runSync(
  onProgress: ProgressListener,
  client: T212Client = getClient()
): Promise<SyncResult> {
  if (running) throw new Error('A sync is already running')
  running = true
  const db = getDb()
  const run = db
    .insert(syncRun)
    .values({ startedAt: Date.now(), status: 'running' })
    .returning()
    .get()

  try {
    onProgress({ phase: 'account', message: 'Loading account' })
    const summary = await client.accountSummary()
    storeSnapshot(summary)

    onProgress({ phase: 'account', message: 'Loading positions' })
    const positions = storePositions((await client.positions()) ?? [])

    const context = getContext()
    const instrumentsAge = Date.now() - (context?.instrumentsSyncedAt ?? 0)
    if (instrumentsAge > INSTRUMENTS_MAX_AGE_MS) {
      onProgress({ phase: 'account', message: 'Loading instrument list' })
      storeInstruments((await client.instruments()) ?? [])
      markInstrumentsSynced()
    }

    await syncPies(client, onProgress)

    let activities = 0
    for (const stream of ['orders', 'dividends', 'transactions'] as const) {
      activities += await syncStream(client, stream, onProgress)
    }

    markSynced({ accountId: summary.id ?? undefined, currency: summary.currency ?? undefined })
    db.update(syncRun)
      .set({
        finishedAt: Date.now(),
        status: 'completed',
        positionsSynced: positions,
        activitiesSynced: activities
      })
      .where(eq(syncRun.id, run.id))
      .run()
    const result = { positions, activities }
    onProgress({ phase: 'done', ...result })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    db.update(syncRun)
      .set({ finishedAt: Date.now(), status: 'failed', error: message })
      .where(eq(syncRun.id, run.id))
      .run()
    onProgress({ phase: 'error', message })
    throw error
  } finally {
    running = false
  }
}

export function wipePortfolioData(): void {
  const db = getDb()
  db.delete(order).run()
  db.delete(dividend).run()
  db.delete(cashTransaction).run()
  db.delete(position).run()
  db.delete(pieInstrument).run()
  db.delete(pie).run()
  db.delete(accountSnapshot).run()
  db.delete(instrument).run()
  db.delete(historyCursor).run()
  db.delete(syncRun).run()
  db.run(sql`VACUUM`)
}
