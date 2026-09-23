import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Change between two values, coloured by whether the direction is good. */
export function Delta({
  current,
  previous,
  goodWhenUp,
  currency,
  absolute = false,
  className
}: {
  current: number
  previous: number
  goodWhenUp: boolean
  currency: string
  /** Show the difference in money instead of a percentage (for values that can change sign). */
  absolute?: boolean
  className?: string
}): React.JSX.Element {
  const diff = current - previous
  if (previous === 0 && current === 0) return <span className="text-muted-foreground">—</span>
  const pct = absolute || previous === 0 ? null : Math.round((diff / Math.abs(previous)) * 100)
  const up = diff > 0
  const flat = diff === 0
  const good = flat ? null : up === goodWhenUp
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 text-xs',
        good === null && 'text-muted-foreground',
        good === true && 'text-positive',
        good === false && 'text-negative',
        className
      )}
    >
      <Icon className="size-3" />
      {pct !== null
        ? `${pct > 0 ? '+' : ''}${pct}%`
        : absolute
          ? `${diff > 0 ? '+' : ''}${formatMoney(diff, currency)}`
          : 'new'}
    </span>
  )
}
