import type { PieRow } from '@shared/ipc'
import { GoalMeter, GoalStatus } from '@/components/pies/goal'
import { Stat } from '@/components/overview/stats-strip'
import { formatCompact, formatMoney, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

const cols =
  'grid grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(64px,0.6fr)_minmax(72px,0.8fr)_minmax(170px,1.6fr)] items-center gap-3'

const signed = (cents: number, currency: string): string =>
  `${cents > 0 ? '+' : ''}${formatMoney(cents, currency)}`

const tone = (cents: number): 'positive' | 'negative' | undefined =>
  cents > 0 ? 'positive' : cents < 0 ? 'negative' : undefined

/** Every pie added up: what sits in pies, what went in, and what it earned. */
export function PiesStrip({ pies, currency }: { pies: PieRow[]; currency: string }) {
  const t = pies.reduce(
    (a, p) => ({
      value: a.value + p.valueCents,
      cash: a.cash + p.cashCents,
      invested: a.invested + p.investedCents,
      result: a.result + p.resultCents,
      gained: a.gained + p.dividendsGainedCents,
      reinvested: a.reinvested + p.dividendsReinvestedCents
    }),
    { value: 0, cash: 0, invested: 0, result: 0, gained: 0, reinvested: 0 }
  )
  return (
    <div className="grid grid-cols-4 divide-x divide-border/60 border-y border-border/60 animate-fade-up">
      <Stat
        label="In pies"
        value={formatMoney(t.value, currency)}
        foot={
          <span>
            {pies.length} {pies.length === 1 ? 'pie' : 'pies'}
            {t.cash > 0 ? ` · ${formatMoney(t.cash, currency)} cash` : ''}
          </span>
        }
      />
      <Stat
        label="Invested"
        value={formatMoney(t.invested, currency)}
        foot={<span>Cost of the holdings</span>}
      />
      <Stat
        label="Unrealised P/L"
        value={signed(t.result, currency)}
        tone={tone(t.result)}
        foot={
          <span>{t.invested ? `${formatPercent(t.result / t.invested)} on invested` : '—'}</span>
        }
      />
      <Stat
        label="Dividends"
        value={formatMoney(t.gained, currency)}
        tone={t.gained > 0 ? 'positive' : undefined}
        foot={<span>{formatMoney(t.reinvested, currency)} reinvested</span>}
      />
    </div>
  )
}

/** One row per pie. Clicking a row opens it. */
export function PiesTable({
  pies,
  currency,
  onOpen
}: {
  pies: PieRow[]
  currency: string
  onOpen: (id: number) => void
}): React.JSX.Element {
  return (
    <section className="text-xs animate-fade-in">
      <h2 className="sr-only">Pies</h2>
      <div
        className={cn(
          cols,
          'eyebrow h-8 border-b border-border/60 text-[10.5px] text-muted-foreground/70'
        )}
      >
        <span>Pie</span>
        <span className="text-right">Value</span>
        <span className="text-right">Invested</span>
        <span className="text-right">P/L</span>
        <span className="text-right">Return</span>
        <span className="text-right">Cash</span>
        <span>Goal</span>
      </div>
      {pies.map((p, i) => {
        const up = p.resultCents >= 0
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className={cn(
              cols,
              'h-12 w-full border-b border-border/40 text-left transition-colors hover:bg-accent/50 animate-fade-up'
            )}
            style={{ animationDelay: `${i * 20}ms` }}
          >
            <span className="min-w-0">
              <span className="block truncate text-foreground">{p.name}</span>
              <span className="block truncate text-[10.5px] text-muted-foreground">
                {p.instruments.length} {p.instruments.length === 1 ? 'holding' : 'holdings'}
              </span>
            </span>
            <span className="num text-right text-foreground">
              {formatMoney(p.valueCents, currency)}
            </span>
            <span className="num text-right text-muted-foreground">
              {formatMoney(p.investedCents, currency)}
            </span>
            <span className={cn('num text-right', up ? 'text-positive' : 'text-negative')}>
              {signed(p.resultCents, currency)}
            </span>
            <span className={cn('num text-right', up ? 'text-positive' : 'text-negative')}>
              {formatPercent(p.returnPct)}
            </span>
            <span className="num text-right text-muted-foreground">
              {p.cashCents ? formatMoney(p.cashCents, currency) : '—'}
            </span>
            {p.goalCents !== null && p.progress !== null ? (
              <span className="min-w-0">
                <span className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="num truncate text-muted-foreground">
                    <span className="text-foreground">{formatPercent(p.progress, false)}</span> of{' '}
                    {formatCompact(p.goalCents)}
                  </span>
                  {p.goalStatus ? <GoalStatus status={p.goalStatus} /> : null}
                </span>
                <GoalMeter progress={p.progress} className="mt-1.5" />
              </span>
            ) : (
              <span className="text-muted-foreground/60">No goal</span>
            )}
          </button>
        )
      })}
    </section>
  )
}
