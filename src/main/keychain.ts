import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

/**
 * Secrets encrypted with Electron `safeStorage`, which uses the macOS Keychain
 * or Windows DPAPI. The ciphertext is kept in `secrets.json` next to the
 * database; the key that decrypts it never leaves the OS keychain.
 */
export type SecretKey =
  | 't212.apiKey'
  | 't212.apiSecret'
  | 'ai.key.anthropic'
  | 'ai.key.openai'
  | 'ai.key.google'
  | 'ai.key.openrouter'
  /** Anthropic key saved before other providers existed; read as the Anthropic key. */
  | 'ai.apiKey'

type SecretFile = Partial<Record<SecretKey, string>>

function filePath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function load(): SecretFile {
  const path = filePath()
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf8')) as SecretFile
}

function save(data: SecretFile): void {
  writeFileSync(filePath(), JSON.stringify(data), { mode: 0o600 })
}

function assertAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain encryption is not available on this system.')
  }
}

export function getSecret(key: SecretKey): string | null {
  const encoded = load()[key]
  if (!encoded) return null
  assertAvailable()
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
}

export function setSecret(key: SecretKey, value: string): void {
  assertAvailable()
  const data = load()
  data[key] = safeStorage.encryptString(value).toString('base64')
  save(data)
}

export function deleteSecret(key: SecretKey): void {
  const data = load()
  delete data[key]
  save(data)
}

export function deleteSecrets(keys: SecretKey[]): void {
  const data = load()
  for (const key of keys) delete data[key]
  save(data)
}

export function deleteAllSecrets(): void {
  const path = filePath()
  if (existsSync(path)) unlinkSync(path)
}
