import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import {
  IPC,
  type ActivityQuery,
  type AiStatus,
  type AppInfo,
  type ChatEvent,
  type ConnectionStatus,
  type SettingKey,
  type SyncResult,
  type T212Environment
} from '../shared/ipc'
import { clearContext, connect, getContext } from './t212/api'
import { isSyncing, runSync, wipePortfolioData } from './t212/sync'
import {
  allocation,
  dividendPayers,
  insights,
  isActivityKind,
  listActivity,
  listPies,
  listPositions,
  monthlyFlows,
  portfolioSummary,
  valueHistory
} from './analysis'
import { closeDb, getDbPath } from './db'
import { closeReadonlyDb } from './ai/readonly-sql'
import { abortChat, attachChat, streamChat } from './ai/chat'
import {
  isProviderId,
  listSelectedModels,
  ollamaUrl,
  parseOllamaUrl,
  providerDef,
  providerInfo,
  providerModel,
  resolveChatModel,
  selectedProvider
} from './ai/providers'
import { deleteAllChats, deleteChat, getChat, listChats, onChatsChanged } from './chats'
import { deleteAllSecrets, deleteSecret, setSecret } from './keychain'
import { openAppLink } from './links'
import { allowedHosts } from './network'
import { getSetting, setSetting } from './settings'
import { checkForUpdates, quitAndInstall } from './updater'

const SETTING_KEYS: SettingKey[] = ['ai.localOnly']

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

export function getConnectionStatus(): ConnectionStatus {
  const context = getContext()
  return {
    connected: context !== null,
    environment: context?.environment ?? null,
    accountId: context?.accountId ?? null,
    currency: context?.currency ?? null,
    connectedAt: context?.connectedAt ?? null,
    lastSyncedAt: context?.lastSyncedAt ?? null,
    syncing: isSyncing()
  }
}

/** Runs a sync and streams progress to every window. Safe to call when already syncing. */
export async function syncWithBroadcast(): Promise<SyncResult | null> {
  if (isSyncing() || !getContext()) return null
  return runSync((progress) => broadcast(IPC.t212.syncProgress, progress))
}

const clamp = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.min(Math.max(Number(value) || fallback, min), max)

/** Streams chat events to one window, tagged with the request they belong to. */
function eventSender(sender: WebContents, requestId: string): (event: ChatEvent) => void {
  return (chatEvent) => {
    if (!sender.isDestroyed()) sender.send(IPC.chat.event, { requestId, event: chatEvent })
  }
}

