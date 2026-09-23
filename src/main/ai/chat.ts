import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type LanguageModel,
  type UIMessage
} from 'ai'
import type { AiProviderId, ChatEvent } from '../../shared/ipc'
import { saveChat } from '../chats'
import { portfolioSummary } from '../analysis'
import { getContext } from '../t212/api'
import { resolveChatModel } from './providers'
import { tools } from './tools'

/**
 * A reply being written. It lives here, not in the window, so leaving the chat page does
 * not lose it: every chunk is buffered, and a page that comes back re-attaches with
 * `attachChat`, gets the buffer replayed and then follows along live.
 */
type Turn = {
  controller: AbortController
  chunks: unknown[]
  subscribers: Map<string, (event: ChatEvent) => void>
}

const turns = new Map<string, Turn>()
const requestChats = new Map<string, string>()

export function titleFrom(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  const text = first?.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim()
  return text ? text.slice(0, 80) : 'New chat'
}

/**
 * Claude models from 4.6 on take adaptive thinking; ask for a readable summary so the chat
 * can show it. Haiku 4.5 predates adaptive thinking. Other providers use their defaults.
 */
function providerOptions(
  provider: AiProviderId,
  modelId: string
): Parameters<typeof streamText>[0]['providerOptions'] {
  if (provider !== 'anthropic' || modelId.startsWith('claude-haiku')) return {}
  return { anthropic: { thinking: { type: 'adaptive', display: 'summarized' } } }
}

export function isChatRunning(chatId: string): boolean {
  return turns.has(chatId)
}

function systemPrompt(): string {
  const context = getContext()
  const summary = portfolioSummary()
  const currency = summary?.currency ?? context?.currency ?? 'EUR'
  const today = new Date().toISOString().slice(0, 10)
  const account = context
    ? `Trading 212 ${context.environment === 'demo' ? 'practice (virtual money)' : 'real-money'} account${context.accountId ? ` ${context.accountId}` : ''}, currency ${currency}.`
    : 'No account connected yet.'
  return `You are open-trading-212, a portfolio analyst running locally on the user's computer over their Trading 212 data. Today is ${today}. ${account}

How to work:
- Use the tools to look at real numbers before answering. Never invent or estimate figures you did not retrieve.
- Money values from the tools are in ${currency} unless a field says otherwise. Instrument prices are in the instrument's own currency; GBX means pence.
- Say which period and which data an answer is based on. Value history only exists from the day the app was connected.
- Prefer the purpose-built tools; use run_readonly_sql only when they cannot express the question.
- Be concise. Use a short table when comparing several numbers.

Boundaries:
- You are read-only. You cannot place, change or cancel orders, and there is no code that could. If asked, say so and point the user to the Trading 212 app.
- You are not a licensed financial adviser. Explain the user's own data: performance, costs, concentration, currency exposure, income. Do not tell the user to buy or sell a specific security; when asked, lay out the relevant facts and trade-offs from their data and leave the decision to them.`
}

export function abortChat(requestId: string): void {
  const chatId = requestChats.get(requestId)
  if (chatId) turns.get(chatId)?.controller.abort()
}

/** Follow a reply that is still being written. False when nothing is running for the chat. */
export function attachChat(
  requestId: string,
  chatId: string,
  send: (event: ChatEvent) => void
): boolean {
  const turn = turns.get(chatId)
  if (!turn) return false
  for (const chunk of turn.chunks) send({ type: 'chunk', chunk })
  turn.subscribers.set(requestId, send)
  requestChats.set(requestId, chatId)
  return true
}

export async function streamChat(
  requestId: string,
  chatId: string,
  messages: UIMessage[],
  send: (event: ChatEvent) => void,
  model?: LanguageModel
): Promise<void> {
  if (turns.has(chatId)) throw new Error('A reply is still being written in this chat.')
  let provider: AiProviderId = 'anthropic'
  let modelId = 'test'
  if (!model) {
    const resolved = resolveChatModel()
    if (!resolved.ok) throw new Error(resolved.message)
    ;({ provider, modelId, model } = resolved)
  }

  // Save the question before anything streams, so it survives whatever happens next.
  const title = titleFrom(messages)
  saveChat({ id: chatId, title, messages })

  const turn: Turn = {
    controller: new AbortController(),
    chunks: [],
    subscribers: new Map([[requestId, send]])
  }
  turns.set(chatId, turn)
  requestChats.set(requestId, chatId)
  const emit = (event: ChatEvent): void => {
    if (event.type === 'chunk') turn.chunks.push(event.chunk)
    for (const subscriber of turn.subscribers.values()) subscriber(event)
  }

  try {
    const result = streamText({
      model,
      system: systemPrompt(),
      messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
      tools,
      stopWhen: stepCountIs(10),
      abortSignal: turn.controller.signal,
      providerOptions: providerOptions(provider, modelId)
    })

    for await (const chunk of result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId: () => crypto.randomUUID(),
      sendReasoning: true,
      onError: (error) => (error instanceof Error ? error.message : String(error)),
      // Called on success and on abort, with the question plus everything written so far.
      onEnd: ({ messages: final }) => saveChat({ id: chatId, title, messages: final })
    })) {
      emit({ type: 'chunk', chunk })
    }
    emit({ type: 'done' })
  } catch (error) {
    if (turn.controller.signal.aborted) emit({ type: 'done' })
    else emit({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  } finally {
    turns.delete(chatId)
    for (const id of turn.subscribers.keys()) requestChats.delete(id)
  }
}
