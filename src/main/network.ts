import { getSetting } from './settings'
import { PROVIDERS, providerDef, selectedProvider, selectedProviderHosts } from './ai/providers'

/**
 * The only hosts the main process may ever contact. Enforced by wrapping the global
 * `fetch`, which is what the Trading 212 client and the AI SDK providers all use, so a bug
 * or a dependency cannot quietly talk to anything else. The renderer is blocked from the
 * network entirely in index.ts.
 *
 * AI: only the provider the user selected is reachable, never the others. A cloud provider
 * is blocked in local-only mode. Ollama's local URL (always loopback) is reachable only
 * while Ollama is selected, and stays reachable in local-only mode because nothing leaves
 * the machine.
 */
const T212_HOSTS = new Set(['live.trading212.com', 'demo.trading212.com'])

/**
 * Updates: only this repository's releases (see electron-builder.yml `publish`), not the rest
 * of GitHub. Release downloads redirect to the asset CDNs, whose paths are opaque.
 */
const UPDATE_REPO = 'darasus/open-trading-212'
const UPDATE_PATHS = new Map([
  ['github.com', `/${UPDATE_REPO}/`],
  ['api.github.com', `/repos/${UPDATE_REPO}/`]
])
const UPDATE_CDN_HOSTS = new Set([
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
])
const UPDATE_HOSTS = [...UPDATE_PATHS.keys(), ...UPDATE_CDN_HOSTS]
const AI_HOSTS = new Set(PROVIDERS.flatMap((p) => p.hosts))

export class BlockedRequestError extends Error {
  constructor(host: string, reason: string) {
    super(`Blocked request to ${host}: ${reason}`)
  }
}

/** Whether a URL belongs to this app's GitHub releases. Also guards the updater's own session. */
export function isUpdateUrl(url: string): boolean {
  const { protocol, hostname, pathname } = new URL(url)
  if (protocol !== 'https:') return false
  if (UPDATE_CDN_HOSTS.has(hostname)) return true
  const prefix = UPDATE_PATHS.get(hostname)
  return prefix !== undefined && pathname.startsWith(prefix)
}

export function assertAllowedUrl(url: string): void {
  const parsed = new URL(url)
  const { hostname, protocol, origin } = parsed

  const provider = selectedProvider()
  if (provider === 'ollama' && selectedProviderHosts().includes(origin)) return

  if (protocol !== 'https:') throw new BlockedRequestError(hostname, 'only https is allowed')
  if (T212_HOSTS.has(hostname) || isUpdateUrl(url)) return
  if (AI_HOSTS.has(hostname)) {
    if (!providerDef(provider).hosts.includes(hostname))
      throw new BlockedRequestError(hostname, 'not the selected AI provider')
    if (getSetting('ai.localOnly') === 'true')
      throw new BlockedRequestError(hostname, 'local-only mode is on')
    return
  }
  throw new BlockedRequestError(hostname, 'host is not on the allow-list')
}

/** What the app can reach right now, for the Privacy page. */
export function allowedHosts(): string[] {
  return [...T212_HOSTS, ...selectedProviderHosts(), ...UPDATE_HOSTS]
}

/** Installs the allow-list on the global fetch. Call once at startup before anything else. */
export function lockDownMainNetwork(): void {
  const original = globalThis.fetch
  // Async so a blocked host rejects the returned promise instead of throwing synchronously,
  // which is what every caller of fetch expects.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    assertAllowedUrl(url)
    return original(input, init)
  }) as typeof fetch
}
