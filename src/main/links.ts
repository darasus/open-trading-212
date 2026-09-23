import { shell } from 'electron'

/**
 * Opening a URL with `shell.openExternal` hands it to the OS, and a `file:`, `smb:` or custom
 * app scheme can launch a program. So nothing leaves the window unless it is https.
 */

/** Hosts the app's own buttons may open over IPC: docs, provider key pages, the repository. */
const APP_LINK_HOSTS = new Set([
  'github.com',
  'docs.trading212.com',
  'www.trading212.com',
  'helpcentre.trading212.com',
  'console.anthropic.com',
  'platform.openai.com',
  'aistudio.google.com',
  'openrouter.ai',
  'ollama.com'
])

function httpsUrl(url: unknown): URL | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

/**
 * A link clicked in the window, which includes links in model-written chat answers. Any https
 * host is allowed because Streamdown shows the full URL and asks before opening it.
 */
export function clickedLinkUrl(url: unknown): string | null {
  return httpsUrl(url)?.toString() ?? null
}

/** A link the app itself asks to open over IPC. Only the hosts the UI actually links to. */
export function appLinkUrl(url: unknown): string | null {
  const parsed = httpsUrl(url)
  return parsed && APP_LINK_HOSTS.has(parsed.hostname) ? parsed.toString() : null
}

export async function openClickedLink(url: unknown): Promise<void> {
  const safe = clickedLinkUrl(url)
  if (safe) await shell.openExternal(safe)
}

export async function openAppLink(url: unknown): Promise<void> {
  const safe = appLinkUrl(url)
  if (safe) await shell.openExternal(safe)
}
