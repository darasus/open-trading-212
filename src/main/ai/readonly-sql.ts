import Database from 'better-sqlite3'
import { getDbPath } from '../db'

/**
 * A separate read-only connection for the model's SQL escape hatch.
 * SQLite's `readonly` flag plus `query_only` make writes impossible at the
 * engine level; the statement check on top keeps the surface obvious.
 */
let readonly: Database.Database | null = null

const MAX_ROWS = 200
const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|begin|commit|rollback|savepoint|release)\b/i

function connection(): Database.Database {
  if (!readonly) {
    readonly = new Database(getDbPath(), { readonly: true, fileMustExist: true })
    readonly.pragma('query_only = ON')
  }
  return readonly
}

export function closeReadonlyDb(): void {
  readonly?.close()
  readonly = null
}

export const SQL_SCHEMA_DESCRIPTION = `
Tables (SQLite, read-only):
- position(ticker, name, isin, instrument_currency, quantity, quantity_in_pies, average_price, current_price, value_cents, cost_cents, unrealized_cents, fx_cents, opened_at, updated_at) — current holdings
- "order"(id, order_id, ticker, name, side 'BUY'|'SELL', type, status, fill_type, quantity, price, instrument_currency, amount_cents, realized_cents, fees_cents, fx_rate, initiated_from, created_at, at) — order history
- dividend(reference, ticker, name, quantity, amount_cents, gross_per_share, ticker_currency, type, paid_at)
- cash_transaction(reference, type 'DEPOSIT'|'WITHDRAW'|'FEE'|'TRANSFER'|'INTEREST_ON_FREE_CASH'|'LENDING_INTEREST', amount_cents, currency, at)
- account_snapshot(taken_at, currency, total_cents, invested_cents, positions_value_cents, unrealized_cents, realized_cents, cash_cents, reserved_cents, in_pies_cents) — one row per sync
- instrument(ticker, name, short_name, isin, currency, type) — every tradable instrument
Notes: *_cents columns are integer cents in the account currency; amount_cents is signed (buys, withdrawals and fees negative). price, average_price, current_price and gross_per_share are in the instrument currency (GBX = pence). Timestamps are ms since epoch (UTC); use datetime(at/1000,'unixepoch','localtime'). Quote the "order" table name.`

export function runReadonlySql(query: string): {
  columns: string[]
  rows: unknown[][]
  truncated: boolean
} {
  const trimmed = query.trim().replace(/;\s*$/, '')
  if (!/^\s*(select|with)\b/i.test(trimmed)) throw new Error('Only SELECT statements are allowed')
  if (FORBIDDEN.test(trimmed)) throw new Error('Statement contains a forbidden keyword')
  if (trimmed.includes(';')) throw new Error('Only a single statement is allowed')

  const statement = connection().prepare(`SELECT * FROM (${trimmed}) LIMIT ${MAX_ROWS + 1}`)
  statement.raw(true)
  const rows = statement.all() as unknown[][]
  const columns = statement.columns().map((c) => c.name)
  const truncated = rows.length > MAX_ROWS
  return { columns, rows: truncated ? rows.slice(0, MAX_ROWS) : rows, truncated }
}
