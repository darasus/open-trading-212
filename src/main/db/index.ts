import { app } from 'electron'
import { join, resolve } from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { is } from '@electron-toolkit/utils'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

let db: Db | null = null
let sqlite: Database.Database | null = null

export function getDbPath(): string {
  return join(app.getPath('userData'), 'opentrading212.db')
}

/** Folder with drizzle-kit migrations: repo root in dev, app resources when packaged. */
function migrationsFolder(): string {
  return is.dev ? resolve('drizzle') : join(process.resourcesPath, 'drizzle')
}

export function getDb(): Db {
  if (db) return db
  sqlite = new Database(getDbPath())
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsFolder() })
  return db
}

export function closeDb(): void {
  sqlite?.close()
  sqlite = null
  db = null
}
