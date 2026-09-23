import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { FolderOpen, Plug, Sparkles, SlidersHorizontal } from 'lucide-react'
import { AiSettingsCard } from '@/components/ai-settings-card'
import { ConnectT212Card } from '@/components/connect-t212-card'
import { WipeEverythingButton } from '@/components/danger-zone'
import { Page } from '@/components/section'
import { SettingsCard, SettingsHeader, SettingsRow } from '@/components/settings'
import { UpdatesRow } from '@/components/updates-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SettingsTab } from '../router'

const TABS: { id: SettingsTab; label: string; icon: typeof Plug }[] = [
  { id: 'connection', label: 'Trading 212', icon: Plug },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'app', label: 'App', icon: SlidersHorizontal }
]

export function SettingsPage(): React.JSX.Element {
  const { tab = 'connection' } = useSearch({ from: '/settings' })
  const navigate = useNavigate()

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="w-52 shrink-0 space-y-px border-r border-border/60 px-2 pt-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-active={tab === t.id}
            onClick={() => void navigate({ to: '/settings', search: { tab: t.id } })}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-foreground"
          >
            <t.icon className="size-[15px]" strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </nav>
      <Page className="animate-fade-in" key={tab}>
        <div className={cn('w-full pb-4')}>
          {tab === 'connection' ? <ConnectT212Card /> : null}
          {tab === 'ai' ? <AiSettingsCard /> : null}
          {tab === 'app' ? <AppSettings /> : null}
        </div>
      </Page>
    </div>
  )
}

function AppSettings(): React.JSX.Element {
  const info = useQuery({ queryKey: ['app-info'], queryFn: () => window.ot212.app.getInfo() })
  return (
    <>
      <SettingsHeader
        title="App"
        description="Where your data lives, updates, and how to remove everything."
      />
      <SettingsCard title="Storage">
        <SettingsRow
          label="Database"
          description={
            <code className="font-mono text-[11px] break-all select-text">
              {info.data?.dbPath ?? '…'}
            </code>
          }
        >
          <Button variant="outline" size="sm" onClick={() => window.ot212.app.openDataDir()}>
            <FolderOpen className="size-3.5" />
            Reveal in folder
          </Button>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title="Updates">
        <UpdatesRow version={info.data?.version ?? ''} />
      </SettingsCard>
      <SettingsCard title="Danger zone" tone="destructive">
        <SettingsRow
          label="Wipe everything"
          description="Removes the Trading 212 key, the AI key, all synced data and every chat from this computer, then restarts the app. You will be asked to confirm."
        >
          <WipeEverythingButton hint={false} />
        </SettingsRow>
      </SettingsCard>
    </>
  )
}
