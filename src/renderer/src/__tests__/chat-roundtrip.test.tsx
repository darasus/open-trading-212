// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type { ChatEvent, OpenT212Api } from '@shared/ipc'
import { useThreadChat } from '@/hooks/use-thread-chat'
import { abortChat, attachChat, isChatRunning, streamChat } from '../../../main/ai/chat'
import { getChat } from '../../../main/chats'
import { resetDb, teardownDb } from '../../../main/__tests__/helpers'

/**
 * The real chat hook (useChat + IPC transport), wired to the real main-process chat module
 * through a fake preload bridge, under StrictMode like the dev app. Reproduces leaving a
 * chat mid-reply and coming back.
 */

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 }
}

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

let model: ReturnType<typeof manualModel>

/** The preload bridge, calling straight into main like ipcMain handlers would. */
function installBridge(): void {
  const listeners = new Set<(payload: { requestId: string; event: ChatEvent }) => void>()
  const sender =
    (requestId: string) =>
    (event: ChatEvent): void => {
      // IPC delivery is asynchronous.
      queueMicrotask(() => listeners.forEach((l) => l({ requestId, event })))
    }
  const chat: OpenT212Api['chat'] = {
    start: async ({ requestId, chatId, messages }) =>
      streamChat(
        requestId,
        chatId,
        messages as UIMessage[],
        sender(requestId),
        model.model as never
      ),
    attach: async ({ requestId, chatId }) => attachChat(requestId, chatId, sender(requestId)),
    abort: async (requestId) => abortChat(requestId),
    onEvent: (requestId, listener) => {
      const l = (p: { requestId: string; event: ChatEvent }): void => {
        if (p.requestId === requestId) listener(p.event)
      }
      listeners.add(l)
      return () => listeners.delete(l)
    }
  }
  ;(window as unknown as { ot212: Partial<OpenT212Api> }).ot212 = { chat }
}

type Probe = {
  messages: UIMessage[]
  status: string
  send: (text: string) => void
  stop: () => void
}
let latest: Probe | null = null
const report = (probe: Probe): void => {
  latest = probe
}

function Thread({
  chatId,
  initial,
  onRender
}: {
  chatId: string
  initial: UIMessage[]
  onRender: (probe: Probe) => void
}): null {
  const { messages, status, sendMessage, stop } = useThreadChat(chatId, initial)
  onRender({
    messages,
    status,
    send: (text) => void sendMessage({ text }),
    stop: () => void stop()
  })
  return null
}

function show(chatId: string) {
  const initial = (getChat(chatId)?.messages as UIMessage[] | undefined) ?? []
  return (
    <StrictMode>
      <Thread key={chatId} chatId={chatId} initial={initial} onRender={report} />
    </StrictMode>
  )
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))
const textOf = (messages: UIMessage[]) =>
  (messages.at(-1)?.parts ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('')

beforeEach(() => {
  resetDb()
  model = manualModel()
  installBridge()
})
afterEach(() => cleanup())
afterAll(() => teardownDb())

describe('leaving a chat mid-reply', () => {
  it('keeps generating, keeps the transcript, and resumes when you come back', async () => {
    const view = render(show('A'))
    await settle()
    act(() => latest!.send('How is my portfolio doing?'))
    await settle()
    model.say('Up 12% ')
    await settle()
    expect(textOf(latest!.messages)).toBe('Up 12% ')

    // Switch to another chat while the reply is still streaming.
    view.rerender(show('B'))
    await settle()
    expect(isChatRunning('A')).toBe(true)
    model.say('so far ')
    await settle()

    // The question was saved; come back to A while it is still going.
    expect(getChat('A')?.messages).toHaveLength(1)
    view.rerender(show('A'))
    await settle()
    expect(isChatRunning('A')).toBe(true)
    expect(textOf(latest!.messages)).toBe('Up 12% so far ')

    model.say('this year.')
    model.finish()
    await settle()
    expect(latest!.status).toBe('ready')
    expect(textOf(latest!.messages)).toBe('Up 12% so far this year.')
    expect(textOf(getChat('A')!.messages as UIMessage[])).toBe('Up 12% so far this year.')
  })

  it('shows the finished reply when you come back after it ended', async () => {
    const view = render(show('A'))
    await settle()
    act(() => latest!.send('Dividends?'))
    await settle()
    model.say('€690 in 12 months.')
    await settle()
    view.rerender(show('B'))
    await settle()
    model.finish()
    await settle()

    view.rerender(show('A'))
    await settle()
    expect(latest!.messages).toHaveLength(2)
    expect(textOf(latest!.messages)).toBe('€690 in 12 months.')
  })

  it('still stops the reply on Stop, both fresh and after coming back', async () => {
    const view = render(show('A'))
    await settle()
    act(() => latest!.send('First'))
    await settle()
    model.say('Partial')
    await settle()
    act(() => latest!.stop())
    await settle()
    expect(isChatRunning('A')).toBe(false)
    expect(textOf(getChat('A')!.messages as UIMessage[])).toBe('Partial')

    model = manualModel()
    act(() => latest!.send('Second'))
    await settle()
    model.say('Also partial')
    await settle()
    view.rerender(show('B'))
    await settle()
    view.rerender(show('A'))
    await settle()
    expect(isChatRunning('A')).toBe(true)
    act(() => latest!.stop())
    await settle()
    expect(isChatRunning('A')).toBe(false)
    expect(getChat('A')!.messages).toHaveLength(4)
    expect(textOf(getChat('A')!.messages as UIMessage[])).toBe('Also partial')
  })
})
