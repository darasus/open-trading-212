import { sql } from 'drizzle-orm'
import { closeDb, getDb } from '../db'
import { accountSnapshot, position, t212Context } from '../db/schema'
import { closeReadonlyDb } from '../ai/readonly-sql'
import { deleteAllSecrets } from '../keychain'

export const DAY = 86_400_000

const TABLES = [
  '"order"',
  'dividend',
  'cash_transaction',
  'position',
  'pie_instrument',
  'pie',
  'account_snapshot',
  'instrument',
  'history_cursor',
  'setting',
  't212_context',
  'chat',
  'sync_run'
]

/** Wipes every table so each test starts from an empty, migrated database. */
export function resetDb(): void {
  closeReadonlyDb()
  const db = getDb()
  for (const table of TABLES) db.run(sql.raw(`DELETE FROM ${table}`))
  deleteAllSecrets()
}

export function teardownDb(): void {
  closeReadonlyDb()
  closeDb()
}

export function seedPosition(
  seed: Partial<typeof position.$inferInsert> & { ticker: string; valueCents: number }
): void {
  getDb()
    .insert(position)
    .values({
      name: seed.ticker,
      quantity: 1,
      averagePrice: 1,
      currentPrice: 1,
      costCents: seed.valueCents,
      unrealizedCents: seed.valueCents - (seed.costCents ?? seed.valueCents),
      updatedAt: Date.now(),
      ...seed
    })
    .run()
}

/** A connected account's context row, without touching the keychain. */
export function seedContext(seed: Partial<typeof t212Context.$inferInsert> = {}): void {
  getDb()
    .insert(t212Context)
    .values({ id: 1, environment: 'live', currency: 'EUR', connectedAt: Date.now(), ...seed })
    .run()
}

export function seedSnapshot(
  seed: Partial<typeof accountSnapshot.$inferInsert> & { takenAt: number; totalCents: number }
): void {
  getDb()
    .insert(accountSnapshot)
    .values({
      currency: 'EUR',
      investedCents: 0,
      positionsValueCents: 0,
      unrealizedCents: 0,
      realizedCents: 0,
      cashCents: 0,
      ...seed
    })
    .run()
}

/** Noon local time, `days` days before now. */
export function daysAgo(days: number, hour = 12): number {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.getTime()
}

export function iso(ms: number): string {
  return new Date(ms).toISOString()
}
