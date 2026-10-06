import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react'
import type { PieGoalStatus } from '@shared/ipc'
import { cn } from '@/lib/utils'

const STATUS: Record<
  PieGoalStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  AHEAD: { label: 'Ahead', icon: TrendingUp, className: 'text-positive' },
  ON_TRACK: { label: 'On track', icon: CheckCircle2, className: 'text-foreground/85' },
  BEHIND: { label: 'Behind', icon: AlertTriangle, className: 'text-warning' }
}

/** Where a pie stands against its goal, always as icon plus word, never colour alone. */
export function GoalStatus({
  status,
  className
}: {
  status: PieGoalStatus
  className?: string
}): React.JSX.Element {
  const { label, icon: Icon, className: tone } = STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', tone, className)}>
      <Icon className="size-3" strokeWidth={2} />
      {label}
    </span>
  )
}

/** Thin meter for progress towards a goal, 0–1. Overshoot is clamped to a full bar. */
export function GoalMeter({
  progress,
  className
}: {
  progress: number
  className?: string
}): React.JSX.Element {
  const pct = Math.min(Math.max(progress, 0), 1) * 100
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Progress towards goal"
      className={cn('h-1 w-full overflow-hidden rounded-full bg-muted/80', className)}
    >
      <div
        className="h-full rounded-full bg-chart-1 transition-[width] duration-500 ease-out"
        style={{ width: `${pct > 0 ? Math.max(pct, 2) : 0}%` }}
      />
    </div>
  )
}
