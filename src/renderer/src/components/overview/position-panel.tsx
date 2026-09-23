import { X } from 'lucide-react'
import type { PositionRow } from '@shared/ipc'
import { KIND_LABELS } from '@/components/overview/activity-table'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActivityPage } from '@/hooks/use-analysis'
import { formatDate, formatMoney, formatPercent, formatPrice, formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 py-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num min-w-0 text-foreground">{children}</dd>
    </div>
  )
}

/** Right-hand detail pane for one instrument: the position if held, and its history. */
export function PositionPanel({
  ticker,
  position,
  currency,
  onClose
}: {
  ticker: string
  position?: PositionRow
  currency: string
  onClose: () => void
}): React.JSX.Element {
  const history = useActivityPage({ ticker }, 0, 200)
  const activity = { rows: history.data?.rows ?? [], isLoading: history.isLoading }
  const name = position?.name ?? activity.rows[0]?.label ?? ticker
  const dividends = activity.rows
    .filter((r) => r.kind === 'dividend')
    .reduce((a, r) => a + r.amountCents, 0)
  const up = (position?.unrealizedCents ?? 0) >= 0

  return (
    <aside
      key={ticker}
      className="flex h-full w-[380px] shrink-0 flex-col border-l border-border/60 bg-background animate-slide-in-right"
      aria-label="Position details"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 px-3">
        <span className="font-mono text-[11px] text-muted-foreground">{ticker}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto"
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Close <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
        <div className="text-[15px] font-semibold tracking-tight">{name}</div>
        {position ? (
          <>
            <div className="display mt-2 text-[28px] leading-none font-semibold">
              {formatMoney(position.valueCents, currency)}
            </div>
            <div className={cn('num mt-2 text-xs', up ? 'text-positive' : 'text-negative')}>
              {up ? '+' : ''}
              {formatMoney(position.unrealizedCents, currency)} ·{' '}
              {formatPercent(position.returnPct)} on cost
            </div>

            <dl className="mt-5 divide-y divide-border/60 border-y border-border/60">
              <Field label="Shares">{formatQuantity(position.quantity)}</Field>
              <Field label="Price">
                {formatPrice(position.currentPrice, position.instrumentCurrency)}
              </Field>
              <Field label="Average paid">
                {formatPrice(position.averagePrice, position.instrumentCurrency)}
              </Field>
              <Field label="Cost">{formatMoney(position.costCents, currency)}</Field>
              {position.fxCents !== 0 ? (
                <Field label="FX effect">{formatMoney(position.fxCents, currency)}</Field>
              ) : null}
              <Field label="Weight">{formatPercent(position.weight, false)}</Field>
              {position.isin ? (
                <Field label="ISIN">
                  <span className="select-text font-mono text-[11px]">{position.isin}</span>
                </Field>
              ) : null}
              {position.openedAt ? (
                <Field label="First bought">{formatDate(position.openedAt)}</Field>
              ) : null}
              {dividends > 0 ? (
                <Field label="Dividends">
                  <span className="text-positive">{formatMoney(dividends, currency)}</span>
                </Field>
              ) : null}
            </dl>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Not currently held.</p>
        )}

        <h3 className="mt-6 mb-1 text-[13px] font-medium tracking-tight">History</h3>
        {activity.rows.length === 0 && !activity.isLoading ? (
          <p className="text-xs text-muted-foreground">No orders or dividends recorded.</p>
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {activity.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-1.5">
                <span className="w-20 shrink-0 text-muted-foreground">{formatDate(r.at)}</span>
                <span className="w-16 shrink-0">{KIND_LABELS[r.kind]}</span>
                <span className="num min-w-0 flex-1 truncate text-muted-foreground">
                  {r.quantity !== null && r.kind !== 'dividend' ? formatQuantity(r.quantity) : ''}
                </span>
                <span className={cn('num shrink-0', r.amountCents > 0 && 'text-positive')}>
                  {formatMoney(r.amountCents, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
