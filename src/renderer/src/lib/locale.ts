import type { OpenT212Api } from '@shared/ipc'

function resolveLocale(): string | undefined {
  // Tests install `window.ot212` after this module loads; Intl's default locale is fine there.
  const requested = (window.ot212 as OpenT212Api | undefined)?.app.locale
  if (!requested) return undefined
  try {
    return Intl.getCanonicalLocales(requested)[0]
  } catch {
    return undefined
  }
}

/** Locale for every number and date the app shows: the OS region format. */
export const LOCALE = resolveLocale()
