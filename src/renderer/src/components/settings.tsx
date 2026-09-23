import { cn } from '@/lib/utils'

/**
 * Building blocks for the settings screens: a page header, cards that group related
 * settings, and rows with the label on the left and the control on the right. Rows keep
 * controls at a readable width however wide the window is.
 */

export function SettingsHeader({
  title,
  description
}: {
  title: string
  description: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="mb-8">
      <h2 className="text-[18px] leading-tight font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>
    </header>
  )
}

export function SettingsCard({
  title,
  description,
  tone,
  children,
  className
}: {
  title?: string
  description?: React.ReactNode
  tone?: 'destructive'
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <section className={cn('mb-8 last:mb-0', className)}>
      {title ? (
        <div className="mb-2.5">
          <h3
            className={cn(
              'text-[13px] font-medium tracking-tight',
              tone === 'destructive' && 'text-destructive'
            )}
          >
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          'divide-y overflow-hidden rounded-lg border',
          tone === 'destructive'
            ? 'divide-destructive/15 border-destructive/25 bg-destructive/[0.03]'
            : 'divide-border/60 border-border/60 bg-accent/20'
        )}
      >
        {children}
      </div>
    </section>
  )
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  className
}: {
  label: React.ReactNode
  description?: React.ReactNode
  /** Id of the control, so clicking the label focuses it. */
  htmlFor?: string
  children?: React.ReactNode
  className?: string
}): React.JSX.Element {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div className={cn('flex min-h-14 items-center gap-6 px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="block text-[13px] font-medium">
          {label}
        </Label>
        {description ? (
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  )
}

/** A full-width block inside a card, for content that is not a label/control pair. */
export function SettingsBlock({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <div className={cn('px-4 py-3.5', className)}>{children}</div>
}
