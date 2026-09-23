import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { is } from '@electron-toolkit/utils'
import type { AiProviderId, AiProviderInfo, ModelOption } from '../../shared/ipc'
import { getSecret, type SecretKey } from '../keychain'
import { getSetting } from '../settings'

/**
 * Every AI provider the chat can use. Cloud providers need the user's own key; Ollama runs
 * on this computer. Only the selected provider's host is on the network allow-list (see
 * network.ts), and model lists are fetched live so they never go stale.
 */

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const DEFAULT_PROVIDER: AiProviderId = 'anthropic'

type ProviderDef = {
  id: AiProviderId
  name: string
  description: string
  local: boolean
  secret: SecretKey | null
  /** Development only: read this environment variable when no key is stored. */
  devEnv: string | null
  keyPlaceholder: string
  keyUrl: string | null
  /** Hosts this provider talks to. Ollama's comes from its configured URL instead. */
  hosts: string[]
  suggested: ModelOption[]
  defaultModel: string | null
  create: (config: { apiKey: string; baseUrl: string }, modelId: string) => LanguageModel
  listModels: (config: { apiKey: string; baseUrl: string }) => Promise<ModelOption[]>
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } })
  if (response.status === 401 || response.status === 403)
    throw new Error('The provider rejected the API key.')
  if (!response.ok) throw new Error(`Could not load models (${response.status}).`)
  return (await response.json()) as T
}

const byName = (a: ModelOption, b: ModelOption): number => a.name.localeCompare(b.name)

/** OpenAI's list includes embeddings, audio and image models the chat cannot use. */
const OPENAI_NON_CHAT =
  /(embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|computer-use|codex|instruct|babbage|davinci)/

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models, with visible reasoning.',
    local: false,
    secret: 'ai.key.anthropic',
    devEnv: 'ANTHROPIC_API_KEY',
    keyPlaceholder: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com',
    hosts: ['api.anthropic.com'],
    suggested: [
      { id: 'claude-opus-5', name: 'Claude Opus 5', note: 'Best reasoning' },
      {
        id: 'claude-fable-5-1',
        name: 'Claude Fable 5.1',
        note: 'Most capable, slower and pricier'
      },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', note: 'Fast and capable' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', note: 'Cheapest' }
    ],
    defaultModel: 'claude-opus-5',
    create: ({ apiKey }, modelId) => createAnthropic({ apiKey })(modelId),
    listModels: async ({ apiKey }) => {
      const body = await getJson<{ data?: { id: string; display_name?: string }[] }>(
        'https://api.anthropic.com/v1/models?limit=100',
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      )
      // Newest first, as the API returns them.
      return (body.data ?? []).map((m) => ({ id: m.id, name: m.display_name ?? m.id }))
    }
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT and o-series models.',
    local: false,
    secret: 'ai.key.openai',
    devEnv: 'OPENAI_API_KEY',
    keyPlaceholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    hosts: ['api.openai.com'],
    suggested: [],
    defaultModel: null,
    create: ({ apiKey }, modelId) => createOpenAI({ apiKey })(modelId),
    listModels: async ({ apiKey }) => {
      const body = await getJson<{ data?: { id: string }[] }>('https://api.openai.com/v1/models', {
        Authorization: `Bearer ${apiKey}`
      })
      return (body.data ?? [])
        .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !OPENAI_NON_CHAT.test(m.id))
        .map((m) => ({ id: m.id, name: m.id }))
        .sort(byName)
    }
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini models.',
    local: false,
    secret: 'ai.key.google',
    devEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    keyPlaceholder: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    hosts: ['generativelanguage.googleapis.com'],
    suggested: [],
    defaultModel: null,
    create: ({ apiKey }, modelId) => createGoogle({ apiKey })(modelId),
    listModels: async ({ apiKey }) => {
      const body = await getJson<{
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
      }>('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
        'x-goog-api-key': apiKey
      })
      return (body.models ?? [])
        .filter(
          (m) =>
            m.name.includes('gemini') &&
            (m.supportedGenerationMethods ?? []).includes('generateContent')
        )
        .map((m) => {
          const id = m.name.replace(/^models\//, '')
          return { id, name: m.displayName ?? id, note: m.displayName ? id : undefined }
        })
        .sort(byName)
    }
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Hundreds of models from many labs with one key.',
    local: false,
    secret: 'ai.key.openrouter',
    devEnv: 'OPENROUTER_API_KEY',
    keyPlaceholder: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/keys',
    hosts: ['openrouter.ai'],
    suggested: [],
    defaultModel: null,
    create: ({ apiKey }, modelId) =>
      createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey
      })(modelId),
    listModels: async () => {
      const body = await getJson<{
        data?: { id: string; name?: string; supported_parameters?: string[] }[]
      }>('https://openrouter.ai/api/v1/models')
      // The chat needs tool calling; models without it could not look at the data.
      return (body.data ?? [])
        .filter((m) => (m.supported_parameters ?? []).includes('tools'))
        .map((m) => ({ id: m.id, name: m.name ?? m.id, note: m.id }))
        .sort(byName)
    }
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Models running on this computer. Nothing leaves the machine.',
    local: true,
    secret: null,
    devEnv: null,
    keyPlaceholder: '',
    keyUrl: 'https://ollama.com',
    hosts: [],
    suggested: [],
    defaultModel: null,
    create: ({ baseUrl }, modelId) =>
      createOpenAICompatible({ name: 'ollama', baseURL: `${baseUrl}/v1` })(modelId),
    listModels: async ({ baseUrl }) => {
      const body = await getJson<{ models?: { name: string }[] }>(`${baseUrl}/api/tags`)
      return (body.models ?? []).map((m) => ({ id: m.name, name: m.name })).sort(byName)
    }
  }
]

