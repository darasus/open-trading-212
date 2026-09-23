import { AlertTriangle, Info } from 'lucide-react'
import type { Insight } from '@shared/ipc'
import { cn } from '@/lib/utils'

/** Rule-based observations about the portfolio, warnings first. */
export function InsightsView({ insights }: { insights: Insight[] }): React.JSX.Element {
  const sorted = [...insights].sort(
    (a, b) => Number(b.severity === 'warn') - Number(a.severity === 'warn')
  )
  return (
    <div className="pt-6 animate-fade-in">
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          Nothing notable right now.
        </p>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {sorted.map((i, idx) => (
            <li
              key={i.id}
              className={cn(
                'flex gap-3 rounded-lg border px-4 py-3 animate-fade-up',
                i.severity === 'warn'
                  ? 'border-warning/25 bg-warning/5'
                  : 'border-border/60 bg-accent/30'
              )}
              style={{ animationDelay: `${idx * 25}ms` }}
            >
              {i.severity === 'warn' ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{i.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{i.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Computed on this computer from your synced data. Facts about your portfolio, not investment
        advice.
      </p>
    </div>
  )
}
