import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type { ChatEvent } from '../../shared/ipc'
import { getChat } from '../chats'
import { resetDb, teardownDb } from '../__tests__/helpers'
import { abortChat, attachChat, isChatRunning, streamChat } from './chat'

beforeEach(() => resetDb())
afterAll(() => teardownDb())

const question: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is my portfolio doing?' }] }
]

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 }
}

/**
 * A model whose stream the test feeds by hand, so it can look at what main has saved
 * and attach or abort while the reply is still being written.
 */
function manualModel() {
  let push!: (part: unknown) => void
  let end!: () => void
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(controller) {
          push = (part) => controller.enqueue(part)
          end = () => controller.close()
          abortSignal?.addEventListener('abort', () =>
            controller.error(new DOMException('Aborted', 'AbortError'))
          )
          controller.enqueue({ type: 'stream-start', warnings: [] })
          controller.enqueue({ type: 'text-start', id: 't' })
        }
      })
    })
  } as never)
  return {
    model,
    say: (text: string) => push({ type: 'text-delta', id: 't', delta: text }),
    finish: () => {
      push({ type: 'text-end', id: 't' })
      push({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage })
      end()
    }
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

function collect() {
  const events: ChatEvent[] = []
  return { events, send: (event: ChatEvent) => events.push(event) }
}

function textOf(messages: unknown[] | undefined): string {
  const last = (messages ?? []).at(-1) as UIMessage | undefined
  return (last?.parts ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('')
}

describe('streamChat', () => {
  it('saves the question before streaming and the full thread when the reply ends', async () => {
    const m = manualModel()
    const { events, send } = collect()
    const run = streamChat('r1', 'chat-1', question, send, m.model as never)
    await tick()

    expect(getChat('chat-1')).toMatchObject({ title: 'How is my portfolio doing?' })
    expect(getChat('chat-1')?.messages).toHaveLength(1)
    expect(isChatRunning('chat-1')).toBe(true)

    m.say('Up 12% ')
    m.say('overall.')
    m.finish()
    await run

    const saved = getChat('chat-1')!
    expect(saved.messages).toHaveLength(2)
    expect((saved.messages[1] as UIMessage).role).toBe('assistant')
    expect(textOf(saved.messages)).toBe('Up 12% overall.')
    expect(events.at(-1)).toEqual({ type: 'done' })
    expect(isChatRunning('chat-1')).toBe(false)
  })

  it('lets a page that left and came back attach and replay what it missed', async () => {
    const m = manualModel()
    const first = collect()
    const run = streamChat('r1', 'chat-2', question, first.send, m.model as never)
    await tick()
    m.say('Hello ')
    await tick()

    const second = collect()
    expect(attachChat('r2', 'chat-2', second.send)).toBe(true)
    const replayed = second.events.length
    expect(replayed).toBeGreaterThan(0)
    expect(second.events).toEqual(first.events)

    m.say('again.')
    m.finish()
    await run
    expect(second.events.length).toBeGreaterThan(replayed)
    expect(second.events.at(-1)).toEqual({ type: 'done' })
    expect(attachChat('r3', 'chat-2', () => undefined)).toBe(false)
  })

  it('keeps the partial reply when stopped, including from an attached page', async () => {
    const m = manualModel()
    const run = streamChat('r1', 'chat-3', question, () => undefined, m.model as never)
    await tick()
    m.say('Partial answer')
    await tick()
    attachChat('r2', 'chat-3', () => undefined)
    abortChat('r2')
    await run

    const saved = getChat('chat-3')!
    expect(saved.messages).toHaveLength(2)
    expect(textOf(saved.messages)).toBe('Partial answer')
    expect(isChatRunning('chat-3')).toBe(false)
  })

  it('refuses a second turn while one is running in the same chat', async () => {
    const m = manualModel()
    const run = streamChat('r1', 'chat-4', question, () => undefined, m.model as never)
    await tick()
    await expect(
      streamChat('r2', 'chat-4', question, () => undefined, m.model as never)
    ).rejects.toThrow(/still being written/)
    m.finish()
    await run
  })
})
