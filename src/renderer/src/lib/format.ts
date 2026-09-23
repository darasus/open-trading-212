const currencyFormatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(cents: number, currency = 'EUR'): string {
  let formatter = currencyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency })
    currencyFormatters.set(currency, formatter)
  }
  return formatter.format(cents / 100)
}

/** Axis-tick money: "9k", "1.5k", "-509". One decimal only below 10k, never a trailing ".0". */
export function formatCompact(cents: number): string {
  const euros = cents / 100
  if (Math.abs(euros) < 1000) return String(Math.round(euros))
  const k = euros / 1000
  const text = Math.abs(k) >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')
  return `${text}k`
}

const dateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
})
const dateTimeFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
})

export function formatDate(ms: number): string {
  return dateFormatter.format(ms)
}

export function formatDateTime(ms: number): string {
  return dateTimeFormatter.format(ms)
}

/** "+12.4%" / "-3.1%" from a fraction. */
export function formatPercent(fraction: number, signed = true): string {
  const pct = fraction * 100
  const text = `${Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`
  return signed && pct > 0 ? `+${text}` : text
}

/** Share quantities keep up to 6 decimals and drop trailing zeros. */
export function formatQuantity(quantity: number): string {
  return quantity.toLocaleString('nl-NL', { maximumFractionDigits: 6 })
}

/**
 * Instrument price in its own currency. GBX (pence) has no ISO formatter, so it is shown
 * as a plain number with a "p" suffix.
 */
export function formatPrice(price: number, currency: string | null): string {
  if (!currency) return price.toLocaleString('nl-NL', { maximumFractionDigits: 4 })
  if (currency === 'GBX') return `${price.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}p`
  try {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency,
      maximumFractionDigits: price < 10 ? 4 : 2
    }).format(price)
  } catch {
    return `${price} ${currency}`
  }
}

/** Strip Electron's "Error invoking remote method 'x': Error: " prefix from IPC errors. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
