import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type ActivityQuery,
  type AiProviderId,
  type AllocationBy,
  type ChatEvent,
  type OpenT212Api,
  type SettingKey,
  type SyncProgress,
  type T212Environment
} from '../shared/ipc'

/**
 * The only bridge between the sandboxed renderer and the main process.
 * No raw `ipcRenderer` is exposed; each method maps to exactly one channel.
 */
const api: OpenT212Api = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.app.getInfo),
    openDataDir: () => ipcRenderer.invoke(IPC.app.openDataDir),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.app.openExternal, url),
    allowedHosts: () => ipcRenderer.invoke(IPC.app.allowedHosts),
    wipeEverything: () => ipcRenderer.invoke(IPC.app.wipeEverything),
    checkForUpdates: () => ipcRenderer.invoke(IPC.app.checkForUpdates),
    installUpdate: () => ipcRenderer.invoke(IPC.app.installUpdate)
  },
  settings: {
    get: (key: SettingKey) => ipcRenderer.invoke(IPC.settings.get, key),
    set: (key: SettingKey, value: string) => ipcRenderer.invoke(IPC.settings.set, key, value)
  },
  t212: {
    getStatus: () => ipcRenderer.invoke(IPC.t212.getStatus),
    connect: (input: { apiKey: string; apiSecret: string; environment: T212Environment }) =>
      ipcRenderer.invoke(IPC.t212.connect, input),
    disconnect: (input: { wipeData: boolean }) => ipcRenderer.invoke(IPC.t212.disconnect, input),
    sync: () => ipcRenderer.invoke(IPC.t212.sync),
    onSyncProgress: (listener: (progress: SyncProgress) => void) => {
      const handler = (_event: IpcRendererEvent, progress: SyncProgress): void => listener(progress)
      ipcRenderer.on(IPC.t212.syncProgress, handler)
      return () => ipcRenderer.off(IPC.t212.syncProgress, handler)
    }
  },
  portfolio: {
    summary: () => ipcRenderer.invoke(IPC.portfolio.summary),
    positions: () => ipcRenderer.invoke(IPC.portfolio.positions),
    allocation: (input: { by: AllocationBy }) => ipcRenderer.invoke(IPC.portfolio.allocation, input)
  },
  pies: {
    list: () => ipcRenderer.invoke(IPC.pies.list)
  },
  activity: {
    list: (query: ActivityQuery) => ipcRenderer.invoke(IPC.activity.list, query)
  },
  analysis: {
    valueHistory: (input: { days: number }) => ipcRenderer.invoke(IPC.analysis.valueHistory, input),
    monthlyFlows: (input: { months: number }) =>
      ipcRenderer.invoke(IPC.analysis.monthlyFlows, input),
    dividendPayers: (input: { months: number; limit: number }) =>
      ipcRenderer.invoke(IPC.analysis.dividendPayers, input),
    insights: () => ipcRenderer.invoke(IPC.analysis.insights)
  },
  ai: {
    getStatus: () => ipcRenderer.invoke(IPC.ai.getStatus),
    setProvider: (provider: AiProviderId) => ipcRenderer.invoke(IPC.ai.setProvider, provider),
    setKey: (input: { provider: AiProviderId; key: string }) =>
      ipcRenderer.invoke(IPC.ai.setKey, input),
    clearKey: (provider: AiProviderId) => ipcRenderer.invoke(IPC.ai.clearKey, provider),
    setModel: (input: { provider: AiProviderId; model: string }) =>
      ipcRenderer.invoke(IPC.ai.setModel, input),
    setOllamaUrl: (url: string) => ipcRenderer.invoke(IPC.ai.setOllamaUrl, url),
    listModels: () => ipcRenderer.invoke(IPC.ai.listModels)
  },
  chat: {
    start: (input: { requestId: string; chatId: string; messages: unknown[] }) =>
      ipcRenderer.invoke(IPC.chat.start, input),
    attach: (input: { requestId: string; chatId: string }) =>
      ipcRenderer.invoke(IPC.chat.attach, input),
    abort: (requestId: string) => ipcRenderer.invoke(IPC.chat.abort, requestId),
    onEvent: (requestId: string, listener: (event: ChatEvent) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: { requestId: string; event: ChatEvent }
      ): void => {
        if (payload.requestId === requestId) listener(payload.event)
      }
      ipcRenderer.on(IPC.chat.event, handler)
      return () => ipcRenderer.off(IPC.chat.event, handler)
    }
  },
  chats: {
    list: () => ipcRenderer.invoke(IPC.chats.list),
    get: (id: string) => ipcRenderer.invoke(IPC.chats.get, id),
    delete: (id: string) => ipcRenderer.invoke(IPC.chats.delete, id),
    onChanged: (listener: () => void) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC.chats.changed, handler)
      return () => ipcRenderer.off(IPC.chats.changed, handler)
    }
  }
}

contextBridge.exposeInMainWorld('ot212', api)
