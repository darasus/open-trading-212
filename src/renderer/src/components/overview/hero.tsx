import type { PortfolioSummary, ValuePoint } from '@shared/ipc'
import { Delta } from '@/components/delta'
import { ValueChart } from '@/components/overview/value-chart'
import { Segmented } from '@/components/segmented'
import { formatDateTime, formatMoney } from '@/lib/format'

export type Range = 30 | 90 | 365 | 3650
export const RANGES: { value: Range; label: string }[] = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
  { value: 3650, label: 'All' }
]

/** Account value, as large as the page allows, with the value line running beneath it. */
export function Hero({
  summary,
  history,
  range,
  onRange
}: {
  summary: PortfolioSummary
  history: ValuePoint[]
  range: Range
  onRange: (next: Range) => void
}): React.JSX.Element {
  const currency = summary.currency
  const first = history[0]
  const last = history.at(-1)
  // Change net of deposits: value growth minus what was paid in over the same range.
  const gain =
    first && last
      ? {
          current: last.totalCents - last.investedCents,
          previous: first.totalCents - first.investedCents
        }
      : null

  return (
    <section className="animate-fade-up">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="eyebrow">Account value</div>
          <div className="display mt-1.5 text-[38px] leading-none font-semibold text-foreground">
            {formatMoney(summary.totalCents, currency)}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {gain && history.length > 1 ? (
              <span className="inline-flex items-center gap-1.5">
                <Delta
                  current={gain.current}
                  previous={gain.previous}
                  goodWhenUp
                  currency={currency}
                  absolute
                />
                <span>P/L over {RANGES.find((r) => r.value === range)?.label}</span>
              </span>
            ) : null}
            <span className="text-muted-foreground/40">·</span>
            <span>as of {formatDateTime(summary.takenAt)}</span>
            {history.some((p) => p.estimated) ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>Dashed: estimated from your trades</span>
              </>
            ) : null}
          </div>
        </div>
        <Segmented value={range} onChange={onRange} options={RANGES} aria-label="Chart range" />
      </div>
      <div className="mt-5">
        <ValueChart points={history} currency={currency} />
      </div>
    </section>
  )
}
