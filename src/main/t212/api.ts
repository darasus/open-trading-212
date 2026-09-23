import { eq } from 'drizzle-orm'
import type { T212Environment } from '../../shared/ipc'
import { getDb } from '../db'
import { t212Context } from '../db/schema'
import { deleteSecrets, getSecret, setSecret } from '../keychain'

/**
 * Read-only Trading 212 client. There is deliberately no way to send anything but GET:
 * the app never places, edits or cancels orders, whatever permissions the key has.
 *
 * Spec: https://docs.trading212.com/api (OpenAPI at /_spec/api.json). Every field is
 * treated as optional because the spec marks nothing as required.
 */

export const BASE_URLS: Record<T212Environment, string> = {
  live: 'https://live.trading212.com',
  demo: 'https://demo.trading212.com'
}

// ---------- Response shapes (subset we use) ----------

export type RawInstrumentRef = {
  ticker?: string
  name?: string
  isin?: string
  currency?: string
}

export type RawAccountSummary = {
  id?: number
  currency?: string
  totalValue?: number
  cash?: { availableToTrade?: number; reservedForOrders?: number; inPies?: number }
  investments?: {
    currentValue?: number
    totalCost?: number
    realizedProfitLoss?: number
    unrealizedProfitLoss?: number
  }
}

export type RawPosition = {
  instrument?: RawInstrumentRef
  quantity?: number
  quantityInPies?: number
  averagePricePaid?: number
  currentPrice?: number
  createdAt?: string
  walletImpact?: {
    currency?: string
    totalCost?: number
    currentValue?: number
    unrealizedProfitLoss?: number
    fxImpact?: number | null
  }
}

export type RawInstrument = {
  ticker?: string
  name?: string
  shortName?: string
  isin?: string
  currencyCode?: string
  type?: string
}

export type RawHistoricalOrder = {
  order?: {
    id?: number
    ticker?: string
    instrument?: RawInstrumentRef
    type?: string
    side?: 'BUY' | 'SELL'
    status?: string
    quantity?: number
    filledQuantity?: number
    value?: number
    filledValue?: number
    currency?: string
    createdAt?: string
    initiatedFrom?: string
  }
  fill?: {
    id?: number
    filledAt?: string
    price?: number
    quantity?: number
    type?: string
    walletImpact?: {
      currency?: string
      fxRate?: number
      netValue?: number
      realisedProfitLoss?: number
      taxes?: { name?: string; quantity?: number; currency?: string }[]
    }
  } | null
}

export type RawDividend = {
  ticker?: string
  instrument?: RawInstrumentRef
  reference?: string
  quantity?: number
  amount?: number
  currency?: string
  grossAmountPerShare?: number
  tickerCurrency?: string
  paidOn?: string
  type?: string
}

export type RawCashTransaction = {
  type?: string
  amount?: number
  currency?: string
  dateTime?: string
  reference?: string
}

export type Page<T> = { items?: T[]; nextPagePath?: string | null }

// ---------- Errors ----------

export class T212Error extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function describeError(status: number, body: string, path: string): string {
  let detail = ''
  try {
    const json = JSON.parse(body) as { message?: string; detail?: string; title?: string }
    detail = json.message ?? json.detail ?? json.title ?? ''
  } catch {
    // Non-JSON body, e.g. a Cloudflare HTML page.
  }
  if (status === 401)
    return 'Trading 212 rejected the API key. Check the key and secret, and that it was created for this account type (real money or practice).'
  if (status === 403) {
    const scope = /Scope\(\s*([\w:]+)\s*\)/.exec(detail)?.[1]
    return scope
      ? `The API key is missing the "${scope}" permission. Edit the key in Trading 212 and enable it.`
      : `The API key is not allowed to read ${path}. ${detail}`.trim()
  }
  return `Trading 212 returned ${status} for ${path}${detail ? `: ${detail}` : ''}`
}

// ---------- Rate limiting ----------

/**
 * Per-endpoint limits from the spec, used when a response carries no rate-limit headers.
 * Limits are per account, so they apply across every key for it.
 */