export function registerIpc(): void {
  onChatsChanged(() => broadcast(IPC.chats.changed, null))

  ipcMain.handle(IPC.app.getInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: app.getPath('userData'),
    dbPath: getDbPath()
  }))

  ipcMain.handle(IPC.app.openDataDir, async () => {
    await shell.openPath(app.getPath('userData'))
  })

  ipcMain.handle(IPC.app.openExternal, (_event, url: unknown) => openAppLink(url))

  ipcMain.handle(IPC.app.allowedHosts, () => allowedHosts())

  ipcMain.handle(IPC.app.wipeEverything, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const { response } = await dialog.showMessageBox(window ?? BrowserWindow.getAllWindows()[0], {
      type: 'warning',
      buttons: ['Wipe everything', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Wipe everything?',
      message: 'Delete all local data?',
      detail:
        'This removes the Trading 212 key, the AI key, every synced position and history row, and all chats from this computer, then restarts the app. Revoke the API key in the Trading 212 app to fully cut access.'
    })
    if (response !== 0) return false
    if (isSyncing()) throw new Error('Wait for the running sync to finish')
    closeReadonlyDb()
    closeDb()
    deleteAllSecrets()
    const dbPath = getDbPath()
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix)
    }
    const secrets = join(app.getPath('userData'), 'secrets.json')
    if (existsSync(secrets)) rmSync(secrets)
    app.relaunch()
    app.exit(0)
    return true
  })

  ipcMain.handle(IPC.app.checkForUpdates, () => checkForUpdates())
  ipcMain.handle(IPC.app.installUpdate, () => quitAndInstall())

  ipcMain.handle(IPC.settings.get, (_event, key: SettingKey) =>
    SETTING_KEYS.includes(key) ? getSetting(key) : null
  )
  ipcMain.handle(IPC.settings.set, (_event, key: SettingKey, value: string) => {
    if (!SETTING_KEYS.includes(key)) throw new Error('Unknown setting')
    if (typeof value !== 'string') throw new Error('Setting value must be a string')
    setSetting(key, value)
  })

  ipcMain.handle(IPC.t212.getStatus, () => getConnectionStatus())

  ipcMain.handle(
    IPC.t212.connect,
    async (
      _event,
      input: { apiKey: unknown; apiSecret: unknown; environment: unknown }
    ): Promise<ConnectionStatus> => {
      const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
      const apiSecret = typeof input?.apiSecret === 'string' ? input.apiSecret.trim() : ''
      const environment = input?.environment as T212Environment
      if (!apiKey) throw new Error('API key is required')
      if (environment !== 'demo' && environment !== 'live') throw new Error('Invalid environment')
      if (getContext()) throw new Error('Already connected. Disconnect first.')
      await connect({ apiKey, apiSecret, environment })
      void syncWithBroadcast().catch(() => undefined)
      return getConnectionStatus()
    }
  )

  ipcMain.handle(IPC.t212.disconnect, (_event, input: { wipeData?: unknown }) => {
    if (isSyncing()) throw new Error('Wait for the running sync to finish')
    clearContext()
    if (input?.wipeData === true) {
      wipePortfolioData()
      deleteAllChats()
    }
  })

  ipcMain.handle(IPC.t212.sync, async () => {
    if (!getContext()) throw new Error('Trading 212 is not connected')
    const result = await syncWithBroadcast()
    if (!result) throw new Error('A sync is already running')
    return result
  })

  ipcMain.handle(IPC.portfolio.summary, () => portfolioSummary())
  ipcMain.handle(IPC.portfolio.positions, () => listPositions())
  ipcMain.handle(IPC.portfolio.allocation, (_event, input: { by: unknown }) => {
    const by = input?.by
    if (by !== 'position' && by !== 'currency' && by !== 'type') throw new Error('Invalid grouping')
    return allocation(by)
  })

  ipcMain.handle(IPC.pies.list, () => listPies())

  ipcMain.handle(IPC.activity.list, (_event, query: ActivityQuery) =>
    listActivity({
      kind: isActivityKind(query?.kind) ? query.kind : undefined,
      ticker: typeof query?.ticker === 'string' && query.ticker ? query.ticker : undefined,
      search:
        typeof query?.search === 'string' && query.search.trim() ? query.search.trim() : undefined,
      from: typeof query?.from === 'number' ? query.from : undefined,
      to: typeof query?.to === 'number' ? query.to : undefined,
      limit: typeof query?.limit === 'number' ? query.limit : 50,
      offset: typeof query?.offset === 'number' ? query.offset : 0
    })
  )

  ipcMain.handle(IPC.analysis.valueHistory, (_event, input: { days: unknown }) =>
    valueHistory(clamp(input?.days, 90, 2, 3650))
  )
  ipcMain.handle(IPC.analysis.monthlyFlows, (_event, input: { months: unknown }) =>
    monthlyFlows(clamp(input?.months, 12, 1, 60))
  )
  ipcMain.handle(
    IPC.analysis.dividendPayers,
    (_event, input: { months: unknown; limit: unknown }) =>
      dividendPayers(clamp(input?.months, 12, 1, 120), clamp(input?.limit, 8, 1, 50))
  )
  ipcMain.handle(IPC.analysis.insights, () => insights())

  ipcMain.handle(IPC.ai.getStatus, (): AiStatus => {
    const provider = selectedProvider()
    const resolved = resolveChatModel()
    return {
      provider,
      providers: providerInfo(),
      model: providerModel(provider),
      localOnly: getSetting('ai.localOnly') === 'true',
      ollamaUrl: ollamaUrl(),
      blocked: resolved.ok ? null : resolved.reason
    }
  })
  ipcMain.handle(IPC.ai.setProvider, (_event, provider: unknown) => {
    if (!isProviderId(provider)) throw new Error('Unknown AI provider')
    setSetting('ai.provider', provider)
  })
  ipcMain.handle(IPC.ai.setKey, (_event, input: { provider: unknown; key: unknown }) => {
    const provider = input?.provider
    const key = typeof input?.key === 'string' ? input.key.trim() : ''
    if (!isProviderId(provider)) throw new Error('Unknown AI provider')
    const secret = providerDef(provider).secret
    if (!secret) throw new Error(`${providerDef(provider).name} does not use an API key`)
    if (key.length < 20 || /\s/.test(key)) throw new Error('That does not look like an API key')
    setSecret(secret, key)
  })
  ipcMain.handle(IPC.ai.clearKey, (_event, provider: unknown) => {
    if (!isProviderId(provider)) throw new Error('Unknown AI provider')
    const secret = providerDef(provider).secret
    if (secret) deleteSecret(secret)
    if (provider === 'anthropic') deleteSecret('ai.apiKey')
  })
  ipcMain.handle(IPC.ai.setModel, (_event, input: { provider: unknown; model: unknown }) => {
    const model = typeof input?.model === 'string' ? input.model.trim() : ''
    if (!isProviderId(input?.provider)) throw new Error('Unknown AI provider')
    if (!model || model.length > 200 || /\s/.test(model)) throw new Error('Invalid model id')
    setSetting(`ai.model.${input.provider}`, model)
  })
  ipcMain.handle(IPC.ai.setOllamaUrl, (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('Invalid URL')
    setSetting('ai.ollamaUrl', parseOllamaUrl(url))
  })
  ipcMain.handle(IPC.ai.listModels, () => listSelectedModels())

  ipcMain.handle(
    IPC.chat.start,
    async (event, input: { requestId: unknown; chatId: unknown; messages: unknown }) => {
      if (
        typeof input?.requestId !== 'string' ||
        typeof input?.chatId !== 'string' ||
        !Array.isArray(input?.messages)
      ) {
        throw new Error('Invalid chat request')
      }
      const send = eventSender(event.sender, input.requestId)
      await streamChat(input.requestId, input.chatId, input.messages as never, send)
    }
  )
  ipcMain.handle(IPC.chat.attach, (event, input: { requestId: unknown; chatId: unknown }) => {
    if (typeof input?.requestId !== 'string' || typeof input?.chatId !== 'string') return false
    return attachChat(input.requestId, input.chatId, eventSender(event.sender, input.requestId))
  })
  ipcMain.handle(IPC.chat.abort, (_event, requestId: unknown) => {
    if (typeof requestId === 'string') abortChat(requestId)
  })

  ipcMain.handle(IPC.chats.list, () => listChats())
  ipcMain.handle(IPC.chats.get, (_event, id: unknown) =>
    typeof id === 'string' ? getChat(id) : null
  )
  ipcMain.handle(IPC.chats.delete, (_event, id: unknown) => {
    if (typeof id === 'string') deleteChat(id)
  })
}
