import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

export type RankedRow = {
  id: string
  label: string
  cents: number
  /** Secondary text after the amount, e.g. "×4" or "monthly". */
  meta?: string
  color?: string
  /** Small trailing note, e.g. a due date. */
  note?: React.ReactNode
  disabled?: boolean
}

/**
 * Ranked list where each row carries a hairline proportional bar underneath.
 * Clicking a row filters the ledger; the active row is highlighted.
 */
export function RankedRows({
  rows,
  currency,
  active,
  onPick,
  empty,
  showShare
}: {
  rows: RankedRow[]
  currency: string
  active?: string
  onPick: (id: string) => void
  empty: string
  showShare?: boolean
}): React.JSX.Element {
  if (rows.length === 0) return <p className="py-2 text-xs text-muted-foreground">{empty}</p>
  const max = Math.max(...rows.map((r) => r.cents))
  const total = rows.reduce((a, r) => a + r.cents, 0)
  return (
    <ol className="-mx-2">
      {rows.map((r, i) => (
        <li key={r.id} className="animate-fade-up" style={{ animationDelay: `${i * 20}ms` }}>
          <button
            type="button"
            disabled={r.disabled}
            onClick={() => onPick(r.id)}
            data-active={active === r.id}
            className={cn(
              'group block w-full rounded-md px-2 py-1.5 text-left transition-colors',
              'hover:bg-accent/70 disabled:cursor-default disabled:hover:bg-transparent',
              'data-[active=true]:bg-accent'
            )}
          >
            <div className="flex items-center gap-2 text-xs">
              {r.color ? (
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: r.color }} />
              ) : (
                <span className="w-4 shrink-0 text-right text-[10px] text-muted-foreground/60 num">
                  {i + 1}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-foreground/90 group-hover:text-foreground">
                {r.label || '—'}
              </span>
              {r.note}
              <span className="num shrink-0 text-foreground">{formatMoney(r.cents, currency)}</span>
              {r.meta ? (
                <span className="num w-12 shrink-0 text-right text-[10px] text-muted-foreground/70">
                  {r.meta}
                </span>
              ) : showShare ? (
                <span className="num w-8 shrink-0 text-right text-[10px] text-muted-foreground/70">
                  {total ? Math.round((r.cents / total) * 100) : 0}%
                </span>
              ) : null}
            </div>
            <div className="bar-track mt-1.5 ml-[14px]">
              <div
                className="bar-fill"
                style={{
                  width: `${max ? Math.max(1.5, (r.cents / max) * 100) : 0}%`,
                  background: r.color ?? 'oklch(1 0 0 / 28%)'
                }}
              />
            </div>
          </button>
        </li>
      ))}
    </ol>
  )
}
