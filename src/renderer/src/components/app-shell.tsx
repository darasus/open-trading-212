import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Lock,
  PieChart,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActiveChatId, useChats, useDeleteChat, useNewChat } from '@/hooks/use-chats'
import { usePies, usePositions } from '@/hooks/use-analysis'
import {
  isSyncActive,
  progressLabel,
  useConnectionStatus,
  useSyncNow,
  useSyncProgress
} from '@/hooks/use-sync'
import { errorMessage, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/pies', label: 'Pies', icon: PieChart },
  { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
  { to: '/settings', label: 'Settings', icon: Settings }
] as const

const titles: Record<string, string> = {
  '/': 'Overview',
  '/pies': 'Pies',
  '/chat': 'Chat',
  '/privacy': 'Privacy',
  '/settings': 'Settings'
}

/** The position open on the overview, read from the URL wherever the shell happens to be. */
function useSelectedTicker(): string | undefined {
  return useRouterState({
    select: (s) => {
      const ticker = (s.location.search as Record<string, unknown>).ticker
      return typeof ticker === 'string' ? ticker : undefined
    }
  })
}

/** The pie open on the Pies page, already validated by its route. */
function useSelectedPieId(): number | undefined {
  return useRouterState({
    select: (s) => {
      const id = (s.location.search as Record<string, unknown>).id
      return typeof id === 'number' ? id : undefined
    }
  })
}

function NavItem({
  to,
  label,
  icon: Icon,
  active
}: {
  to: (typeof nav)[number]['to']
  label: string
  icon: typeof LayoutDashboard
  active: boolean
}): React.JSX.Element {
  return (
    <Link
      to={to}
      search={to === '/' || to === '/pies' ? {} : undefined}
      data-active={active}
      className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground"
    >
      <Icon className="size-[15px]" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  )
}

function ChatItem({
  title,
  active,
  onOpen,
  onDelete
}: {
  title: string
  active: boolean
  onOpen: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      data-active={active}
      title={title}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className="group flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground"
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <button
        type="button"
        aria-label="Delete chat"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        className="shrink-0 rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function ChatsGroup(): React.JSX.Element {
  const chats = useChats()
  const activeId = useActiveChatId()
  const navigate = useNavigate()
  const newChat = useNewChat()
  const remove = useDeleteChat()
  const rows = chats.data ?? []

  return (
    <div className="mt-5 px-2">
      <div className="mb-1 flex h-6 items-center justify-between pl-2">
        <span className="eyebrow">Chats</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={newChat}
              aria-label="New chat"
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New chat</TooltipContent>
        </Tooltip>
      </div>
      {rows.length === 0 ? (
        <p className="px-2 py-1 text-[11px] text-muted-foreground/70">No chats yet.</p>
      ) : (
        <div className="space-y-px">
          {rows.map((chat) => (
            <ChatItem
              key={chat.id}
              title={chat.title}
              active={chat.id === activeId}
              onOpen={() => void navigate({ to: '/chat', search: { id: chat.id } })}
              onDelete={() => remove.mutate(chat.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Re-renders every `ms` so relative times ("3 min ago") stay true while the app sits open. */
function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

function relative(ms: number, now: number): string {
  const min = Math.round((now - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

/** A status dot with a soft halo, sized to share one icon column with the lock below it. */
function StatusDot({ tone }: { tone: 'ok' | 'error' | 'idle' }): React.JSX.Element {
  const color =
    tone === 'ok' ? 'bg-positive' : tone === 'error' ? 'bg-negative' : 'bg-muted-foreground/60'
  return (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      <span className={cn('absolute size-2.5 rounded-full opacity-25', color)} />
      <span className={cn('size-1.5 rounded-full', color)} />
    </span>
  )
}

/**
 * Sidebar footer: sync state with a sync button, and the privacy promise linking to the
 * Privacy page. One quiet card, both rows on the same icon column.
 */
function StatusCard(): React.JSX.Element {
  const status = useConnectionStatus()
  const progress = useSyncProgress()
  const sync = useSyncNow()
  const now = useNow()
  const syncing = status.data?.syncing || sync.isPending || isSyncActive(progress)
  const failed = !syncing && (progress?.phase === 'error' || sync.isError)
  const connected = status.data?.connected === true
  const lastSyncedAt = status.data?.lastSyncedAt ?? null

  const label = syncing
    ? (progressLabel(progress) ?? 'Syncing…')
    : failed
      ? 'Sync failed'
      : !connected
        ? 'Not connected'
        : lastSyncedAt
          ? `Synced ${relative(lastSyncedAt, now)}`
          : 'Waiting for first sync'
  const detail = failed
    ? (progressLabel(progress) ?? errorMessage(sync.error))
    : lastSyncedAt
      ? `Last synced ${formatDateTime(lastSyncedAt)}`
      : null

  return (
    <div className="overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-accent/40 text-[11px]">
      <div className="group flex h-8 items-center gap-2 pr-1 pl-2.5">
        {syncing ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <StatusDot tone={failed ? 'error' : connected ? 'ok' : 'idle'} />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                failed ? 'text-destructive' : 'text-foreground/85'
              )}
            >
              {label}
            </span>
          </TooltipTrigger>
          {detail ? (
            <TooltipContent side="top" className="max-w-64">
              {detail}
            </TooltipContent>
          ) : null}
        </Tooltip>
        {connected ? (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Sync now"
            disabled={syncing}
            onClick={() => sync.mutate()}
            className="text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 disabled:opacity-40"
          >
            <RefreshCw className={cn('size-3', syncing && 'animate-spin')} strokeWidth={2} />
          </Button>
        ) : null}
      </div>
      <Link
        to="/privacy"
        className="group flex h-8 items-center gap-2 border-t border-sidebar-border px-2.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <Lock className="size-3 text-positive" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-foreground/85 group-hover:text-foreground">Local only</span>
          <span className="text-muted-foreground/50"> · </span>
          No server
        </span>
        <ChevronRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
      </Link>
    </div>
  )
}

function HeaderSync(): React.JSX.Element {
  const status = useConnectionStatus()
  const progress = useSyncProgress()
  const sync = useSyncNow()
  const syncing = status.data?.syncing || sync.isPending || isSyncActive(progress)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => sync.mutate()}
          disabled={syncing || !status.data?.connected}
          aria-label="Sync now"
        >
          {syncing ? (
            <Loader2 className="size-[15px] animate-spin" />
          ) : (
            <RefreshCw className="size-[15px]" strokeWidth={1.75} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Sync now</TooltipContent>
    </Tooltip>
  )
}

export function AppShell(): React.JSX.Element {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const ticker = useSelectedTicker()
  const positions = usePositions()
  const pieId = useSelectedPieId()
  const pies = usePies(pathname === '/pies')
  const chats = useChats(pathname === '/chat')
  const activeChatId = useActiveChatId()

  const crumb =
    pathname === '/'
      ? ticker
        ? (positions.data?.find((p) => p.ticker === ticker)?.name ?? ticker)
        : null
      : pathname === '/pies'
        ? pieId !== undefined
          ? (pies.data?.pies.find((p) => p.id === pieId)?.name ?? null)
          : null
        : pathname === '/chat'
          ? (chats.data?.find((c) => c.id === activeChatId)?.title ?? null)
          : null
  const title = titles[pathname] ?? 'open-trading-212'

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* One title bar across the whole window: traffic lights on the left, name centred. */}
      <header className="drag-region relative flex h-12 shrink-0 items-center justify-center border-b border-sidebar-border bg-sidebar">
        <span className="pointer-events-none text-[13px] font-semibold tracking-tight text-foreground/90">
          open-trading-212
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="min-h-0 flex-1 overflow-y-auto pt-3">
            <nav className="space-y-px px-2">
              {nav.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  active={item.to === '/' ? pathname === '/' : pathname === item.to}
                />
              ))}
            </nav>
            <ChatsGroup />
          </div>
          <div className="shrink-0 p-2">
            <StatusCard />
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-5">
            <h1 className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium tracking-tight">
              <span className={cn('shrink-0', crumb && 'text-muted-foreground')}>{title}</span>
              {crumb ? (
                <>
                  <span className="shrink-0 text-muted-foreground/50">/</span>
                  <span className="truncate animate-fade-in">{crumb}</span>
                </>
              ) : null}
            </h1>
            <div className="ml-auto flex items-center gap-1">
              {pathname === '/' || pathname === '/pies' ? <HeaderSync /> : null}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
