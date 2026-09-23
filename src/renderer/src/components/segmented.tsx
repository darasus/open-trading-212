import { cn } from '@/lib/utils'

/** Small pill segmented control. One line of options, one active. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel
}: {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: string }[]
  className?: string
  'aria-label'?: string
}): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('seg', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-active={value === o.value}
          onClick={() => onChange(o.value)}
          className="seg-item"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
