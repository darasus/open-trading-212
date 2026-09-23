import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Stand-in for the `electron` module in tests. `app.getPath('userData')` points at a fresh
 * temp folder per process, and `safeStorage` is a reversible base64 codec so the keychain
 * module can round-trip secrets without an OS keychain.
 */
const userData = mkdtempSync(join(tmpdir(), 'open-trading-212-test-'))

export const app = {
  getPath: (): string => userData,
  getVersion: (): string => '0.0.0-test',
  getName: (): string => 'open-trading-212',
  isPackaged: false
}

export const shell = {
  openExternal: async (): Promise<void> => {}
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (value: string): Buffer => Buffer.from(`enc:${value}`, 'utf8'),
  decryptString: (buffer: Buffer): string => buffer.toString('utf8').replace(/^enc:/, '')
}
