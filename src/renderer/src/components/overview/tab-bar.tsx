import { cn } from '@/lib/utils'

/**
 * Underlined tabs on a hairline, Linear-style. Arrow keys move between tabs, as the
 * WAI-ARIA tabs pattern expects.
 */
export function TabBar<T extends string>({
  value,
  onChange,
  tabs,
  className
}: {
  value: T
  onChange: (next: T) => void
  tabs: { value: T; label: string; count?: number | null }[]
  className?: string
}): React.JSX.Element {
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const index = tabs.findIndex((t) => t.value === value)
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    onChange(next.value)
    document.getElementById(`tab-${next.value}`)?.focus()
  }
  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn('flex h-10 items-end gap-5 border-b border-border/60', className)}
    >
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            id={`tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px flex h-10 items-center gap-1.5 border-b-2 text-[13px] transition-colors outline-none focus-visible:text-foreground',
              active
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.count != null ? (
              <span className="num text-[11px] text-muted-foreground/70">
                {t.count.toLocaleString('nl-NL')}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
