import { useQuery } from '@tanstack/react-query'
import {
  AppWindow,
  ArrowUpRight,
  Ban,
  Code,
  Database,
  Download,
  Globe,
  HardDrive,
  KeyRound,
  Lock,
  MessageSquare,
  ScanEye,
  ServerOff,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  WifiOff
} from 'lucide-react'
import { WipeEverythingButton } from '@/components/danger-zone'
import { Page, Section } from '@/components/section'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Leaves = { tone: 'never' | 'scoped' | 'none'; text: string }

const STORED: { icon: typeof KeyRound; data: string; where: string; leaves: Leaves }[] = [
  {
    icon: KeyRound,
    data: 'Trading 212 API key and secret',
    where: 'OS keychain',
    leaves: { tone: 'scoped', text: 'Only to Trading 212' }
  },
  {
    icon: Database,
    data: 'Positions, orders, dividends, deposits',
    where: 'Local SQLite file',
    leaves: { tone: 'never', text: 'Never' }
  },
  {
    icon: MessageSquare,
    data: 'Chat history',
    where: 'Local SQLite file',
    leaves: { tone: 'never', text: 'Never' }
  },
  {
    icon: ScanEye,
    data: 'What the AI sees',
    where: 'Shown to you on every answer',
    leaves: { tone: 'scoped', text: 'Only that answer’s tool results, to your provider' }
  },
  {
    icon: Sparkles,
    data: 'AI provider key',
    where: 'OS keychain',
    leaves: { tone: 'scoped', text: 'Only to that provider' }
  },
  {
    icon: ServerOff,
    data: 'An open-trading-212 server',
    where: 'Does not exist',
    leaves: { tone: 'none', text: 'Nothing to send to' }
  }
]

const ENFORCED: { icon: typeof KeyRound; title: string; detail: string }[] = [
  {
    icon: Globe,
    title: 'Network allow-list',
    detail: 'Every request to a host not listed above is refused before it leaves the app.'
  },
  {
    icon: Ban,
    title: 'Read-only Trading 212 client',
    detail: 'It only sends GET requests. No code can place, edit or cancel an order.'
  },
  {
    icon: AppWindow,
    title: 'Sandboxed window',
    detail: 'The UI has no Node access and is blocked from the network entirely.'
  },
  {
    icon: ScanEye,
    title: 'Nothing hidden from you',
    detail: 'Each chat answer shows the exact data that was sent to the AI.'
  },
  {
    icon: WifiOff,
    title: 'Local-only mode',
    detail: 'Blocks every cloud AI call. The overview and Ollama keep working.'
  },
  {
    icon: Trash2,
    title: 'Wipe in one click',
    detail: 'Deletes the database, every keychain entry and all chats.'
  }
]

const LIMITS = [
  'The app is only as read-only as the key you give it. Create the key with read permissions only.',
  'Sync only happens while the app is open. Nothing runs for you in the cloud.',
  'Trading 212 has no value history, so earlier days on the chart are estimated from your trades.',
  'The AI explains your data. It is not a licensed adviser and does not tell you what to buy or sell.'
]

const HOST_GROUPS: { label: string; icon: typeof KeyRound; match: (host: string) => boolean }[] = [
  { label: 'Trading 212', icon: Database, match: (h) => h.endsWith('trading212.com') },
  {
    label: 'AI provider',
    icon: Sparkles,
    match: (h) =>
      !h.endsWith('trading212.com') &&
      !h.endsWith('github.com') &&
      !h.endsWith('githubusercontent.com')
  },
  {
    label: 'Updates',
    icon: Download,
    match: (h) => h.endsWith('github.com') || h.endsWith('githubusercontent.com')
  }
]

function PromiseCard({
  icon: Icon,
  title,
  detail
}: {
  icon: typeof KeyRound
  title: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="flex gap-3 rounded-lg border border-border/60 bg-accent/30 px-4 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-positive/10 text-positive">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  )
}

function LeavesBadge({ leaves }: { leaves: Leaves }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium',
        leaves.tone === 'never' && 'bg-positive/10 text-positive',
        leaves.tone === 'scoped' && 'bg-blue/10 text-blue',
        leaves.tone === 'none' && 'bg-accent text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          leaves.tone === 'never' && 'bg-positive',
          leaves.tone === 'scoped' && 'bg-blue',
          leaves.tone === 'none' && 'bg-muted-foreground/60'
        )}
      />
      {leaves.text}
    </span>
  )
}

