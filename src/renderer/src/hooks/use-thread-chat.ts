import { useMemo } from 'react'
import { Chat, useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { IpcChatTransport } from '@/lib/ipc-chat-transport'

/**
 * useChat for one saved thread, with the reply owned by the main process.
 *
 * The Chat is created here and handed to useChat, rather than letting useChat create it:
 * useChat stops chats it created when the component unmounts, and a stop aborts the reply
 * in main. Leaving the page must not do that, only the Stop button should. `resume`
 * re-attaches to a reply that is still being written when the thread is opened again.
 */
export function useThreadChat(chatId: string, initialMessages: UIMessage[]) {
  const chat = useMemo(
    () => new Chat({ id: chatId, messages: initialMessages, transport: new IpcChatTransport() }),
    // The thread is keyed by id; initial messages only seed a new Chat.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [chatId]
  )
  return useChat({ chat, resume: true })
}
