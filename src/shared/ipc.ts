/**
 * The complete contract between the renderer and the main process.
 *
 * The renderer never touches Node, the network, the keychain or the database.
 * Everything it can do is listed here, and the preload script exposes exactly
 * this surface as `window.ot212`. Keep it narrow: every method is a
 * capability the UI is granted.
 *
 * Money in the account currency is integer cents (`*Cents`). Instrument prices
 * and share quantities are plain numbers, because they carry more precision.
 */

export type AppInfo = {
  version: string
  platform: NodeJS.Platform
  /** Absolute path of the folder holding the SQLite database. */
  dataDir: string
  /** Absolute path of the SQLite database file. */
  dbPath: string
}

export type UpdateCheck =
  | { status: 'disabled'; reason: string }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string }

/** Generic settings the renderer may read and write. AI provider settings have their own calls. */
export type SettingKey = 'ai.localOnly'

export type AiProviderId = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama'

export type ModelOption = { id: string; name: string; note?: string }

export type AiProviderInfo = {
  id: AiProviderId
  name: string
  description: string
  /** Runs on this computer (Ollama): nothing leaves the machine, allowed in local-only mode. */
  local: boolean
  /** Whether a key is stored (always true for providers that need none). */
  hasKey: boolean
  needsKey: boolean
  keyPlaceholder: string
  /** Where to create a key, shown in Settings. */
  keyUrl: string | null
  /** Curated picks shown before the live list loads. */
  suggested: ModelOption[]
  /** The model chosen for this provider, if any. */
  model: string | null
}

/** Why the chat cannot run right now, if it cannot. */
export type AiBlockedReason = 'local-only' | 'no-key' | 'no-model' | null

/** `demo` is Trading 212's practice account with virtual money. */
export type T212Environment = 'demo' | 'live'

export type ConnectionStatus = {
  connected: boolean
  environment: T212Environment | null
  accountId: number | null
  currency: string | null
  connectedAt: number | null
  lastSyncedAt: number | null
  syncing: boolean
}

export type HistoryStream = 'orders' | 'dividends' | 'transactions'

export type SyncProgress =
  | { phase: 'account'; message: string }
  | { phase: 'history'; stream: HistoryStream; fetched: number; message: string }
  | { phase: 'done'; positions: number; activities: number }
  | { phase: 'error'; message: string }

export type SyncResult = { positions: number; activities: number }

export type PortfolioSummary = {
  currency: string
  /** Cash plus the market value of every open position. */
  totalCents: number
  /** Cost basis of open positions. */
  investedCents: number
  /** Unrealised profit or loss on open positions, including FX. */
  unrealizedCents: number
  /** Realised profit or loss as reported by the account. */
  realizedCents: number
  /** Cash available to invest. */
  cashCents: number
  positions: number
  takenAt: number
}

export type PositionRow = {
  ticker: string
  name: string
  isin: string | null
  /** Currency the instrument trades in, e.g. USD or GBX. */
  instrumentCurrency: string | null
  type: string | null
  quantity: number
  /** In the instrument currency. */
  averagePrice: number
  /** In the instrument currency. */
  currentPrice: number
  /** Market value in the account currency. */
  valueCents: number
  /** Cost basis in the account currency. */
  costCents: number
  /** Unrealised P/L in the account currency, including FX. */
  unrealizedCents: number
  /** Part of the unrealised P/L caused by currency moves. */
  fxCents: number
  /** Unrealised P/L as a fraction of cost, e.g. 0.12 for +12%. */
  returnPct: number
  /** Share of total invested value, 0–1. */
  weight: number
  openedAt: number | null
}

export type AllocationBy = 'position' | 'currency' | 'type'
export type AllocationSlice = { key: string; label: string; valueCents: number; share: number }

export type ActivityKind = 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal' | 'fee' | 'other'

export type ActivityRow = {
  /** Stable id across kinds, e.g. "order:123" or "dividend:abc". */
  id: string
  kind: ActivityKind
  ticker: string | null
  /** Instrument name for trades and dividends, a description otherwise. */
  label: string
  quantity: number | null
  /** Fill price (or gross dividend per share) in `currency`. */
  price: number | null
  /** Instrument currency for trades and dividends, e.g. USD or GBX. */
  currency: string | null
  /** Signed cash effect in the account currency: buys and withdrawals are negative. */
  amountCents: number
  /** Order status for trades, the raw type otherwise. */
  status: string | null
  at: number
}

export type ActivityQuery = {
  kind?: ActivityKind
  ticker?: string
  /** Case-insensitive match on ticker or name. */
  search?: string
  /** Inclusive lower bound, ms since epoch. */
  from?: number
  /** Exclusive upper bound, ms since epoch. */
  to?: number
  limit: number
  offset: number
}

export type ValuePoint = {
  day: string
  totalCents: number
  /** Net deposits up to that day: deposits minus withdrawals. */
  investedCents: number
  /**
   * True when no sync snapshot exists for the day and the value was rebuilt from fills,
   * cash movements and interpolated trade prices.
   */
  estimated: boolean
}

export type MonthlyFlow = {
  /** "2026-09" */
  month: string
  depositsCents: number
  withdrawalsCents: number
  buysCents: number
  sellsCents: number
  dividendsCents: number
  feesCents: number
}

export type DividendPayer = { ticker: string; name: string; amountCents: number; payments: number }

export type Insight = {
  id: string
  kind: 'concentration' | 'cash' | 'mover' | 'dividends' | 'fees'
  severity: 'info' | 'warn'
  title: string
  detail: string
}