export function PrivacyPage(): React.JSX.Element {
  const hosts = useQuery({
    queryKey: ['allowed-hosts'],
    queryFn: () => window.ot212.app.allowedHosts()
  })
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: () => window.ot212.ai.getStatus() })
  const localOnly = ai.data?.localOnly === true

  return (
    <Page>
      <div className="flex w-full flex-col gap-10 animate-fade-up">
        <header className="flex flex-col gap-5">
          <div>
            <h2 className="text-[22px] leading-tight font-semibold tracking-tight">
              Your data stays on this computer.
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              open-trading-212 has no server. It talks to Trading 212 and, if you use the chat, to
              the one AI provider you pick. Pick Ollama and even the chat stays on this computer.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <PromiseCard
              icon={ServerOff}
              title="No server"
              detail="There is no account, no backend and no analytics."
            />
            <PromiseCard
              icon={Lock}
              title="Keys in your keychain"
              detail="Encrypted by macOS Keychain or Windows DPAPI."
            />
            <PromiseCard
              icon={HardDrive}
              title="Data in one local file"
              detail="Portfolio and chats live in a SQLite file you can delete."
            />
          </div>
        </header>

        <Section title="What is stored where" bodyClassName="pt-0">
          <div className="text-xs">
            {STORED.map((r) => (
              <div
                key={r.data}
                className="grid grid-cols-[minmax(220px,1.3fr)_minmax(160px,1fr)_minmax(0,1.4fr)] items-center gap-4 border-b border-border/40 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-2.5 font-medium">
                  <r.icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="truncate">{r.data}</span>
                </span>
                <span className="text-muted-foreground">{r.where}</span>
                <span>
                  <LeavesBadge leaves={r.leaves} />
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Where the app can connect"
          subtitle="Every other host is refused before the request leaves"
          bodyClassName="pt-4"
        >
          <div className="grid gap-3 lg:grid-cols-3">
            {HOST_GROUPS.map((g) => {
              const list = (hosts.data ?? []).filter(g.match)
              // A local provider (Ollama) is listed as its loopback origin and is never blocked.
              const blocked =
                g.label === 'AI provider' && localOnly && !list.some((h) => h.startsWith('http'))
              return (
                <div key={g.label} className="rounded-lg border border-border/60 px-4 py-3">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    <g.icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                    {g.label}
                    {g.label === 'AI provider' && !list.some((h) => h.startsWith('http://')) ? (
                      <span
                        className={cn(
                          'ml-auto rounded px-1.5 py-0.5 text-[10.5px] font-medium',
                          blocked ? 'bg-warning/10 text-warning' : 'bg-accent text-muted-foreground'
                        )}
                      >
                        {blocked ? 'Blocked: local-only' : 'Off in local-only mode'}
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {list.map((host) => (
                      <li
                        key={host}
                        className={cn(
                          'rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/85 select-text',
                          blocked && 'text-muted-foreground line-through'
                        )}
                      >
                        {host}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Enforced in code" subtitle="Not just promised" bodyClassName="pt-4">
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
            {ENFORCED.map((e) => (
              <div key={e.title} className="flex gap-3">
                <e.icon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{e.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {e.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <section className="rounded-lg border border-warning/20 bg-warning/[0.04] px-5 py-4">
          <h2 className="flex items-center gap-2 text-[13px] font-medium">
            <TriangleAlert className="size-4 text-warning" strokeWidth={1.75} />
            Honest limits
          </h2>
          <ul className="mt-2.5 grid gap-x-8 gap-y-1.5 text-xs leading-relaxed text-muted-foreground lg:grid-cols-2">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-2.5">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {l}
              </li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-wrap items-center gap-4 border-t border-border/60 pt-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <ShieldCheck className="size-4 text-positive" strokeWidth={1.75} />
              Check it yourself
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The code is open source. Watch outbound connections with Little Snitch or lsof, or
              remove every trace of the app from this computer.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.ot212.app.openExternal('https://github.com/darasus/open-trading-212')
            }
          >
            <Code className="size-4" />
            Source on GitHub
            <ArrowUpRight className="size-3.5 opacity-60" />
          </Button>
          <WipeEverythingButton hint={false} />
        </footer>
      </div>
    </Page>
  )
}
