import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, Line, Tooltip, XAxis, YAxis } from 'recharts'
import type { ValuePoint } from '@shared/ipc'
import { formatCompact, formatMoney } from '@/lib/format'

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

/**
 * Account value over time with net deposits as a stepped dotted line underneath, so the
 * gap between them reads as total return. Real synced days are solid; days rebuilt from
 * trades are dashed.
 */
export function ValueChart({
  points,
  currency,
  height = 176
}: {
  points: ValuePoint[]
  currency: string
  height?: number
}): React.JSX.Element {
  // Two strokes over one fill: solid where a real snapshot exists, dashed where the value
  // was rebuilt. The dashed series borrows its neighbours' real points so the line joins.
  const data = useMemo(
    () =>
      points.map((p, i) => ({
        ...p,
        ts: Date.parse(p.day),
        actualCents: p.estimated ? null : p.totalCents,
        estimateCents:
          p.estimated || points[i - 1]?.estimated || points[i + 1]?.estimated ? p.totalCents : null
      })),
    [points]
  )
  const [min, max] = useMemo(() => {
    if (data.length === 0) return [0, 0]
    let lo = Infinity
    let hi = -Infinity
    for (const p of data) {
      lo = Math.min(lo, p.totalCents, p.investedCents)
      hi = Math.max(hi, p.totalCents, p.investedCents)
    }
    const pad = Math.max((hi - lo) * 0.15, 100)
    return [lo - pad, hi + pad]
  }, [data])

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Not enough history yet. The chart fills in once orders and deposits have synced.
      </div>
    )
  }

  const tickCount = Math.max(3, Math.min(8, Math.floor(data.length / 12)))
  const step = Math.max(1, Math.floor((data.length - 1) / (tickCount - 1)))
  const ticks = data.filter((_, i) => i % step === 0).map((p) => p.ts)

  return (
    <div style={{ height }} className="w-full animate-fade-in">
      <AreaChart
        width={800}
        height={height}
        data={data}
        margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
        style={{ width: '100%' }}
        responsive
      >
        <defs>
          <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-income)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--viz-income)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="oklch(1 0 0 / 6%)" />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={ticks}
          tickFormatter={(v: number) => shortDate.format(v)}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          fontSize={11}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          orientation="right"
          domain={[min, max]}
          tickFormatter={formatCompact}
          tickLine={false}
          axisLine={false}
          width={44}
          tickCount={4}
          fontSize={11}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          cursor={{ stroke: 'oklch(1 0 0 / 20%)', strokeWidth: 1 }}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined
            if (!active || !p) return null
            return (
              <div className="glass rounded-md px-2.5 py-1.5 text-xs shadow-lg">
                <div className="text-muted-foreground">{longDate.format(p.ts)}</div>
                <div className="num mt-0.5 font-medium">
                  {p.estimated ? '≈ ' : ''}
                  {formatMoney(p.totalCents, currency)}
                </div>
                <div className="num text-muted-foreground">
                  Paid in {formatMoney(p.investedCents, currency)}
                </div>
                {p.estimated ? (
                  <div className="mt-1 max-w-48 text-[10.5px] text-muted-foreground/80">
                    Estimated from your trades, with prices interpolated between them.
                  </div>
                ) : null}
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="totalCents"
          stroke="none"
          fill="url(#value-fill)"
          isAnimationActive={false}
          dot={false}
          activeDot={{
            r: 3,
            strokeWidth: 2,
            stroke: 'var(--background)',
            fill: 'var(--viz-income)'
          }}
        />
        <Line
          type="monotone"
          dataKey="estimateCents"
          stroke="var(--viz-income)"
          strokeOpacity={0.7}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
        <Line
          type="monotone"
          dataKey="actualCents"
          stroke="var(--viz-income)"
          strokeWidth={1.5}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
        <Line
          type="stepAfter"
          dataKey="investedCents"
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray="3 3"
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </div>
  )
}
