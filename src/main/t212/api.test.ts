import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { connect, getContext, clearContext, resolveNextPath, T212Client, T212Error } from './api'
import { getSecret } from '../keychain'
import { resetDb, teardownDb } from '../__tests__/helpers'

beforeEach(() => resetDb())
afterAll(() => teardownDb())

type Call = { url: string; init: RequestInit }

function fakeFetch(responses: (Response | (() => Response))[]) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('no more responses')
    return typeof next === 'function' ? next() : next
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, ...init })

function client(
  fetchImpl: typeof globalThis.fetch,
  now = () => 0,
  sleep: (ms: number) => Promise<void> = async () => undefined
) {
  return {
    client: new T212Client({
      environment: 'live',
      apiKey: 'KEY',
      apiSecret: 'SECRET',
      fetch: fetchImpl,
      sleep,
      now
    })
  }
}

describe('T212Client', () => {
  it('sends GET with HTTP Basic auth of key:secret to the environment host', async () => {
    const { fetch, calls } = fakeFetch([json([])])
    await client(fetch).client.positions()
    expect(calls[0].url).toBe('https://live.trading212.com/api/v0/equity/positions')
    expect(calls[0].init.method).toBe('GET')
    const auth = (calls[0].init.headers as Record<string, string>).Authorization
    expect(auth).toBe(`Basic ${Buffer.from('KEY:SECRET').toString('base64')}`)
  })

  it('falls back to the raw key header for legacy keys without a secret', async () => {
    const { fetch, calls } = fakeFetch([json({})])
    await new T212Client({
      environment: 'demo',
      apiKey: 'LEGACY',
      apiSecret: '',
      fetch
    }).accountSummary()
    expect(calls[0].url).toBe('https://demo.trading212.com/api/v0/equity/account/summary')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('LEGACY')
  })

  it('has no method that sends anything but GET', () => {
    const methods = Object.getOwnPropertyNames(T212Client.prototype)
    expect(methods).not.toEqual(expect.arrayContaining(['post', 'put', 'delete', 'patch']))
  })

  it('explains a 401 and names the missing scope on a 403', async () => {
    const { fetch } = fakeFetch([
      new Response('', { status: 401 }),
      json({ message: 'Scope( history:dividends ) missing for API key' }, { status: 403 })
    ])
    const { client: c } = client(fetch)
    await expect(c.accountSummary()).rejects.toThrow(/rejected the API key/)
    await expect(c.historyPage('dividends')).rejects.toThrow(/"history:dividends" permission/)
  })

  it('surfaces non-JSON error bodies without crashing', async () => {
    const { fetch } = fakeFetch([new Response('<html>cloudflare</html>', { status: 500 })])
    const error = await client(fetch)
      .client.instruments()
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(T212Error)
    expect((error as T212Error).status).toBe(500)
  })

  it('retries a request that never got a response, then succeeds', async () => {
    const timeout = (): Response => {
      throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
    }
    const { fetch, calls } = fakeFetch([timeout, json([{ ticker: 'X' }])])
    const sleep = vi.fn(async () => undefined)
    await expect(client(fetch, () => 0, sleep).client.positions()).resolves.toEqual([
      { ticker: 'X' }
    ])
    expect(calls).toHaveLength(2)
    expect(sleep).toHaveBeenCalledWith(1_000)
  })

  it('explains a network failure that outlasts the retries', async () => {
    const timeout = (): Response => {
      throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
    }
    const { fetch, calls } = fakeFetch([timeout, timeout, timeout])
    await expect(client(fetch).client.accountSummary()).rejects.toThrow(
      'Could not reach live.trading212.com: the connection timed out.'
    )
    expect(calls).toHaveLength(3)
  })

  it('does not retry a request refused by the network allow-list', async () => {
    const blocked = (): Response => {
      throw new Error('Blocked request to live.trading212.com: only https is allowed')
    }
    const { fetch, calls } = fakeFetch([blocked])
    await expect(client(fetch).client.positions()).rejects.toThrow(/^Blocked request/)
    expect(calls).toHaveLength(1)
  })

  it('retries a 429 after the rate-limit reset', async () => {
    let now = 1_000_000
    const { fetch, calls } = fakeFetch([
      new Response('', {
        status: 429,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(1_000_000 / 1000 + 5) }
      }),
      json([{ ticker: 'X' }])
    ])
    const sleep = vi.fn(async (ms: number) => {
      now += ms
    })
    const { client: c } = client(fetch, () => now, sleep)
    await expect(c.instruments()).resolves.toEqual([{ ticker: 'X' }])
    expect(calls).toHaveLength(2)
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(5_000)
  })

  it('waits for the window to reset when the header says nothing is left', async () => {
    let now = 0
    const { fetch } = fakeFetch([
      json({ items: [] }, { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '60' } }),
      json({ items: [] })
    ])
    const sleep = vi.fn(async (ms: number) => {
      now += ms
    })
    const { client: c } = client(fetch, () => now, sleep)
    await c.historyPage('orders')
    await c.historyPage('orders')
    expect(sleep).toHaveBeenCalledWith(60_000)
  })

  it('spaces requests by the documented limit when no headers arrive', async () => {
    let now = 0
    const { fetch } = fakeFetch([json({}), json({})])
    const sleep = vi.fn(async (ms: number) => {
      now += ms
    })
    const { client: c } = client(fetch, () => now, sleep)
    await c.accountSummary()
    await c.accountSummary()
    expect(sleep).toHaveBeenCalledWith(5_000)
  })

  it('reads pies and pie details on their own rate-limit buckets', async () => {
    let now = 0
    const { fetch, calls } = fakeFetch([json([]), json({}), json({}), json([])])
    const sleep = vi.fn(async (ms: number) => {
      now += ms
    })
    const { client: c } = client(fetch, () => now, sleep)
    await c.pies()
    await c.pie(42)
    await c.pie(43)
    expect(calls.map((call) => call.url)).toEqual([
      'https://live.trading212.com/api/v0/equity/pies',
      'https://live.trading212.com/api/v0/equity/pies/42',
      'https://live.trading212.com/api/v0/equity/pies/43'
    ])
    expect(calls.every((call) => call.init.method === 'GET')).toBe(true)
    // The list and a detail do not wait on each other; two details are 5 s apart.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000])
    await c.pies()
    expect(sleep).toHaveBeenLastCalledWith(25_000)
  })

  it('refuses a pie id that is not an integer', () => {
    const { client: c } = client(fakeFetch([]).fetch)
    expect(() => c.pie(Number.NaN)).toThrow(/Invalid pie id/)
    expect(() => c.pie('1/../../orders' as unknown as number)).toThrow(/Invalid pie id/)
  })
})

