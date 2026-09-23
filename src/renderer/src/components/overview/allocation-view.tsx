import type { AllocationSlice } from '@shared/ipc'
import { RankedRows } from '@/components/ranked-rows'
import { Section } from '@/components/section'
import { useAllocation } from '@/hooks/use-analysis'

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
]

function rows(slices: AllocationSlice[], colored: boolean) {
  return slices.map((s, i) => ({
    id: s.key,
    label: s.label,
    cents: s.valueCents,
    color: colored ? PALETTE[i % PALETTE.length] : undefined,
    meta: `${(s.share * 100).toFixed(s.share < 0.1 ? 1 : 0)}%`,
    disabled: colored || s.key === '__other'
  }))
}

/** Invested value split three ways at once: by holding, by currency and by asset type. */
export function AllocationView({
  currency,
  activeTicker,
  onTicker
}: {
  currency: string
  activeTicker?: string
  onTicker: (ticker: string) => void
}): React.JSX.Element {
  const byPosition = useAllocation('position').data ?? []
  const byCurrency = useAllocation('currency').data ?? []
  const byType = useAllocation('type').data ?? []

  return (
    <div className="grid gap-x-10 gap-y-8 pt-6 animate-fade-in xl:grid-cols-2">
      <Section title="By holding" subtitle="Share of invested value">
        <RankedRows
          rows={rows(byPosition, false)}
          currency={currency}
          active={activeTicker}
          onPick={onTicker}
          empty="No open positions."
        />
      </Section>
      <div className="flex flex-col gap-8">
        <Section title="By currency" subtitle="Currency each instrument trades in">
          <RankedRows
            rows={rows(byCurrency, true)}
            currency={currency}
            onPick={() => undefined}
            empty="No open positions."
          />
        </Section>
        <Section title="By type" subtitle="Stocks, ETFs and more">
          <RankedRows
            rows={rows(byType, true)}
            currency={currency}
            onPick={() => undefined}
            empty="No open positions."
          />
        </Section>
      </div>
    </div>
  )
}
