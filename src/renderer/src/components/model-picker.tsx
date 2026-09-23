import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, RefreshCw } from 'lucide-react'
import type { ModelOption } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Searchable model picker. Shows the curated picks first, then the provider's live list
 * (loaded when opened), and accepts any typed model id so new models work on day one.
 */
export function ModelPicker({
  provider,
  value,
  suggested,
  enabled,
  onChange
}: {
  provider: string
  value: string | null
  suggested: ModelOption[]
  /** False until the provider has what it needs to list models (a key). */
  enabled: boolean
  onChange: (model: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const live = useQuery({
    queryKey: ['ai-models', provider],
    queryFn: () => window.ot212.ai.listModels(),
    enabled: open && enabled,
    staleTime: 5 * 60_000,
    retry: false
  })

  const known = new Map<string, ModelOption>()
  for (const m of [...suggested, ...(live.data ?? [])]) if (!known.has(m.id)) known.set(m.id, m)
  const current = value ? known.get(value) : undefined
  const typed = search.trim()
  const pick = (id: string): void => {
    onChange(id)
    setOpen(false)
    setSearch('')
  }
  const others = (live.data ?? []).filter((m) => !suggested.some((s) => s.id === m.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Model"
          className="w-72 justify-between font-normal"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {current?.name ?? value ?? 'Choose a model'}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput
            placeholder="Search or type a model id"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>{typed ? 'No match in the list.' : 'No models found.'}</CommandEmpty>
            {suggested.length > 0 ? (
              <CommandGroup heading="Suggested">
                {suggested.map((m) => (
                  <ModelItem key={m.id} model={m} selected={m.id === value} onPick={pick} />
                ))}
              </CommandGroup>
            ) : null}
            {others.length > 0 ? (
              <CommandGroup heading="Available with your account">
                {others.map((m) => (
                  <ModelItem key={m.id} model={m} selected={m.id === value} onPick={pick} />
                ))}
              </CommandGroup>
            ) : null}
            {typed && !known.has(typed) ? (
              <CommandGroup heading="Custom">
                <CommandItem value={`custom:${typed}`} onSelect={() => pick(typed)}>
                  Use <code className="font-mono text-xs">{typed}</code>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            {!enabled ? (
              <span>Add a key to load the full list.</span>
            ) : live.isFetching ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Loading models…
              </>
            ) : live.isError ? (
              <span className="text-destructive">{errorMessage(live.error)}</span>
            ) : (
              <span>{live.data ? `${live.data.length} models available` : ''}</span>
            )}
            {enabled ? (
              <button
                type="button"
                aria-label="Reload models"
                onClick={() => void live.refetch()}
                className="ml-auto rounded p-0.5 hover:text-foreground"
              >
                <RefreshCw className="size-3" />
              </button>
            ) : null}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ModelItem({
  model,
  selected,
  onPick
}: {
  model: ModelOption
  selected: boolean
  onPick: (id: string) => void
}): React.JSX.Element {
  return (
    <CommandItem value={`${model.name} ${model.id}`} onSelect={() => onPick(model.id)}>
      <Check className={cn('size-3.5', selected ? 'opacity-100' : 'opacity-0')} />
      <span className="min-w-0 flex-1 truncate">{model.name}</span>
      {model.note ? (
        <span className="truncate text-[10.5px] text-muted-foreground">{model.note}</span>
      ) : null}
    </CommandItem>
  )
}