/** Streamed from main while a chat turn runs. `chunk` is an AI SDK UIMessageChunk. */
export type ChatEvent =
  | { type: 'chunk'; chunk: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type ChatSummary = { id: string; title: string; createdAt: number; updatedAt: number }

export type AiStatus = {
  provider: AiProviderId
  providers: AiProviderInfo[]
  /** The model the chat will use: the selected provider's model. */
  model: string | null
  localOnly: boolean
  /** Base URL of the local Ollama server. Always a loopback address. */
  ollamaUrl: string
  blocked: AiBlockedReason
}

export type OpenT212Api = {
  app: {
    getInfo(): Promise<AppInfo>
    openDataDir(): Promise<void>
    openExternal(url: string): Promise<void>
    /** Hosts the main process is allowed to contact. Shown on the Privacy page. */
    allowedHosts(): Promise<string[]>
    /** Asks for confirmation, then deletes the database, every secret, and relaunches. */
    wipeEverything(): Promise<boolean>
    checkForUpdates(): Promise<UpdateCheck>
    installUpdate(): Promise<void>
  }
  settings: {
    get(key: SettingKey): Promise<string | null>
    set(key: SettingKey, value: string): Promise<void>
  }
  t212: {
    getStatus(): Promise<ConnectionStatus>
    /** Verifies the key against Trading 212 and stores it in the OS keychain. */
    connect(input: {
      apiKey: string
      apiSecret: string
      environment: T212Environment
    }): Promise<ConnectionStatus>
    /** Removes the key. With `wipeData`, also deletes every synced row and chat. */
    disconnect(input: { wipeData: boolean }): Promise<void>
    sync(): Promise<SyncResult>
    onSyncProgress(listener: (progress: SyncProgress) => void): () => void
  }
  portfolio: {
    summary(): Promise<PortfolioSummary | null>
    positions(): Promise<PositionRow[]>
    allocation(input: { by: AllocationBy }): Promise<AllocationSlice[]>
  }
  activity: {
    list(query: ActivityQuery): Promise<{ rows: ActivityRow[]; total: number }>
  }
  analysis: {
    valueHistory(input: { days: number }): Promise<ValuePoint[]>
    monthlyFlows(input: { months: number }): Promise<MonthlyFlow[]>
    dividendPayers(input: { months: number; limit: number }): Promise<DividendPayer[]>
    insights(): Promise<Insight[]>
  }
  ai: {
    getStatus(): Promise<AiStatus>
    /** Selects the provider the chat uses. Only its host stays on the network allow-list. */
    setProvider(provider: AiProviderId): Promise<void>
    /** Stores a provider key in the OS keychain. */
    setKey(input: { provider: AiProviderId; key: string }): Promise<void>
    clearKey(provider: AiProviderId): Promise<void>
    setModel(input: { provider: AiProviderId; model: string }): Promise<void>
    /** Must be http(s) on localhost, 127.0.0.1 or ::1. */
    setOllamaUrl(url: string): Promise<void>
    /** Models available to the selected provider, fetched live with its key. */
    listModels(): Promise<ModelOption[]>
  }
  chat: {
    /**
     * Starts a turn. Main saves the thread before streaming and again when the reply ends,
     * so leaving the page loses nothing. Resolves when the stream has finished (or failed).
     */
    start(input: { requestId: string; chatId: string; messages: unknown[] }): Promise<void>
    /**
     * Follows a reply that is still being written, e.g. after navigating away and back.
     * Replays what was streamed so far as events for `requestId`. False when none is running.
     */
    attach(input: { requestId: string; chatId: string }): Promise<boolean>
    abort(requestId: string): Promise<void>
    onEvent(requestId: string, listener: (event: ChatEvent) => void): () => void
  }
  chats: {
    list(): Promise<ChatSummary[]>
    get(id: string): Promise<{ id: string; title: string; messages: unknown[] } | null>
    delete(id: string): Promise<void>
    /** Fires whenever a chat is saved or deleted. Chats are only written by main. */
    onChanged(listener: () => void): () => void
  }
}

/** IPC channel names. One per method, prefixed by domain. */
export const IPC = {
  app: {
    getInfo: 'app:getInfo',
    openDataDir: 'app:openDataDir',
    openExternal: 'app:openExternal',
    allowedHosts: 'app:allowedHosts',
    wipeEverything: 'app:wipeEverything',
    checkForUpdates: 'app:checkForUpdates',
    installUpdate: 'app:installUpdate'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  },
  t212: {
    getStatus: 't212:getStatus',
    connect: 't212:connect',
    disconnect: 't212:disconnect',
    sync: 't212:sync',
    syncProgress: 't212:syncProgress'
  },
  portfolio: {
    summary: 'portfolio:summary',
    positions: 'portfolio:positions',
    allocation: 'portfolio:allocation'
  },
  activity: {
    list: 'activity:list'
  },
  analysis: {
    valueHistory: 'analysis:valueHistory',
    monthlyFlows: 'analysis:monthlyFlows',
    dividendPayers: 'analysis:dividendPayers',
    insights: 'analysis:insights'
  },
  ai: {
    getStatus: 'ai:getStatus',
    setProvider: 'ai:setProvider',
    setKey: 'ai:setKey',
    clearKey: 'ai:clearKey',
    setModel: 'ai:setModel',
    setOllamaUrl: 'ai:setOllamaUrl',
    listModels: 'ai:listModels'
  },
  chat: {
    start: 'chat:start',
    attach: 'chat:attach',
    abort: 'chat:abort',
    event: 'chat:event'
  },
  chats: {
    list: 'chats:list',
    get: 'chats:get',
    delete: 'chats:delete',
    changed: 'chats:changed'
  }
} as const
