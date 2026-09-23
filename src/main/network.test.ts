import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertAllowedUrl, BlockedRequestError, isUpdateUrl, lockDownMainNetwork } from './network'
import { setSetting } from './settings'
import { resetDb, teardownDb } from './__tests__/helpers'

beforeEach(() => resetDb())
afterAll(() => teardownDb())

describe('assertAllowedUrl', () => {
  it('allows Trading 212, the AI provider and GitHub releases over https', () => {
    for (const url of [
      'https://live.trading212.com/api/v0/equity/portfolio',
      'https://demo.trading212.com/api/v0/equity/account/cash',
      'https://api.anthropic.com/v1/messages',
      'https://github.com/darasus/open-trading-212/releases/latest',
      'https://api.github.com/repos/darasus/open-trading-212/releases',
      'https://objects.githubusercontent.com/x',
      'https://release-assets.githubusercontent.com/x'
    ]) {
      expect(() => assertAllowedUrl(url)).not.toThrow()
    }
  })

  it('blocks every other host', () => {
    expect(() => assertAllowedUrl('https://example.com/')).toThrow(BlockedRequestError)
    expect(() => assertAllowedUrl('https://live.trading212.com.attacker.net/')).toThrow(
      /not on the allow-list/
    )
    expect(() => assertAllowedUrl('https://api.openai.com/v1/chat')).toThrow(BlockedRequestError)
  })

  it('allows only this repository on GitHub, not the rest of it', () => {
    for (const url of [
      'https://github.com/someone/else/releases/latest',
      'https://github.com/darasus/open-trading-212-evil/releases',
      'https://gist.github.com/x',
      'https://api.github.com/gists',
      'https://api.github.com/repos/someone/else/releases'
    ]) {
      expect(() => assertAllowedUrl(url)).toThrow(/not on the allow-list/)
    }
  })

  it('blocks plain http even for allowed hosts', () => {
    expect(() => assertAllowedUrl('http://live.trading212.com/api/v0/equity/portfolio')).toThrow(
      /only https/
    )
  })

  it('blocks the AI host in local-only mode but keeps Trading 212 reachable', () => {
    setSetting('ai.localOnly', 'true')
    expect(() => assertAllowedUrl('https://api.anthropic.com/v1/messages')).toThrow(
      /local-only mode/
    )
    expect(() =>
      assertAllowedUrl('https://live.trading212.com/api/v0/equity/portfolio')
    ).not.toThrow()
  })
})

describe('isUpdateUrl', () => {
  it('matches release URLs only, and never Trading 212 or AI hosts', () => {
    expect(isUpdateUrl('https://github.com/darasus/open-trading-212/releases/latest')).toBe(true)
    expect(isUpdateUrl('https://release-assets.githubusercontent.com/x')).toBe(true)
    expect(isUpdateUrl('http://github.com/darasus/open-trading-212/releases/latest')).toBe(false)
    expect(isUpdateUrl('https://live.trading212.com/api/v0/equity/portfolio')).toBe(false)
    expect(isUpdateUrl('https://api.anthropic.com/v1/messages')).toBe(false)
  })
})

describe('lockDownMainNetwork', () => {
  it('wraps global fetch so blocked hosts never reach the network', async () => {
    const original = globalThis.fetch
    const spy = vi.fn(async () => new Response('ok'))
    globalThis.fetch = spy as unknown as typeof fetch
    try {
      lockDownMainNetwork()
      await expect(fetch('https://example.com/')).rejects.toThrow(BlockedRequestError)
      await expect(fetch(new URL('https://example.com/'))).rejects.toThrow(BlockedRequestError)
      await expect(fetch(new Request('https://example.com/'))).rejects.toThrow(BlockedRequestError)
      expect(spy).not.toHaveBeenCalled()

      await fetch('https://live.trading212.com/api/v0/equity/portfolio')
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = original
    }
  })
})
