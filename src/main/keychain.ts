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

async function assertAvailable(): Promise<void> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('OS keychain encryption is not available on this system.')
  }
}

async function encrypt(value: string): Promise<string> {
  return (await safeStorage.encryptStringAsync(value)).toString('base64')
}

/** Ciphertext written by the old synchronous `encryptString` still decrypts here. */
export async function getSecret(key: SecretKey): Promise<string | null> {
  const encoded = load()[key]
  if (!encoded) return null
  await assertAvailable()
  const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
    Buffer.from(encoded, 'base64')
  )
  if (shouldReEncrypt) {
    // The OS rotated the key: store the secret again under the current one, unless it
    // was replaced while we were decrypting.
    const reEncoded = await encrypt(result)
    const data = load()
    if (data[key] === encoded) {
      data[key] = reEncoded
      save(data)
    }
  }
  return result
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  await assertAvailable()
  const encoded = await encrypt(value)
  const data = load()
  data[key] = encoded
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
