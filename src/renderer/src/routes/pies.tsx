import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { AlertTriangle, Loader2, PieChart } from 'lucide-react'
import { NotConnected } from '@/components/not-connected'
import { PieDetail } from '@/components/pies/pie-detail'
import { PiesStrip, PiesTable } from '@/components/pies/pies-table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { usePies } from '@/hooks/use-analysis'
import { progressLabel, useConnectionStatus, useSyncProgress } from '@/hooks/use-sync'
import { formatDateTime } from '@/lib/format'
import { isTyping } from '@/lib/utils'

/** Shown above the pies when the last read failed, e.g. the key lacks the pies permission. */
function ReadError({ error, syncedAt }: { error: string; syncedAt: number | null }) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 animate-fade-up">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0">
        <div className="text-[13px] font-medium">Pies could not be read from Trading 212</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{error}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {syncedAt
            ? `Showing pies as of ${formatDateTime(syncedAt)}.`
            : 'Pies need the "pies:read" permission on your API key. The rest of the app works without it.'}
        </div>
      </div>
    </div>
  )
}

export function PiesPage(): React.JSX.Element {
  const { id } = useSearch({ from: '/pies' })
  const navigate = useNavigate({ from: '/pies' })
  const status = useConnectionStatus()
  const progress = useSyncProgress()
  const pies = usePies()

  const open = (next: number | undefined): void => {
    void navigate({ to: '/pies', search: { id: next } })
  }

  useEffect(() => {
    if (id === undefined) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      void navigate({ to: '/pies', search: {} })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, navigate])

  if (status.isLoading || !status.data) return <div className="flex-1" />
  if (!status.data.connected) return <NotConnected />

  const state = pies.data
  if (!state || (state.syncedAt === null && state.error === null)) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {progressLabel(progress) ?? 'Pies load on the next sync…'}
      </div>
    )
  }

  const currency = state.currency ?? 'EUR'
  const selected = id !== undefined ? state.pies.find((p) => p.id === id) : undefined

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full flex-col gap-8 px-8 pt-6 pb-16">
        {state.error ? <ReadError error={state.error} syncedAt={state.syncedAt} /> : null}
        {selected ? (
          <div key={selected.id}>
            <PieDetail
              pie={selected}
              currency={currency}
              onBack={() => open(undefined)}
              onTicker={(ticker) => void navigate({ to: '/', search: { ticker } })}
            />
          </div>
        ) : state.pies.length === 0 ? (
          state.error ? null : (
            <Empty className="mx-auto mt-10 max-w-md border animate-fade-up">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PieChart />
                </EmptyMedia>
                <EmptyTitle>No pies</EmptyTitle>
                <EmptyDescription>
                  This account has no pies. Pies you create in the Trading 212 app show up here
                  after the next sync.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : (
          <>
            <PiesStrip pies={state.pies} currency={currency} />
            <PiesTable pies={state.pies} currency={currency} onOpen={open} />
            <p className="-mt-4 text-[11px] text-muted-foreground/60">
              Read-only. Pies are edited in the Trading 212 app. Synced{' '}
              {state.syncedAt ? formatDateTime(state.syncedAt) : '—'}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
