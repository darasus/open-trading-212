import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { SettingsRow } from '@/components/settings'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/format'

/** One settings row: the running version, and a manual check against GitHub Releases. */
export function UpdatesRow({ version }: { version: string }): React.JSX.Element {
  const check = useMutation({ mutationFn: () => window.ot212.app.checkForUpdates() })
  const result = check.data
  const failed = result?.status === 'error' || check.isError

  const description = failed ? (
    <span className="text-destructive">
      {result?.status === 'error' ? result.message : errorMessage(check.error)}
    </span>
  ) : result?.status === 'up-to-date' ? (
    'You are on the latest version.'
  ) : result?.status === 'available' ? (
    `Version ${result.version} is downloaded and ready.`
  ) : result?.status === 'disabled' ? (
    `Not available: ${result.reason}.`
  ) : (
    'Updates come from GitHub Releases, only when you ask.'
  )

  return (
    <SettingsRow
      label={
        <>
          Version <span className="num font-normal text-muted-foreground">{version || '…'}</span>
        </>
      }
      description={description}
    >
      {result?.status === 'available' ? (
        <Button size="sm" onClick={() => window.ot212.app.installUpdate()}>
          Restart to install
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => check.mutate()}
          disabled={check.isPending}
        >
          {check.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Check for updates
        </Button>
      )}
    </SettingsRow>
  )
}