export function isProviderId(value: unknown): value is AiProviderId {
  return PROVIDERS.some((p) => p.id === value)
}

export function providerDef(id: AiProviderId): ProviderDef {
  return PROVIDERS.find((p) => p.id === id)!
}

export function selectedProvider(): AiProviderId {
  const stored = getSetting('ai.provider')
  return isProviderId(stored) ? stored : DEFAULT_PROVIDER
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Normalises an Ollama URL, refusing anything that is not on this computer. */
export function parseOllamaUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Enter a URL like http://localhost:11434')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('The Ollama URL must start with http:// or https://')
  if (!LOOPBACK.has(url.hostname))
    throw new Error('Ollama must run on this computer (localhost, 127.0.0.1 or [::1]).')
  return url.origin
}

export function ollamaUrl(): string {
  const stored = getSetting('ai.ollamaUrl')
  try {
    return stored ? parseOllamaUrl(stored) : DEFAULT_OLLAMA_URL
  } catch {
    return DEFAULT_OLLAMA_URL
  }
}

export function providerKey(id: AiProviderId): string | null {
  const def = providerDef(id)
  if (!def.secret) return null
  const stored = getSecret(def.secret) ?? (id === 'anthropic' ? getSecret('ai.apiKey') : null)
  // In development only, fall back to the shell's environment so the chat can be tried
  // without pasting a key. Packaged builds never read the environment.
  return stored ?? (is.dev && def.devEnv ? process.env[def.devEnv] || null : null)
}

export function providerModel(id: AiProviderId): string | null {
  return (
    getSetting(`ai.model.${id}`) ??
    (id === 'anthropic' ? getSetting('ai.model') : null) ??
    providerDef(id).defaultModel
  )
}

/** Hosts the selected provider may reach. Ollama's is its configured local origin. */
export function selectedProviderHosts(): string[] {
  const id = selectedProvider()
  return id === 'ollama' ? [ollamaUrl()] : providerDef(id).hosts
}

export function providerInfo(): AiProviderInfo[] {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    local: p.local,
    needsKey: p.secret !== null,
    hasKey: p.secret === null || providerKey(p.id) !== null,
    keyPlaceholder: p.keyPlaceholder,
    keyUrl: p.keyUrl,
    suggested: p.suggested,
    model: providerModel(p.id)
  }))
}

function configFor(id: AiProviderId): { apiKey: string; baseUrl: string } {
  return { apiKey: providerKey(id) ?? '', baseUrl: ollamaUrl() }
}

/** The model the chat should use, or an explanation of what is missing. */
export function resolveChatModel():
  | { ok: true; provider: AiProviderId; modelId: string; model: LanguageModel }
  | { ok: false; reason: 'local-only' | 'no-key' | 'no-model'; message: string } {
  const id = selectedProvider()
  const def = providerDef(id)
  if (!def.local && getSetting('ai.localOnly') === 'true')
    return {
      ok: false,
      reason: 'local-only',
      message: 'Local-only mode is on. Turn it off, or switch to Ollama, to use the chat.'
    }
  if (def.secret && !providerKey(id))
    return { ok: false, reason: 'no-key', message: `Add a ${def.name} API key in Settings first.` }
  const modelId = providerModel(id)
  if (!modelId)
    return { ok: false, reason: 'no-model', message: `Pick a ${def.name} model in Settings.` }
  return { ok: true, provider: id, modelId, model: def.create(configFor(id), modelId) }
}

export async function listSelectedModels(): Promise<ModelOption[]> {
  const id = selectedProvider()
  const def = providerDef(id)
  if (def.secret && !providerKey(id)) throw new Error(`Add a ${def.name} API key first.`)
  return def.listModels(configFor(id))
}