const LIMITS: { match: RegExp; bucket: string; requests: number; periodMs: number }[] = [
  {
    match: /^\/api\/v0\/equity\/account\/summary/,
    bucket: 'summary',
    requests: 1,
    periodMs: 5_000
  },
  { match: /^\/api\/v0\/equity\/positions/, bucket: 'positions', requests: 1, periodMs: 1_000 },
  {
    match: /^\/api\/v0\/equity\/metadata\/instruments/,
    bucket: 'instruments',
    requests: 1,
    periodMs: 50_000
  },
  {
    match: /^\/api\/v0\/equity\/history\/orders/,
    bucket: 'orders',
    requests: 6,
    periodMs: 60_000
  },
  {
    match: /^\/api\/v0\/equity\/history\/dividends/,
    bucket: 'dividends',
    requests: 6,
    periodMs: 60_000
  },
  {
    match: /^\/api\/v0\/equity\/history\/transactions/,
    bucket: 'transactions',
    requests: 6,
    periodMs: 60_000
  }
]

type Bucket = { remaining: number | null; resetAt: number; lastAt: number }

export type ClientOptions = {
  environment: T212Environment
  apiKey: string
  /** Empty for legacy keys created before the key + secret scheme. */
  apiSecret: string
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const MAX_RETRIES = 4
/** Backoff before each retry of a request that never got a response. */
const NETWORK_RETRIES = [1_000, 3_000]

/** The allow-list refusal is a decision, not a network failure: never retry it. */
function isBlocked(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Blocked request to ')
}

function describeNetworkError(base: string, error: unknown): string {
  const host = new URL(base).hostname
  const cause = (error as { cause?: { code?: string } })?.cause?.code
  const reason =
    cause === 'UND_ERR_CONNECT_TIMEOUT'
      ? 'the connection timed out'
      : cause === 'ENOTFOUND'
        ? 'the address could not be resolved'
        : cause === 'ECONNREFUSED' || cause === 'ECONNRESET'
          ? 'the connection was refused or reset'
          : error instanceof Error
            ? error.message
            : String(error)
  return `Could not reach ${host}: ${reason}. Check your internet connection, VPN or firewall, then try again.`
}

export class T212Client {
  private readonly base: string
  private readonly authorization: string
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly buckets = new Map<string, Bucket>()

  constructor(options: ClientOptions) {
    this.base = BASE_URLS[options.environment]
    this.authorization = options.apiSecret
      ? `Basic ${Buffer.from(`${options.apiKey}:${options.apiSecret}`).toString('base64')}`
      : options.apiKey
    // Resolved per call so the network allow-list installed on globalThis.fetch applies.
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.now = options.now ?? Date.now
  }

  /** GET a path such as `/api/v0/equity/positions`. The only request method this client has. */
  async get<T>(path: string): Promise<T> {
    const limit = LIMITS.find((l) => l.match.test(path))
    const bucketKey = limit?.bucket ?? path
    for (let attempt = 0, networkAttempt = 0; ; attempt++) {
      await this.waitForSlot(bucketKey, limit)
      let response: Response
      try {
        response = await this.fetchImpl(this.base + path, {
          method: 'GET',
          headers: {
            Authorization: this.authorization,
            Accept: 'application/json',
            'User-Agent': 'open-trading-212'
          }
        })
      } catch (error) {
        // Connect timeouts and resets are usually transient (VPN, Wi-Fi hand-off). A GET is
        // safe to repeat, so retry a couple of times before giving up.
        if (isBlocked(error) || networkAttempt >= NETWORK_RETRIES.length) {
          throw isBlocked(error) ? error : new T212Error(0, describeNetworkError(this.base, error))
        }
        await this.sleep(NETWORK_RETRIES[networkAttempt++])
        continue
      }
      this.record(bucketKey, response)
      if (response.status === 429 && attempt < MAX_RETRIES) {
        await this.sleep(this.retryDelay(bucketKey, response, limit))
        continue
      }
      const body = await response.text()
      if (!response.ok)
        throw new T212Error(response.status, describeError(response.status, body, path))
      return (body ? JSON.parse(body) : null) as T
    }
  }

  private async waitForSlot(
    key: string,
    limit: (typeof LIMITS)[number] | undefined
  ): Promise<void> {
    const bucket = this.buckets.get(key)
    if (!bucket) return
    const now = this.now()
    if (bucket.remaining !== null) {
      if (bucket.remaining <= 0 && bucket.resetAt > now) await this.sleep(bucket.resetAt - now)
      return
    }
    // No headers seen: space requests evenly across the documented window.
    if (limit) {
      const spacing = limit.periodMs / limit.requests
      const wait = bucket.lastAt + spacing - now
      if (wait > 0) await this.sleep(wait)
    }
  }

  private record(key: string, response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining')
    const reset = response.headers.get('x-ratelimit-reset')
    this.buckets.set(key, {
      remaining: remaining !== null && remaining !== '' ? Number(remaining) : null,
      // The reset header is a Unix timestamp in seconds.
      resetAt: reset ? Number(reset) * 1000 : 0,
      lastAt: this.now()
    })
  }

  private retryDelay(
    key: string,
    response: Response,
    limit: (typeof LIMITS)[number] | undefined
  ): number {
    const retryAfter = Number(response.headers.get('retry-after'))
    if (retryAfter > 0) return retryAfter * 1000
    const resetAt = this.buckets.get(key)?.resetAt ?? 0
    if (resetAt > this.now()) return resetAt - this.now() + 250
    return limit ? limit.periodMs / limit.requests : 5_000
  }

  // ---------- Endpoints ----------

  accountSummary(): Promise<RawAccountSummary> {
    return this.get('/api/v0/equity/account/summary')
  }

  positions(): Promise<RawPosition[]> {
    return this.get('/api/v0/equity/positions')
  }

  instruments(): Promise<RawInstrument[]> {
    return this.get('/api/v0/equity/metadata/instruments')
  }

  /** One page of a history stream. Pass `nextPagePath` from the previous page to continue. */
  historyPage<T>(stream: HistoryPath, nextPath?: string | null): Promise<Page<T>> {
    return this.get(resolveNextPath(HISTORY_PATHS[stream], nextPath))
  }
}

export const HISTORY_PATHS = {
  orders: '/api/v0/equity/history/orders',
  dividends: '/api/v0/equity/history/dividends',
  transactions: '/api/v0/equity/history/transactions'
} as const
export type HistoryPath = keyof typeof HISTORY_PATHS

export const PAGE_LIMIT = 50

/**
 * `nextPagePath` is normally a full path, but some accounts get only the query string
 * back (`limit=50&cursor=…`). Accept both, and only ever stay on the same endpoint.
 */
export function resolveNextPath(base: string, nextPath?: string | null): string {
  if (!nextPath) return `${base}?limit=${PAGE_LIMIT}`
  const path = nextPath.startsWith('/') ? nextPath : `${base}?${nextPath.replace(/^\?/, '')}`
  if (!path.startsWith(`${base}?`) && path !== base)
    throw new Error(`Unexpected pagination path from Trading 212: ${nextPath}`)
  return path
}

// ---------- Connection context ----------

export type Context = typeof t212Context.$inferSelect

export function getContext(): Context | null {
  return getDb().select().from(t212Context).where(eq(t212Context.id, 1)).get() ?? null
}

export function getClient(): T212Client {
  const context = getContext()
  const apiKey = getSecret('t212.apiKey')
  if (!context || !apiKey) throw new Error('Trading 212 is not connected')
  return new T212Client({
    environment: context.environment,
    apiKey,
    apiSecret: getSecret('t212.apiSecret') ?? ''
  })
}

/** Verifies the key with one summary call, then stores it and the context. */
export async function connect(
  input: { apiKey: string; apiSecret: string; environment: T212Environment },
  options: Pick<ClientOptions, 'fetch' | 'sleep' | 'now'> = {}
): Promise<Context> {
  const client = new T212Client({ ...input, ...options })
  const summary = await client.accountSummary()
  setSecret('t212.apiKey', input.apiKey)
  if (input.apiSecret) setSecret('t212.apiSecret', input.apiSecret)
  const values = {
    environment: input.environment,
    accountId: summary?.id ?? null,
    currency: summary?.currency ?? null,
    connectedAt: Date.now(),
    lastSyncedAt: null,
    instrumentsSyncedAt: null
  }
  getDb()
    .insert(t212Context)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: t212Context.id, set: values })
    .run()
  return getContext()!
}

export function clearContext(): void {
  deleteSecrets(['t212.apiKey', 't212.apiSecret'])
  getDb().delete(t212Context).run()
}

export function markSynced(patch: Partial<Pick<Context, 'accountId' | 'currency'>> = {}): void {
  getDb()
    .update(t212Context)
    .set({ ...patch, lastSyncedAt: Date.now() })
    .where(eq(t212Context.id, 1))
    .run()
}

export function markInstrumentsSynced(): void {
  getDb()
    .update(t212Context)
    .set({ instrumentsSyncedAt: Date.now() })
    .where(eq(t212Context.id, 1))
    .run()
}
