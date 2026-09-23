import { useState } from 'react'
import type { PortfolioSummary } from '@shared/ipc'
import { ActivityTable } from '@/components/overview/activity-table'
import { DividendChart } from '@/components/overview/dividend-chart'
import { RankedRows } from '@/components/ranked-rows'
import { Section } from '@/components/section'
import { Segmented } from '@/components/segmented'
import { useDividendPayers, useMonthlyFlows } from '@/hooks/use-analysis'
import { formatMoney, formatPercent } from '@/lib/format'

function Figure({
  label,
  value,
  foot
}: {
  label: string
  value: string
  foot: string
}): React.JSX.Element {
  return (
    <div className="min-w-0 px-5 py-3.5 first:pl-0 last:pr-0">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-lg leading-none font-semibold">{value}</div>
      <div className="mt-1.5 truncate text-xs text-muted-foreground">{foot}</div>
    </div>
  )
}

/** Dividend income: headline figures, the monthly chart, top payers and every payment. */
export function DividendsView({
  summary,
  activeTicker,
  onTicker
}: {
  summary: PortfolioSummary
  activeTicker?: string
  onTicker: (ticker: string) => void
}): React.JSX.Element {
  const [months, setMonths] = useState<12 | 24>(12)
  const currency = summary.currency
  const flows = useMonthlyFlows(months).data ?? []
  const last12 = useMonthlyFlows(12).data ?? []
  const payers = useDividendPayers(months, 10).data ?? []

  const trailing = last12.reduce((a, m) => a + m.dividendsCents, 0)
  const paying = last12.filter((m) => m.dividendsCents > 0).length
  const yieldOnValue = summary.totalCents > 0 ? trailing / summary.totalCents : 0

  return (
    <div className="flex flex-col gap-8 pt-6 animate-fade-in">
      <div className="grid grid-cols-3 divide-x divide-border/60 border-y border-border/60">
        <Figure
          label="Last 12 months"
          value={formatMoney(trailing, currency)}
          foot={`${paying} of 12 months paid out`}
        />
        <Figure
          label="Monthly average"
          value={formatMoney(Math.round(trailing / 12), currency)}
          foot="Over the last 12 months"
        />
        <Figure
          label="Yield on value"
          value={formatPercent(yieldOnValue, false)}
          foot="Trailing 12 months ÷ account value"
        />
      </div>

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section
          title="Income per month"
          actions={
            <Segmented
              value={months}
              onChange={setMonths}
              options={[
                { value: 12, label: '12m' },
                { value: 24, label: '24m' }
              ]}
              aria-label="Months"
            />
          }
        >
          <DividendChart months={flows} currency={currency} height={200} />
        </Section>
        <Section title="Top payers" subtitle={`Last ${months} months`}>
          <RankedRows
            rows={payers.map((p) => ({
              id: p.ticker,
              label: p.name,
              cents: p.amountCents,
              meta: `×${p.payments}`
            }))}
            currency={currency}
            active={activeTicker}
            onPick={onTicker}
            empty="No dividends received in this window."
          />
        </Section>
      </div>

      <Section title="Payments" bodyClassName="pt-0">
        <ActivityTable
          currency={currency}
          fixedKind="dividend"
          onTicker={onTicker}
          title="Dividend payments"
        />
      </Section>
    </div>
  )
}
