import { Loader2 } from 'lucide-react'
import { SettingsRow } from '@/components/settings'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  installUpdate,
  useAutomaticUpdates,
  useCheckForUpdates,
  useUpdateState
} from '@/hooks/use-updates'
import { errorMessage, formatDateTime } from '@/lib/format'
import type { UpdateState } from '@shared/ipc'

function describe(state: UpdateState | undefined): React.ReactNode {
  switch (state?.status) {
    case undefined:
    case 'idle':
      return 'Updates come from GitHub Releases and install when you restart the app.'
    case 'disabled':
      return `Not available: ${state.reason}.`
    case 'checking':
      return 'Checking GitHub Releases…'
    case 'up-to-date':
      return `You are on the latest version. Checked ${formatDateTime(state.checkedAt)}.`
    case 'downloading':
      return `Downloading version ${state.version}${state.percent === null ? '' : ` (${Math.round(state.percent)}%)`}…`
    case 'ready':
      return `Version ${state.version} is downloaded. It installs when you restart.`
    case 'error':
      return <span className="text-destructive">{state.message}</span>
  }
}

/** The running version with a manual check, and the switch for the scheduled checks. */
export function UpdatesRows({ version }: { version: string }): React.JSX.Element {
  const state = useUpdateState()
  const check = useCheckForUpdates()
  const automatic = useAutomaticUpdates()
  const busy = check.isPending || state?.status === 'checking' || state?.status === 'downloading'

  return (
    <>
      <SettingsRow
        label={
          <>
            Version <span className="num font-normal text-muted-foreground">{version || '…'}</span>
          </>
        }
        description={
          check.isError ? (
            <span className="text-destructive">{errorMessage(check.error)}</span>
          ) : (
            describe(state)
          )
        }
      >
        {state?.status === 'ready' ? (
          <Button size="sm" onClick={installUpdate}>
            Restart to update
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => check.mutate()}
            disabled={busy || state?.status === 'disabled'}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Check for updates
          </Button>
        )}
      </SettingsRow>
      <SettingsRow
        label="Check automatically"
        htmlFor="updates-auto"
        description="On launch and every six hours. Only this repository's GitHub Releases are contacted."
      >
        <Switch
          id="updates-auto"
          checked={automatic.enabled}
          onCheckedChange={automatic.set}
          disabled={state?.status === 'disabled'}
        />
      </SettingsRow>
    </>
  )
}
