import { Link } from '@tanstack/react-router'
import { Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'

/** Full-page prompt shown on data pages until a Trading 212 key is connected. */
export function NotConnected(): React.JSX.Element {
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
