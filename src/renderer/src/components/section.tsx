import { cn } from '@/lib/utils'

/**
 * A titled block separated from its neighbours by hairlines, not boxes.
 * The header row carries the title, an optional muted subtitle, and right-aligned actions.
 */
export function Section({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}): React.JSX.Element {
  return (
    <section className={cn('flex min-w-0 flex-col', className)}>
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border/60">
        <h2 className="text-[13px] font-medium tracking-tight">{title}</h2>
        {subtitle ? (
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('min-w-0 pt-3', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Scrollable page body for the simple routes (settings, privacy). */
export function Page({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-8 pt-6 pb-12', className)}>
      {children}
    </div>
  )
}
