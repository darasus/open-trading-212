import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { PieInstrumentRow, PieIssue, PieRow } from '@shared/ipc'
import { GoalMeter, GoalStatus } from '@/components/pies/goal'
import { Stat } from '@/components/overview/stats-strip'
import { Section } from '@/components/section'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate, formatMoney, formatPercent, formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'

const cols =
  'grid grid-cols-[minmax(170px,2fr)_minmax(64px,0.7fr)_minmax(90px,1fr)_minmax(90px,1fr)_minmax(56px,0.6fr)_minmax(120px,1.6fr)_minmax(48px,0.5fr)_minmax(48px,0.5fr)_minmax(56px,0.6fr)] items-center gap-3'

const signed = (cents: number, currency: string): string =>
  `${cents > 0 ? '+' : ''}${formatMoney(cents, currency)}`

/** Percentage points between two weights: "+2.7 pp". */
function formatPoints(fraction: number): string {
  const pp = fraction * 100
  if (Math.abs(pp) < 0.05) return '0 pp'
  return `${pp > 0 ? '+' : '−'}${Math.abs(pp).toFixed(1)} pp`
}

/** "MAX_POSITION_SIZE_REACHED" → "Max position size reached". */
function issueLabel(name: string): string {
  const text = name.toLowerCase().replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function IssueTag({ issue }: { issue: PieIssue }): React.JSX.Element {
  return (
    <span
      className={cn(
        'min-w-0 truncate rounded-sm border px-1 text-[10px] leading-4',
        issue.severity === 'IRREVERSIBLE'
          ? 'border-destructive/30 text-destructive'
          : issue.severity === 'REVERSIBLE'
            ? 'border-warning/30 text-warning'
            : 'border-border text-muted-foreground'
      )}
    >
      {issueLabel(issue.name)}
    </span>
  )
}

/**
 * Actual weight as a bar with the target as a tick, on a scale shared by every row so
 * lengths compare across the table.
 */
function WeightBar({ row, scale }: { row: PieInstrumentRow; scale: number }): React.JSX.Element {
  const width = (share: number): string => `${scale ? (share / scale) * 100 : 0}%`
  const drift = row.currentShare - row.targetShare
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-4 items-center" aria-hidden>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
            <span
              className="block h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: width(row.currentShare), background: 'oklch(1 0 0 / 34%)' }}
            />
          </span>
          <span
            className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-background"
            style={{ left: width(row.targetShare) }}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="num">
        Actual {formatPercent(row.currentShare, false)} · Target{' '}
        {formatPercent(row.targetShare, false)} · {formatPoints(drift)}
      </TooltipContent>
    </Tooltip>
  )
}

function WeightLegend(): React.JSX.Element {
  return (
    <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-3 rounded-full" style={{ background: 'oklch(1 0 0 / 34%)' }} />
        Actual
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-0.5 rounded-full bg-foreground" />
        Target
      </span>
    </span>
  )
}