describe('resolveNextPath', () => {
  const base = '/api/v0/equity/history/orders'
  it('starts with the page limit', () => {
    expect(resolveNextPath(base)).toBe(`${base}?limit=50`)
  })
  it('accepts a full path and a bare query string', () => {
    expect(resolveNextPath(base, `${base}?limit=50&cursor=123`)).toBe(`${base}?limit=50&cursor=123`)
    expect(resolveNextPath(base, 'limit=50&cursor=123')).toBe(`${base}?limit=50&cursor=123`)
  })
  it('refuses a path that leaves the endpoint', () => {
    expect(() => resolveNextPath(base, '/api/v0/equity/orders/1')).toThrow(/Unexpected pagination/)
  })
})

describe('connect', () => {
  it('verifies the key, stores it in the keychain and records the account', async () => {
    const { fetch } = fakeFetch([json({ id: 42, currency: 'EUR' })])
    await connect({ apiKey: 'K', apiSecret: 'S', environment: 'demo' }, { fetch })
    expect(getContext()).toMatchObject({ environment: 'demo', accountId: 42, currency: 'EUR' })
    expect(getSecret('t212.apiKey')).toBe('K')
    expect(getSecret('t212.apiSecret')).toBe('S')
    clearContext()
    expect(getContext()).toBeNull()
    expect(getSecret('t212.apiKey')).toBeNull()
  })

  it('stores nothing when Trading 212 rejects the key', async () => {
    const { fetch } = fakeFetch([new Response('', { status: 401 })])
    await expect(
      connect({ apiKey: 'bad', apiSecret: 'bad', environment: 'live' }, { fetch })
    ).rejects.toThrow(/rejected/)
    expect(getContext()).toBeNull()
    expect(getSecret('t212.apiKey')).toBeNull()
  })
})
