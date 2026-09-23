const DAY_MS = 86_400_000

/** Local calendar day key, "2026-09-14". */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const weekdayLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})
const time = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' })

/** "Today", "Yesterday", "Thursday · 11 Sep", or "3 Mar 2025" once a year rolls over. */
export function dayLabel(ms: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const d = new Date(ms)
  if (d.getFullYear() !== new Date(now).getFullYear()) return dayMonthYear.format(d)
  if (diff < 7) return `${weekdayLong.format(d)} · ${dayMonth.format(d)}`
  return dayMonth.format(d)
}

export function formatTime(ms: number): string {
  return time.format(ms)
}

export function formatLongDate(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(ms)
}
