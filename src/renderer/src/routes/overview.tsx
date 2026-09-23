import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2, Unplug } from 'lucide-react'
import { ActivityTable } from '@/components/overview/activity-table'
import { AllocationView } from '@/components/overview/allocation-view'
import { DividendsView } from '@/components/overview/dividends-view'
import { Hero, type Range } from '@/components/overview/hero'
import { Holdings } from '@/components/overview/holdings'
import { InsightsView } from '@/components/overview/insights-view'
import { PositionPanel } from '@/components/overview/position-panel'
import { StatsStrip } from '@/components/overview/stats-strip'
import { TabBar } from '@/components/overview/tab-bar'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import {
  useActivityPage,
  useInsights,
  useMonthlyFlows,
  usePositions,
  useSummary,
  useValueHistory
} from '@/hooks/use-analysis'
import { progressLabel, useConnectionStatus, useSyncProgress } from '@/hooks/use-sync'
import type { OverviewTab } from '../router'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[role="dialog"], [role="listbox"], [role="menu"]') !== null
  )
}

export function OverviewPage(): React.JSX.Element {
  const { ticker, tab = 'holdings' } = useSearch({ from: '/' })
  const navigate = useNavigate({ from: '/' })
  const status = useConnectionStatus()
  const progress = useSyncProgress()
  const summary = useSummary()
  const positions = usePositions()

  const [range, setRange] = useState<Range>(90)
  const history = useValueHistory(range)
  const flows = useMonthlyFlows(12)
  const insights = useInsights()
  // One row is enough to learn the total for the tab count.
  const activityCount = useActivityPage({}, 0, 1)

  const selectTicker = (next: string | undefined): void => {
    void navigate({
      to: '/',
      search: (prev) => ({ ...prev, ticker: next && next !== ticker ? next : undefined })
    })
  }
  const selectTab = (next: OverviewTab): void => {
    void navigate({ to: '/', search: (prev) => ({ ...prev, tab: next }) })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') {
        if (isTyping(event.target)) (event.target as HTMLElement).blur()
        else void navigate({ to: '/', search: (prev) => ({ ...prev, ticker: undefined }) })
        return
      }
      if (isTyping(event.target)) return
      if (event.key === '/') {
        const input = document.getElementById('activity-search')
        if (input) {
          event.preventDefault()
          input.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  if (status.isLoading || !status.data) return <div className="flex-1" />

  if (!status.data.connected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty className="max-w-md border animate-fade-up">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Unplug />
            </EmptyMedia>
            <EmptyTitle>Not connected</EmptyTitle>
            <EmptyDescription>
              Connect your Trading 212 account with a read-only API key. Everything stays on this
              computer.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm">
              <Link to="/settings">Connect Trading 212</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  if (!summary.data) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {progressLabel(progress) ?? 'Waiting for the first sync…'}
      </div>
    )
  }

  const currency = summary.data.currency
  const rows = positions.data ?? []
  const tabs: { value: OverviewTab; label: string; count?: number | null }[] = [
    { value: 'holdings', label: 'Holdings', count: positions.data ? rows.length : null },
    { value: 'allocation', label: 'Allocation' },
    { value: 'dividends', label: 'Dividends' },
    { value: 'insights', label: 'Insights', count: insights.data?.length ?? null },
    { value: 'activity', label: 'Activity', count: activityCount.data?.total ?? null }
  ]

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-8 px-8 pt-6 pb-16">
          <Hero
            summary={summary.data}
            history={history.data ?? []}
            range={range}
            onRange={setRange}
          />
          <StatsStrip summary={summary.data} flows={flows.data ?? []} />
          <div>
            <TabBar value={tab} onChange={selectTab} tabs={tabs} />
            {/* Keyed so each screen mounts fresh and plays its entrance. */}
            <div key={tab}>
              {tab === 'holdings' ? (
                <Holdings
                  positions={rows}
                  currency={currency}
                  selected={ticker}
                  onSelect={selectTicker}
                />
              ) : tab === 'allocation' ? (
                <AllocationView currency={currency} activeTicker={ticker} onTicker={selectTicker} />
              ) : tab === 'dividends' ? (
                <DividendsView
                  summary={summary.data}
                  activeTicker={ticker}
                  onTicker={selectTicker}
                />
              ) : tab === 'insights' ? (
                <InsightsView insights={insights.data ?? []} />
              ) : (
                <ActivityTable currency={currency} onTicker={selectTicker} />
              )}
            </div>
          </div>
        </div>
      </div>
      {ticker ? (
        <PositionPanel
          ticker={ticker}
          position={rows.find((p) => p.ticker === ticker)}
          currency={currency}
          onClose={() => selectTicker(undefined)}
        />
      ) : null}
    </div>
  )
}
