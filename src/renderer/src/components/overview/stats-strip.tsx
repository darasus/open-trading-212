import type { MonthlyFlow, PortfolioSummary } from '@shared/ipc'
import { formatMoney, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

function Stat({
  label,
  value,
  foot,
  tone
}: {
  label: string
  value: string
  foot: React.ReactNode
  tone?: 'positive' | 'negative'
}): React.JSX.Element {
  return (
    <div className="min-w-0 px-5 py-3.5 first:pl-0 last:pr-0">
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          'num mt-1 text-lg leading-none font-semibold',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative'
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        {foot}
      </div>
    </div>
  )
}

/** The portfolio at a glance, four figures in a row divided by hairlines. */
export function StatsStrip({
  summary,
  flows
}: {
  summary: PortfolioSummary
  flows: MonthlyFlow[]
}): React.JSX.Element {
  const currency = summary.currency
  const dividends = flows.reduce((a, m) => a + m.dividendsCents, 0)
  const tone = (cents: number): 'positive' | 'negative' | undefined =>
    cents > 0 ? 'positive' : cents < 0 ? 'negative' : undefined
  const signed = (cents: number): string => `${cents > 0 ? '+' : ''}${formatMoney(cents, currency)}`

  return (
    <div className="grid grid-cols-4 divide-x divide-border/60 border-y border-border/60 animate-fade-up [animation-delay:60ms]">
      <Stat
        label="Invested"
        value={formatMoney(summary.investedCents, currency)}
        foot={
          <span>
            {summary.positions} {summary.positions === 1 ? 'position' : 'positions'}
          </span>
        }
      />
      <Stat
        label="Unrealised P/L"
        value={signed(summary.unrealizedCents)}
        tone={tone(summary.unrealizedCents)}
        foot={
          summary.investedCents > 0 ? (
            <span>{formatPercent(summary.unrealizedCents / summary.investedCents)} on cost</span>
          ) : (
            <span>No open positions</span>
          )
        }
      />
      <Stat
        label="Cash"
        value={formatMoney(summary.cashCents, currency)}
        foot={
          summary.totalCents > 0 ? (
            <span>{formatPercent(summary.cashCents / summary.totalCents, false)} of account</span>
          ) : (
            <span>—</span>
          )
        }
      />
      <Stat
        label="Dividends"
        value={formatMoney(dividends, currency)}
        tone={dividends > 0 ? 'positive' : undefined}
        foot={<span>Last {flows.length} months</span>}
      />
    </div>
  )
}
