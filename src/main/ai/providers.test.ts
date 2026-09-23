import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertAllowedUrl, allowedHosts } from '../network'
import { setSecret } from '../keychain'
import { setSetting } from '../settings'
import { resetDb, teardownDb } from '../__tests__/helpers'
import {
  listSelectedModels,
  parseOllamaUrl,
  providerInfo,
  providerKey,
  providerModel,
  resolveChatModel
} from './providers'

const originalFetch = globalThis.fetch
beforeEach(() => resetDb())
afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})
afterAll(() => teardownDb())

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })

describe('network allow-list per provider', () => {
  it('only lets the selected cloud provider through', () => {
    expect(() => assertAllowedUrl('https://api.anthropic.com/v1/messages')).not.toThrow()
    expect(() => assertAllowedUrl('https://api.openai.com/v1/responses')).toThrow(
      /not the selected AI provider/
    )

    setSetting('ai.provider', 'openai')
    expect(() => assertAllowedUrl('https://api.openai.com/v1/responses')).not.toThrow()
    expect(() => assertAllowedUrl('https://api.anthropic.com/v1/messages')).toThrow(
      /not the selected AI provider/
    )
    expect(allowedHosts()).toContain('api.openai.com')
    expect(allowedHosts()).not.toContain('api.anthropic.com')
  })

  it('blocks cloud providers in local-only mode', () => {
    setSetting('ai.provider', 'google')
    setSetting('ai.localOnly', 'true')
    expect(() =>
      assertAllowedUrl('https://generativelanguage.googleapis.com/v1beta/models')
    ).toThrow(/local-only/)
  })

  it('allows only the configured local Ollama origin, even in local-only mode', () => {
    expect(() => assertAllowedUrl('http://localhost:11434/api/tags')).toThrow(/only https/)

    setSetting('ai.provider', 'ollama')
    setSetting('ai.localOnly', 'true')
    expect(() => assertAllowedUrl('http://localhost:11434/v1/chat/completions')).not.toThrow()
    expect(() => assertAllowedUrl('http://localhost:8080/')).toThrow(/only https/)
    expect(() => assertAllowedUrl('https://api.anthropic.com/v1/messages')).toThrow(
      /not the selected AI provider/
    )
    expect(allowedHosts()).toContain('http://localhost:11434')
  })
})

describe('parseOllamaUrl', () => {
  it('accepts loopback addresses and normalises to the origin', () => {
    expect(parseOllamaUrl(' http://localhost:11434/ ')).toBe('http://localhost:11434')
    expect(parseOllamaUrl('http://127.0.0.1:9000/v1')).toBe('http://127.0.0.1:9000')
    expect(parseOllamaUrl('http://[::1]:11434')).toBe('http://[::1]:11434')
  })

  it('refuses anything that is not on this computer', () => {
    expect(() => parseOllamaUrl('http://192.168.1.10:11434')).toThrow(/this computer/)
    expect(() => parseOllamaUrl('https://ollama.example.com')).toThrow(/this computer/)
    expect(() => parseOllamaUrl('ftp://localhost')).toThrow(/http/)
    expect(() => parseOllamaUrl('not a url')).toThrow(/like http/)
  })
})

