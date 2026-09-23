import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Cpu } from 'lucide-react'
import type { AiProviderId, AiProviderInfo, AiStatus } from '@shared/ipc'
import { ModelPicker } from '@/components/model-picker'
import { SettingsCard, SettingsHeader, SettingsRow } from '@/components/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'

const key = ['ai-status'] as const

export function AiSettingsCard(): React.JSX.Element {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: key, queryFn: () => window.ot212.ai.getStatus() })
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: key })

  const setProvider = useMutation({
    mutationFn: (provider: AiProviderId) => window.ot212.ai.setProvider(provider),
    onSuccess: refresh
  })
  const setLocalOnly = useMutation({
    mutationFn: (on: boolean) => window.ot212.settings.set('ai.localOnly', on ? 'true' : 'false'),
    onSuccess: refresh
  })

  const data = status.data
  const selected = data?.providers.find((p) => p.id === data.provider)

  return (
    <>
      <SettingsHeader
        title="AI"
        description="The chat runs its tools on this computer and sends only their results to the provider you pick, with your own key. Every answer shows exactly what was sent."
      />

      <SettingsCard title="Provider" description="Only the provider you pick can be reached.">
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-5">
          {(data?.providers ?? []).map((p) => (
            <ProviderTile
              key={p.id}
              provider={p}
              active={p.id === data?.provider}
              blocked={Boolean(data?.localOnly && !p.local)}
              onSelect={() => setProvider.mutate(p.id)}
            />
          ))}
        </div>
      </SettingsCard>

      {data && selected ? (
        <ProviderSettings key={selected.id} status={data} provider={selected} onChange={refresh} />
      ) : null}

      <SettingsCard title="Privacy">
        <SettingsRow
          label="Local-only mode"
          htmlFor="local-only"
          description={
            data?.localOnly
              ? 'On: cloud providers are blocked. Ollama keeps working because it never leaves this computer.'
              : 'Blocks every cloud AI call. The overview keeps working, and so does Ollama.'
          }
        >
          <Switch
            id="local-only"
            checked={data?.localOnly ?? false}
            onCheckedChange={(on) => setLocalOnly.mutate(on)}
          />
        </SettingsRow>
      </SettingsCard>
    </>
  )
}

function ProviderTile({
  provider,
  active,
  blocked,
  onSelect
}: {
  provider: AiProviderInfo
  active: boolean
  blocked: boolean
  onSelect: () => void
}): React.JSX.Element {
  const ready = provider.hasKey && provider.model
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-24 flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-foreground/40 bg-accent'
          : 'border-border/60 hover:border-border hover:bg-accent/50'
      )}
    >
      <span className="flex w-full items-center gap-1.5 text-[13px] font-medium">
        {provider.local ? <Cpu className="size-3.5 text-positive" strokeWidth={1.75} /> : null}
        {provider.name}
        {active ? <Check className="ml-auto size-3.5" /> : null}
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">{provider.description}</span>
      <span
        className={cn(
          'mt-auto pt-1 text-[10.5px] font-medium',
          blocked ? 'text-warning' : ready ? 'text-positive' : 'text-muted-foreground/70'
        )}
      >
        {blocked
          ? 'Blocked by local-only'
          : ready
            ? 'Ready'
            : provider.needsKey && !provider.hasKey
              ? 'Needs a key'
              : 'Needs a model'}
      </span>
    </button>
  )
}

function ProviderSettings({
  status,
  provider,
  onChange
}: {
  status: AiStatus
  provider: AiProviderInfo
  onChange: () => Promise<void>
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [url, setUrl] = useState(status.ollamaUrl)
  const [error, setError] = useState<string | null>(null)
  const reloadModels = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['ai-models', provider.id] })

  const setKey = useMutation({
    mutationFn: () => window.ot212.ai.setKey({ provider: provider.id, key: draft }),
    onSuccess: async () => {
      setDraft('')
      setError(null)
      await onChange()
      await reloadModels()
    },
    onError: (e) => setError(errorMessage(e))
  })
  const clearKey = useMutation({
    mutationFn: () => window.ot212.ai.clearKey(provider.id),
    onSuccess: onChange
  })
  const setModel = useMutation({
    mutationFn: (model: string) => window.ot212.ai.setModel({ provider: provider.id, model }),
    onSuccess: onChange,
    onError: (e) => setError(errorMessage(e))
  })
  const saveUrl = useMutation({
    mutationFn: () => window.ot212.ai.setOllamaUrl(url),
    onSuccess: async () => {
      setError(null)
      await onChange()
      await reloadModels()
    },
    onError: (e) => setError(errorMessage(e))
  })

  const openKeyPage = (): void => {
    if (provider.keyUrl) void window.ot212.app.openExternal(provider.keyUrl)
  }

  return (
    <SettingsCard title={provider.name}>
      {provider.needsKey ? (
        <SettingsRow
          label="API key"
          htmlFor={provider.hasKey ? undefined : 'ai-key'}
          description={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : provider.hasKey ? (
              `Stored in the OS keychain. Usage is billed to your own ${provider.name} account.`
            ) : (
              <>
                Create one at{' '}
                <button
                  type="button"
                  onClick={openKeyPage}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {provider.keyUrl?.replace(/^https:\/\//, '')}
                </button>
                . It stays in the OS keychain.
              </>
            )
          }
        >
          {provider.hasKey ? (
            <>
              <code className="rounded-md border border-border/60 bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                {provider.keyPlaceholder.replace('…', '')}••••••••••
              </code>
              <Button size="sm" variant="outline" onClick={() => clearKey.mutate()}>
                Remove
              </Button>
            </>
          ) : (
            <>
              <Input
                id="ai-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draft.trim()) setKey.mutate()
                }}
                placeholder={provider.keyPlaceholder}
                className="w-72 select-text font-mono"
              />
              <Button size="sm" onClick={() => setKey.mutate()} disabled={!draft.trim()}>
                Save
              </Button>
            </>
          )}
        </SettingsRow>
      ) : (
        <SettingsRow
          label="Server"
          htmlFor="ollama-url"
          description={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : (
              <>
                Install{' '}
                <button
                  type="button"
                  onClick={openKeyPage}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Ollama
                </button>{' '}
                and pull a model that supports tool calling. Must be on this computer.
              </>
            )
          }
        >
          <Input
            id="ollama-url"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveUrl.mutate()
            }}
            className="w-60 select-text font-mono"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveUrl.mutate()}
            disabled={url.trim() === status.ollamaUrl}
          >
            Save
          </Button>
        </SettingsRow>
      )}
      <SettingsRow
        label="Model"
        description={
          provider.model
            ? (provider.suggested.find((m) => m.id === provider.model)?.note ??
              'Used for every chat answer.')
            : provider.local
              ? 'Pick one of the models installed in Ollama.'
              : 'Pick a model. The list loads from your account.'
        }
      >
        <ModelPicker
          provider={provider.id}
          value={provider.model}
          suggested={provider.suggested}
          enabled={provider.hasKey}
          onChange={(model) => setModel.mutate(model)}
        />
      </SettingsRow>
    </SettingsCard>
  )
}
