import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react'
import type { ActivityKind } from '@shared/ipc'
import { Segmented } from '@/components/segmented'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivityPage } from '@/hooks/use-analysis'
import { formatDate, formatMoney, formatPrice, formatQuantity } from '@/lib/format'
import { formatTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

export const KIND_LABELS: Record<ActivityKind, string> = {
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  fee: 'Fee',
  other: 'Other'
}

const KIND_TONE: Record<ActivityKind, string> = {
  buy: 'bg-blue/10 text-blue',
  sell: 'bg-violet/10 text-violet',
  dividend: 'bg-positive/10 text-positive',
  deposit: 'bg-accent text-foreground/80',
  withdrawal: 'bg-accent text-foreground/80',
  fee: 'bg-negative/10 text-negative',
  other: 'bg-accent text-muted-foreground'
}

const FILTERS: { value: ActivityKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'buy', label: 'Buys' },
  { value: 'sell', label: 'Sells' },
  { value: 'dividend', label: 'Dividends' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'fee', label: 'Fees' }
]

const PAGE_SIZES = [25, 50, 100] as const
type PageSize = (typeof PAGE_SIZES)[number]

const cols =
  'grid grid-cols-[92px_84px_minmax(180px,2fr)_minmax(80px,0.8fr)_minmax(90px,0.9fr)_minmax(110px,1fr)_minmax(80px,0.7fr)] items-center gap-3'

export function KindBadge({ kind }: { kind: ActivityKind }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit items-center rounded px-1.5 text-[10.5px] font-medium',
        KIND_TONE[kind]
      )}
    >
      {KIND_LABELS[kind]}
    </span>
  )
}

/**
 * Every trade, dividend and cash movement as a paged table. Filters reset to the first
 * page; the previous page stays on screen while the next one loads.
 */
export function ActivityTable({
  currency,
  fixedKind,
  onTicker,
  title = 'Activity'
}: {
  currency: string
  /** Lock the table to one kind and hide the kind filter, e.g. dividends only. */
  fixedKind?: ActivityKind
  onTicker: (ticker: string) => void
  title?: string
}): React.JSX.Element {
  const [kind, setKind] = useState<ActivityKind | 'all'>(fixedKind ?? 'all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(25)

  const query = useActivityPage(
    { kind: kind === 'all' ? undefined : kind, search: search.trim() || undefined },
    page,
    pageSize
  )
  const rows = query.data?.rows ?? []
  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pages - 1)
  const from = total === 0 ? 0 : current * pageSize + 1
  const to = Math.min(total, (current + 1) * pageSize)
  const go = (next: number): void => setPage(Math.min(Math.max(next, 0), pages - 1))

  return (
    <section className="animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 py-3">
        <h2 className="sr-only">{title}</h2>
        <label className="flex h-7 w-64 items-center gap-2 rounded-md border border-input/60 px-2 text-xs transition-colors focus-within:border-input focus-within:bg-input/20">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            id="activity-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Filter by name or ticker"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70"
            spellCheck={false}
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch('')
                setPage(0)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        {fixedKind ? null : (
          <Segmented
            value={kind}
            onChange={(next) => {
              setKind(next)
              setPage(0)
            }}
            options={FILTERS}
            aria-label="Activity type"
          />
        )}
      </div>

      <div className="text-xs">
        <div
          className={cn(
            cols,
            'eyebrow h-8 border-y border-border/60 text-[10.5px] text-muted-foreground/70'
          )}
        >
          <span>Date</span>
          <span>Type</span>
          <span>Instrument</span>
          <span className="text-right">Shares</span>
          <span className="text-right">{fixedKind === 'dividend' ? 'Per share' : 'Price'}</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Status</span>
        </div>

        {query.isLoading ? (
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={cn(cols, 'h-10 border-b border-border/40')}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="ml-auto h-3 w-10" />
              <Skeleton className="ml-auto h-3 w-14" />
              <Skeleton className="ml-auto h-3 w-16" />
              <span />
            </div>
          ))
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">Nothing matches these filters.</p>
        ) : (
          <div className={cn(query.isPlaceholderData && 'opacity-60 transition-opacity')}>
            {rows.map((r) => {
              const clickable = r.ticker !== null
              return (
                <div
                  key={r.id}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onTicker(r.ticker!) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter') onTicker(r.ticker!)
                        }
                      : undefined
                  }
                  className={cn(
                    cols,
                    'h-10 border-b border-border/40 transition-colors',
                    clickable &&
                      'cursor-default hover:bg-accent/50 focus-visible:bg-accent/50 outline-none'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-foreground/90">{formatDate(r.at)}</span>
                    <span className="num block text-[10.5px] text-muted-foreground/70">
                      {formatTime(r.at)}
                    </span>
                  </span>
                  <KindBadge kind={r.kind} />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{r.label}</span>
                    {r.ticker ? (
                      <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                        {r.ticker}
                      </span>
                    ) : null}
                  </span>
                  <span className="num text-right text-muted-foreground">
                    {r.quantity !== null ? formatQuantity(Math.abs(r.quantity)) : '—'}
                  </span>
                  <span className="num text-right text-muted-foreground">
                    {r.price !== null ? formatPrice(r.price, r.currency) : '—'}
                  </span>
                  <span
                    className={cn(
                      'num text-right',
                      r.amountCents > 0 ? 'text-positive' : 'text-foreground'
                    )}
                  >
                    {r.amountCents > 0 ? '+' : ''}
                    {formatMoney(r.amountCents, currency)}
                  </span>
                  <span className="truncate text-right text-[10.5px] text-muted-foreground">
                    {r.status ? r.status.toLowerCase().replace(/_/g, ' ') : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-3 text-xs text-muted-foreground">
        <span className="num">
          {total === 0
            ? 'No results'
            : `${from.toLocaleString('nl-NL')}–${to.toLocaleString('nl-NL')} of ${total.toLocaleString('nl-NL')}`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span>Rows</span>
          <Segmented
            value={pageSize}
            onChange={(next) => {
              setPageSize(next)
              setPage(0)
            }}
            options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))}
            aria-label="Rows per page"
          />
        </span>
        <span className="flex items-center gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="First page"
            disabled={current === 0}
            onClick={() => go(0)}
          >
            <ChevronsLeft />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Previous page"
            disabled={current === 0}
            onClick={() => go(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="num min-w-24 text-center">
            Page {current + 1} of {pages}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Next page"
            disabled={current >= pages - 1}
            onClick={() => go(current + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Last page"
            disabled={current >= pages - 1}
            onClick={() => go(pages - 1)}
          >
            <ChevronsRight />
          </Button>
        </span>
      </div>
    </section>
  )
}
