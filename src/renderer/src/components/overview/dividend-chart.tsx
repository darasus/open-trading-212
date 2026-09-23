import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyFlow } from '@shared/ipc'
import { monthLabel } from '@/hooks/use-analysis'
import { formatCompact, formatMoney } from '@/lib/format'

/** Dividend income per month. One series, quiet grid. */
export function DividendChart({
  months,
  currency,
  height = 150
}: {
  months: MonthlyFlow[]
  currency: string
  height?: number
}): React.JSX.Element {
  const data = months.map((m) => ({ ...m, label: monthLabel(m.month) }))
  return (
    <div style={{ height }} className="w-full">
      <BarChart
        width={600}
        height={height}
        data={data}
        margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="30%"
        style={{ width: '100%' }}
        responsive
      >
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="oklch(1 0 0 / 6%)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
          stroke="var(--muted-foreground)"
          interval="preserveStartEnd"
        />
        <YAxis
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={40}
          tickCount={4}
          fontSize={11}
          tickFormatter={formatCompact}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          cursor={{ fill: 'oklch(1 0 0 / 3%)' }}
          isAnimationActive={false}
          content={({ active, payload, label }) => {
            const p = payload?.[0]?.payload as MonthlyFlow | undefined
            if (!active || !p) return null
            return (
              <div className="glass rounded-md px-2.5 py-1.5 text-xs shadow-lg">
                <div className="text-muted-foreground">{String(label)}</div>
                <div className="num mt-0.5 font-medium">
                  {formatMoney(p.dividendsCents, currency)}
                </div>
              </div>
            )
          }}
        />
        <Bar
          dataKey="dividendsCents"
          fill="var(--positive)"
          radius={[2, 2, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
      </BarChart>
    </div>
  )
}
