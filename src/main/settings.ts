import { eq } from 'drizzle-orm'
import { getDb } from './db'
import { setting } from './db/schema'
import type { AiProviderId, SettingKey } from '../shared/ipc'

/**
 * Every stored setting. The renderer can only touch `SettingKey` through the generic
 * settings calls; AI provider settings go through their own validated IPC calls.
 */
export type StoredSettingKey =
  | SettingKey
  | 'ai.provider'
  | 'ai.ollamaUrl'
  | `ai.model.${AiProviderId}`
  /** Anthropic model chosen before other providers existed. */
  | 'ai.model'

export function getSetting(key: StoredSettingKey): string | null {
  const row = getDb().select().from(setting).where(eq(setting.key, key)).get()
  return row?.value ?? null
}

export function setSetting(key: StoredSettingKey, value: string): void {
  getDb()
    .insert(setting)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: setting.key, set: { value, updatedAt: new Date() } })
    .run()
}