function Holdings({
  pie,
  currency,
  onTicker
}: {
  pie: PieRow
  currency: string
  onTicker: (ticker: string) => void
}): React.JSX.Element {
  const rows = pie.instruments
  const scale = Math.max(0, ...rows.map((r) => Math.max(r.currentShare, r.targetShare)))
  return (
    <Section
      title="Holdings"
      subtitle="Actual weight against the pie's target. Click a row to open it on the overview."
      actions={<WeightLegend />}
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No instruments recorded for this pie.
        </p>
      ) : (
        <div className="-mt-3 text-xs">
          <div
            className={cn(
              cols,
              'eyebrow h-8 border-b border-border/60 text-[10.5px] text-muted-foreground/70'
            )}
          >
            <span>Instrument</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Value</span>
            <span className="text-right">P/L</span>
            <span className="text-right">Return</span>
            <span>Weight</span>
            <span className="text-right">Actual</span>
            <span className="text-right">Target</span>
            <span className="text-right">Drift</span>
          </div>
          {rows.map((r) => {
            const up = r.resultCents >= 0
            const drift = r.currentShare - r.targetShare
            return (
              <button
                key={r.ticker}
                type="button"
                onClick={() => onTicker(r.ticker)}
                className={cn(
                  cols,
                  'min-h-10 w-full border-b border-border/40 py-1.5 text-left transition-colors hover:bg-accent/50'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{r.name}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                      {r.ticker}
                    </span>
                    {r.issues.map((issue) => (
                      <IssueTag key={issue.name} issue={issue} />
                    ))}
                  </span>
                </span>
                <span className="num text-right">{formatQuantity(r.quantity)}</span>
                <span className="num text-right text-foreground">
                  {formatMoney(r.valueCents, currency)}
                </span>
                <span className={cn('num text-right', up ? 'text-positive' : 'text-negative')}>
                  {signed(r.resultCents, currency)}
                </span>
                <span className={cn('num text-right', up ? 'text-positive' : 'text-negative')}>
                  {formatPercent(r.returnPct)}
                </span>
                <WeightBar row={r} scale={scale} />
                <span className="num text-right">{formatPercent(r.currentShare, false)}</span>
                <span className="num text-right text-muted-foreground">
                  {formatPercent(r.targetShare, false)}
                </span>
                {/* Drift is neither good nor bad, so it stays in ink; large drift is just brighter. */}
                <span
                  className={cn(
                    'num text-right',
                    Math.abs(drift) >= 0.05 ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {formatPoints(drift)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Section>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3 py-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num min-w-0 text-foreground">{children}</dd>
    </div>
  )
}

/** Only links the main process will actually open; anything else would be a dead button. */
function shareUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'www.trading212.com' ? url : null
  } catch {
    return null
  }
}

export function PieDetail({
  pie,
  currency,
  onBack,
  onTicker
}: {
  pie: PieRow
  currency: string
  onBack: () => void
  onTicker: (ticker: string) => void
}): React.JSX.Element {
  const up = pie.resultCents >= 0
  const link = shareUrl(pie.publicUrl)
  const drifted = pie.instruments.filter((r) => Math.abs(r.currentShare - r.targetShare) >= 0.05)

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-fade-up">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              onClick={onBack}
              className="-ml-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft />
              All pies
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Back <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
        <div className="mt-3 flex items-baseline gap-3">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{pie.name}</h2>
          {pie.goalStatus ? <GoalStatus status={pie.goalStatus} /> : null}
        </div>
        <div className="display mt-2 text-[32px] leading-none font-semibold">
          {formatMoney(pie.valueCents, currency)}
        </div>
        <div className={cn('num mt-2 text-xs', up ? 'text-positive' : 'text-negative')}>
          {signed(pie.resultCents, currency)} · {formatPercent(pie.returnPct)} on invested
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border/60 border-y border-border/60 animate-fade-up [animation-delay:60ms]">
        <Stat
          label="Invested"
          value={formatMoney(pie.investedCents, currency)}
          foot={
            <span>
              {pie.instruments.length} {pie.instruments.length === 1 ? 'holding' : 'holdings'}
            </span>
          }
        />
        <Stat
          label="Cash in pie"
          value={formatMoney(pie.cashCents, currency)}
          foot={<span>Not yet invested</span>}
        />
        <Stat
          label="Dividends"
          value={formatMoney(pie.dividendsGainedCents, currency)}
          tone={pie.dividendsGainedCents > 0 ? 'positive' : undefined}
          foot={
            <span>
              {formatMoney(pie.dividendsReinvestedCents, currency)} reinvested ·{' '}
              {formatMoney(pie.dividendsInCashCents, currency)} cash
            </span>
          }
        />
        <Stat
          label="Off target"
          value={String(drifted.length)}
          foot={<span>Holdings 5 pp or more from target</span>}
        />
      </div>

      {pie.goalCents !== null ? (
        <Section title="Goal" subtitle={pie.endAt ? `By ${formatDate(pie.endAt)}` : undefined}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="num text-foreground">
              {formatMoney(pie.valueCents, currency)}{' '}
              <span className="text-muted-foreground">
                of {formatMoney(pie.goalCents, currency)}
              </span>
            </span>
            <span className="num text-muted-foreground">
              {pie.progress !== null ? formatPercent(pie.progress, false) : '—'}
            </span>
          </div>
          <GoalMeter progress={pie.progress ?? 0} className="mt-2 h-1.5" />
        </Section>
      ) : null}

      <Holdings pie={pie} currency={currency} onTicker={onTicker} />

      <Section title="Settings" className="max-w-xl">
        <dl className="-mt-3 divide-y divide-border/60 border-b border-border/60">
          <Field label="Dividends">
            {pie.dividendCashAction === 'REINVEST'
              ? 'Reinvested in the pie'
              : pie.dividendCashAction === 'TO_ACCOUNT_CASH'
                ? 'Paid out to account cash'
                : '—'}
          </Field>
          {pie.initialInvestmentCents ? (
            <Field label="Initial investment">
              {formatMoney(pie.initialInvestmentCents, currency)}
            </Field>
          ) : null}
          <Field label="Goal">
            {pie.goalCents !== null ? formatMoney(pie.goalCents, currency) : 'No goal set'}
          </Field>
          {pie.endAt ? <Field label="Goal date">{formatDate(pie.endAt)}</Field> : null}
          {pie.createdAt ? <Field label="Created">{formatDate(pie.createdAt)}</Field> : null}
          {link ? (
            <Field label="Shared link">
              <button
                type="button"
                onClick={() => void window.ot212.app.openExternal(link)}
                className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
              >
                Open on trading212.com
                <ExternalLink className="size-3" />
              </button>
            </Field>
          ) : null}
        </dl>
      </Section>
    </div>
  )
}
