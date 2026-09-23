import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import type { T212Environment } from '@shared/ipc'
import { Segmented } from '@/components/segmented'
import { SettingsBlock, SettingsCard, SettingsHeader, SettingsRow } from '@/components/settings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage, formatDateTime } from '@/lib/format'
import {
  isSyncActive,
  progressLabel,
  queryKeys,
  useConnectionStatus,
  useSyncNow,
  useSyncProgress
} from '@/hooks/use-sync'
import { cn } from '@/lib/utils'

const HEADER = (
  <SettingsHeader
    title="Trading 212"
    description="Your API key is stored in the OS keychain and only ever sent to Trading 212. The app only reads: it never places, edits or cancels orders."
  />
)

export function ConnectT212Card(): React.JSX.Element {
  const status = useConnectionStatus()
  if (status.isLoading || !status.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-80" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    )
  }
  return status.data.connected ? <Connected /> : <ConnectForm />
}

const STEPS = [
  'In the Trading 212 app, open Settings → API (Beta) and generate a key.',
  'Tick only the read permissions: account, portfolio, metadata and history.',
  'Copy the key and the secret. The secret is shown only once.'
]

function ConnectForm(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [environment, setEnvironment] = useState<T212Environment>('live')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [error, setError] = useState<string | null>(null)

  const connect = useMutation({
    mutationFn: () => window.ot212.t212.connect({ apiKey, apiSecret, environment }),
    onSuccess: () => {
      setApiKey('')
      setApiSecret('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.status })
    },
    onError: (e) => setError(errorMessage(e))
  })

  return (
    <>
      {HEADER}
      <SettingsCard title="Get a read-only key">
        <SettingsBlock>
          <ol className="space-y-2 text-xs text-muted-foreground">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10.5px] font-medium text-foreground">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard title="Connect">
        <SettingsRow
          label="Account"
          description={
            environment === 'demo'
              ? 'Practice uses virtual money. Create the key while the app is in Practice mode.'
              : 'Invest and Stocks ISA accounts each need their own key.'
          }
        >
          <Segmented
            value={environment}
            onChange={setEnvironment}
            options={[
              { value: 'live', label: 'Real money' },
              { value: 'demo', label: 'Practice' }
            ]}
            className={cn(connect.isPending && 'pointer-events-none opacity-50')}
            aria-label="Account"
          />
        </SettingsRow>
        <SettingsRow label="API key" htmlFor="t212-api-key">
          <Input
            id="t212-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your API key"
            disabled={connect.isPending}
            className="w-80 select-text font-mono"
          />
        </SettingsRow>
        <SettingsRow
          label="API secret"
          htmlFor="t212-api-secret"
          description="Shown once, when you create the key."
        >
          <Input
            id="t212-api-secret"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="Paste your API secret"
            disabled={connect.isPending}
            className="w-80 select-text font-mono"
          />
        </SettingsRow>
        <SettingsBlock className="flex items-center justify-end gap-3 bg-accent/30">
          {error ? <span className="mr-auto text-xs text-destructive">{error}</span> : null}
          <Button
            size="sm"
            onClick={() => connect.mutate()}
            disabled={connect.isPending || !apiKey.trim() || !apiSecret.trim()}
          >
            {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Connect
          </Button>
        </SettingsBlock>
      </SettingsCard>
    </>
  )
}

function Connected(): React.JSX.Element {
  const queryClient = useQueryClient()
  const status = useConnectionStatus()
  const progress = useSyncProgress()
  const sync = useSyncNow()
  const [wipeData, setWipeData] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const disconnect = useMutation({
    mutationFn: () => window.ot212.t212.disconnect({ wipeData }),
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
    onError: (e) => setError(errorMessage(e))
  })

  const data = status.data
  const label = progressLabel(progress)
  const syncing = data?.syncing || sync.isPending || isSyncActive(progress)
  const demo = data?.environment === 'demo'

  return (
    <>
      {HEADER}
      <SettingsCard title="Connection">
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              <span className={cn('size-2 rounded-full', demo ? 'bg-warning' : 'bg-positive')} />
              Connected
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10.5px] font-medium',
                  demo ? 'bg-warning/10 text-warning' : 'bg-positive/10 text-positive'
                )}
              >
                {demo ? 'Practice' : 'Real money'}
              </span>
            </span>
          }
          description={[
            data?.accountId ? `Account ${data.accountId}` : null,
            data?.currency ? `${data.currency} account` : null
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <SettingsRow
          label="Sync"
          description={
            label ??
            (data?.lastSyncedAt
              ? `Last synced ${formatDateTime(data.lastSyncedAt)}. Runs on launch and every 15 minutes while the app is open.`
              : 'Not synced yet.')
          }
        >
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={syncing}>
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Sync now
          </Button>
        </SettingsRow>
        {sync.error ? (
          <SettingsBlock>
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(sync.error)}</AlertDescription>
            </Alert>
          </SettingsBlock>
        ) : null}
      </SettingsCard>

      <SettingsCard title="Disconnect" tone="destructive">
        <SettingsRow
          label="Disconnect Trading 212"
          description="Removes the key and secret from the keychain. Revoke the key in the Trading 212 app to fully cut access."
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={syncing || disconnect.isPending}>
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect Trading 212?</AlertDialogTitle>
                <AlertDialogDescription>
                  Removes the API key and secret from the keychain.
                  {wipeData
                    ? ' Synced positions, history and chats on this computer will also be deleted.'
                    : ''}{' '}
                  Revoke the key in the Trading 212 app to fully cut access.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => disconnect.mutate()}>
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsRow>
        <SettingsRow
          label="Also delete synced data"
          htmlFor="wipe-on-disconnect"
          description="Positions, history and chats stored on this computer."
        >
          <Checkbox
            id="wipe-on-disconnect"
            checked={wipeData}
            onCheckedChange={(checked) => setWipeData(checked === true)}
          />
        </SettingsRow>
        {error ? (
          <SettingsBlock>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </SettingsBlock>
        ) : null}
      </SettingsCard>
    </>
  )
}
