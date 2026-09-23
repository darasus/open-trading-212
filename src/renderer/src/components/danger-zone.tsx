import { useMutation } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Deletes every local trace of the user. Confirmed by the native OS dialog in the main process. */
export function WipeEverythingButton({
  hint = true
}: {
  /** Show the explanation under the button. Off where the surrounding page explains it. */
  hint?: boolean
} = {}): React.JSX.Element {
  const wipe = useMutation({ mutationFn: () => window.ot212.app.wipeEverything() })
  return (
    // Without the hint the wrapper steps out of layout (`contents`), so the button lines up
    // with its neighbours exactly like a bare Button would.
    <div className={hint ? 'space-y-2' : 'contents'}>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => wipe.mutate()}
        disabled={wipe.isPending}
        aria-describedby="wipe-everything-hint"
      >
        {wipe.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
        Wipe everything
      </Button>
      <p
        id="wipe-everything-hint"
        className={cn('text-xs text-muted-foreground', !hint && 'sr-only')}
      >
        Removes the Trading 212 key, the AI key, all synced data and every chat from this computer,
        then restarts the app.
      </p>
      {wipe.error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(wipe.error)}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
