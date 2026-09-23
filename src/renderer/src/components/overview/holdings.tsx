import type { PositionRow } from '@shared/ipc'
import { formatMoney, formatPercent, formatPrice, formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'

const cols =
  'grid grid-cols-[minmax(180px,2fr)_minmax(70px,0.8fr)_minmax(90px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(64px,0.6fr)_minmax(48px,0.5fr)] items-center gap-3'

/** Every open position in one dense table. Clicking a row opens its panel. */
export function Holdings({
  positions,
  currency,
  selected,
  onSelect
}: {
  positions: PositionRow[]
  currency: string
  selected?: string
  onSelect: (ticker: string) => void
}): React.JSX.Element {
  const totals = positions.reduce(
    (a, p) => ({
      value: a.value + p.valueCents,
      cost: a.cost + p.costCents,
      pl: a.pl + p.unrealizedCents
    }),
    { value: 0, cost: 0, pl: 0 }
  )
  return (
    <section className="pt-3 animate-fade-in">
      <h2 className="sr-only">Holdings</h2>
      {positions.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">No open positions.</p>
      ) : (
        <div className="text-xs">
          <div
            className={cn(
              cols,
              'eyebrow h-8 border-y border-border/60 text-[10.5px] text-muted-foreground/70'
            )}
          >
            <span>Instrument</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Avg / price</span>
            <span className="text-right">Value</span>
            <span className="text-right">P/L</span>
            <span className="text-right">Return</span>
            <span className="text-right">Weight</span>
          </div>
          {positions.map((p) => {
            const up = p.unrealizedCents >= 0
            return (
              <button
                key={p.ticker}
                type="button"
                data-active={selected === p.ticker}
                onClick={() => onSelect(p.ticker)}
                className={cn(
                  cols,
                  'h-10 w-full border-b border-border/40 text-left transition-colors hover:bg-accent/50 data-[active=true]:bg-accent'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{p.name}</span>
                  <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                    {p.ticker}
                  </span>
                </span>
                <span className="num text-right">{formatQuantity(p.quantity)}</span>
                <span className="num text-right text-muted-foreground">
                  <span className="block">{formatPrice(p.currentPrice, p.instrumentCurrency)}</span>
                  <span className="block text-[10.5px] text-muted-foreground/70">
                    {formatPrice(p.averagePrice, p.instrumentCurrency)}
                  </span>
                </span>
                <span className="num text-right text-foreground">
                  {formatMoney(p.valueCents, currency)}
                </span>
                <span className={cn('num text-right', up ? 'text-positive' : 'text-negative')}>
                  {up ? '+' : ''}
                  {formatMoney(p.unrealizedCents, currency)}
                </span>
                <span className={cn('num text-right', up ? 'text-positive' : 'text-negative')}>
                  {formatPercent(p.returnPct)}
                </span>
                <span className="num text-right text-muted-foreground">
                  {formatPercent(p.weight, false)}
                </span>
              </button>
            )
          })}
          <div className={cn(cols, 'h-10 text-muted-foreground')}>
            <span className="eyebrow text-[10.5px]">Total</span>
            <span />
            <span />
            <span className="num text-right font-medium text-foreground">
              {formatMoney(totals.value, currency)}
            </span>
            <span
              className={cn(
                'num text-right font-medium',
                totals.pl >= 0 ? 'text-positive' : 'text-negative'
              )}
            >
              {totals.pl >= 0 ? '+' : ''}
              {formatMoney(totals.pl, currency)}
            </span>
            <span
              className={cn('num text-right', totals.pl >= 0 ? 'text-positive' : 'text-negative')}
            >
              {totals.cost ? formatPercent(totals.pl / totals.cost) : '—'}
            </span>
            <span className="num text-right">100%</span>
          </div>
        </div>
      )}
    </section>
  )
}
