import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

/**
 * AI SDK transport that talks to the main process over IPC instead of HTTP.
 * The renderer never holds the provider key; main streams UIMessageChunks back
 * tagged with a request id so concurrent chats do not cross.
 *
 * Main owns the running reply and saves the thread itself, so the page can be left
 * mid-answer. `reconnectToStream` picks a still-running reply back up.
 */
export class IpcChatTransport implements ChatTransport<UIMessage> {
  async sendMessages({
    chatId,
    messages,
    abortSignal
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const requestId = crypto.randomUUID()
    // This signal only fires from the user's Stop, so it ends the reply in main.
    const { stream, fail } = openStream(requestId, abortSignal, () => {
      void window.ot212.chat.abort(requestId)
    })
    window.ot212.chat
      .start({ requestId, chatId, messages })
      .catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))))
    return stream
  }

  async reconnectToStream({
    chatId,
    abortSignal
  }: Parameters<
    ChatTransport<UIMessage>['reconnectToStream']
  >[0]): Promise<ReadableStream<UIMessageChunk> | null> {
    const requestId = crypto.randomUUID()
    // useChat cancels a resume that is superseded before it connects, e.g. when StrictMode
    // runs the resume effect twice. That must only drop this listener: the reply belongs to
    // main and keeps going. Once the stream is handed over, an abort is the user's Stop.
    let handedOver = false
    // Listen before attaching: main replays the buffered chunks as part of the attach call.
    const { stream, close } = openStream(requestId, abortSignal, () => {
      if (handedOver) void window.ot212.chat.abort(requestId)
    })
    const attached = await window.ot212.chat.attach({ requestId, chatId })
    if (!attached || abortSignal?.aborted) {
      close()
      return attached ? stream : null
    }
    handedOver = true
    return stream
  }
}

/**
 * A stream fed by chat events for one request id. Chunks that arrive before the caller
 * starts reading are queued by the ReadableStream itself.
 */
function openStream(
  requestId: string,
  abortSignal: AbortSignal | undefined,
  onAbort: () => void
): { stream: ReadableStream<UIMessageChunk>; fail: (error: Error) => void; close: () => void } {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>
  let closed = false
  const finish = (error?: Error): void => {
    if (closed) return
    closed = true
    unsubscribe()
    if (error) controller.error(error)
    else controller.close()
  }
  const stream = new ReadableStream<UIMessageChunk>({
    start(c) {
      controller = c
    }
  })
  const unsubscribe = window.ot212.chat.onEvent(requestId, (event) => {
    if (closed) return
    if (event.type === 'chunk') controller.enqueue(event.chunk as UIMessageChunk)
    else if (event.type === 'done') finish()
    else finish(new Error(event.message))
  })
  abortSignal?.addEventListener('abort', () => {
    onAbort()
    finish()
  })
  return { stream, fail: finish, close: () => finish() }
}
