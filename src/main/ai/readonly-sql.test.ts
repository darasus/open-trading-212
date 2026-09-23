import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { getDb } from '../db'
import { runReadonlySql } from './readonly-sql'
import { storeDividends } from '../t212/sync'
import { iso, resetDb, seedPosition, teardownDb } from '../__tests__/helpers'

beforeEach(() => {
  resetDb()
  seedPosition({ ticker: 'AAPL_US_EQ', name: 'Apple', valueCents: 12_345 })
  const now = Date.now()
  storeDividends(
    Array.from({ length: 250 }, (_, i) => ({
      reference: `d${i}`,
      ticker: 'AAPL_US_EQ',
      amount: 1 + i / 100,
      paidOn: iso(now - i * 1000)
    }))
  )
})
afterAll(() => teardownDb())

describe('runReadonlySql', () => {
  it('runs a SELECT and returns columns and raw rows', () => {
    const result = runReadonlySql('SELECT ticker, name, value_cents FROM position')
    expect(result.columns).toEqual(['ticker', 'name', 'value_cents'])
    expect(result.rows).toEqual([['AAPL_US_EQ', 'Apple', 12_345]])
    expect(result.truncated).toBe(false)
  })

  it('accepts a CTE and a trailing semicolon', () => {
    const result = runReadonlySql(
      'WITH big AS (SELECT * FROM dividend WHERE amount_cents > 300) SELECT COUNT(*) AS n FROM big;'
    )
    expect(result.rows).toEqual([[49]])
  })

  it('caps the result at 200 rows and flags truncation', () => {
    const result = runReadonlySql('SELECT reference FROM dividend')
    expect(result.rows).toHaveLength(200)
    expect(result.truncated).toBe(true)
  })

  it.each([
    "INSERT INTO position (ticker) VALUES ('X')",
    'UPDATE position SET value_cents = 0',
    'DELETE FROM position',
    'DROP TABLE position',
    'PRAGMA user_version = 9',
    'VACUUM',
    "ATTACH DATABASE '/tmp/x.db' AS x",
    'BEGIN'
  ])('rejects a non-SELECT statement: %s', (query) => {
    expect(() => runReadonlySql(query)).toThrow(/Only SELECT statements are allowed/)
  })

  it('rejects forbidden keywords smuggled into a SELECT', () => {
    expect(() => runReadonlySql('SELECT 1; DELETE FROM position')).toThrow(/forbidden keyword/)
    expect(() => runReadonlySql('SELECT * FROM position; PRAGMA user_version')).toThrow(
      /forbidden keyword/
    )
  })

  it('rejects multiple statements', () => {
    expect(() => runReadonlySql('SELECT 1; SELECT 2')).toThrow(/single statement/)
  })

  it('cannot write even when the checks are dodged, because the connection is read-only', () => {
    // A write disguised via a subquery is rejected by SQLite itself on a read-only handle.
    expect(() =>
      runReadonlySql("SELECT * FROM position WHERE name = (SELECT 'x' FROM position LIMIT 1)")
    ).not.toThrow()
    const before = getDb().get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM position`)?.n
    expect(before).toBe(1)
  })
})