describe('keys and models', () => {
  it('reads the Anthropic key and model saved before multiple providers existed', () => {
    setSecret('ai.apiKey', 'sk-ant-legacy-key-000000000')
    setSetting('ai.model', 'claude-sonnet-5')
    expect(providerKey('anthropic')).toBe('sk-ant-legacy-key-000000000')
    expect(providerModel('anthropic')).toBe('claude-sonnet-5')
    setSetting('ai.model.anthropic', 'claude-haiku-4-5')
    expect(providerModel('anthropic')).toBe('claude-haiku-4-5')
  })

  it('reports each provider, with Ollama needing no key', () => {
    setSecret('ai.key.openai', 'sk-openai-key-0000000000000')
    const info = Object.fromEntries(providerInfo().map((p) => [p.id, p]))
    expect(info.openai).toMatchObject({ hasKey: true, needsKey: true, model: null })
    expect(info.google).toMatchObject({ hasKey: false })
    expect(info.ollama).toMatchObject({ hasKey: true, needsKey: false, local: true })
    expect(info.anthropic.model).toBe('claude-opus-5')
  })

  it('explains what blocks the chat', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(resolveChatModel()).toMatchObject({ ok: false, reason: 'no-key' })

    setSecret('ai.key.anthropic', 'sk-ant-real-key-00000000000')
    expect(resolveChatModel()).toMatchObject({
      ok: true,
      provider: 'anthropic',
      modelId: 'claude-opus-5'
    })

    setSetting('ai.provider', 'ollama')
    expect(resolveChatModel()).toMatchObject({ ok: false, reason: 'no-model' })
    setSetting('ai.model.ollama', 'qwen3:8b')
    setSetting('ai.localOnly', 'true')
    expect(resolveChatModel()).toMatchObject({ ok: true, provider: 'ollama' })

    setSetting('ai.provider', 'openai')
    expect(resolveChatModel()).toMatchObject({ ok: false, reason: 'local-only' })
  })
})

describe('live model lists', () => {
  it('keeps only OpenAI chat models', async () => {
    setSetting('ai.provider', 'openai')
    setSecret('ai.key.openai', 'sk-openai-key-0000000000000')
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () =>
      json({
        data: [
          { id: 'gpt-5' },
          { id: 'text-embedding-3-large' },
          { id: 'o4-mini' },
          { id: 'gpt-realtime' },
          { id: 'dall-e-3' },
          { id: 'whisper-1' }
        ]
      })
    )
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch
    expect((await listSelectedModels()).map((m) => m.id)).toEqual(['gpt-5', 'o4-mini'])
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/models')
  })

  it('keeps Gemini models that generate content and strips the models/ prefix', async () => {
    setSetting('ai.provider', 'google')
    setSecret('ai.key.google', 'AIza-google-key-00000000000')
    globalThis.fetch = vi.fn(async () =>
      json({
        models: [
          {
            name: 'models/gemini-3-pro',
            displayName: 'Gemini 3 Pro',
            supportedGenerationMethods: ['generateContent']
          },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] }
        ]
      })
    ) as unknown as typeof globalThis.fetch
    expect(await listSelectedModels()).toEqual([
      { id: 'gemini-3-pro', name: 'Gemini 3 Pro', note: 'gemini-3-pro' }
    ])
  })

  it('keeps only OpenRouter models that can call tools', async () => {
    setSetting('ai.provider', 'openrouter')
    setSecret('ai.key.openrouter', 'sk-or-key-000000000000000000')
    globalThis.fetch = vi.fn(async () =>
      json({
        data: [
          {
            id: 'lab/tools-model',
            name: 'Tools Model',
            supported_parameters: ['tools', 'temperature']
          },
          { id: 'lab/plain-model', name: 'Plain Model', supported_parameters: ['temperature'] }
        ]
      })
    ) as unknown as typeof globalThis.fetch
    expect((await listSelectedModels()).map((m) => m.id)).toEqual(['lab/tools-model'])
  })

  it('lists local Ollama models from the configured URL', async () => {
    setSetting('ai.provider', 'ollama')
    setSetting('ai.ollamaUrl', 'http://127.0.0.1:9999')
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () =>
      json({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.3' }] })
    )
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch
    expect((await listSelectedModels()).map((m) => m.id)).toEqual(['llama3.3', 'qwen3:8b'])
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:9999/api/tags')
  })

  it('needs a key before listing a cloud provider, and reports a rejected key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    setSetting('ai.provider', 'openai')
    await expect(listSelectedModels()).rejects.toThrow(/Add a OpenAI API key first/)
    setSecret('ai.key.openai', 'sk-bad-key-0000000000000000')
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 401 })
    ) as unknown as typeof globalThis.fetch
    await expect(listSelectedModels()).rejects.toThrow(/rejected the API key/)
  })
})
