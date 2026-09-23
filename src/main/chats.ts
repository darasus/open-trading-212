import { desc, eq } from 'drizzle-orm'
import type { ChatSummary } from '../shared/ipc'
import { getDb } from './db'
import { chat } from './db/schema'

export function listChats(): ChatSummary[] {
  return getDb()
    .select({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    })
    .from(chat)
    .orderBy(desc(chat.updatedAt))
    .limit(200)
    .all()
}

export function getChat(id: string): { id: string; title: string; messages: unknown[] } | null {
  const row = getDb().select().from(chat).where(eq(chat.id, id)).get()
  return row ? { id: row.id, title: row.title, messages: row.messages } : null
}

type Listener = () => void
const listeners = new Set<Listener>()

/** Called after any chat is saved or deleted, so the UI can refresh its list. */
export function onChatsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function changed(): void {
  for (const listener of listeners) listener()
}

export function saveChat(input: { id: string; title: string; messages: unknown[] }): void {
  const now = Date.now()
  getDb()
    .insert(chat)
    .values({
      id: input.id,
      title: input.title,
      messages: input.messages,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: chat.id,
      set: { title: input.title, messages: input.messages, updatedAt: now }
    })
    .run()
  changed()
}

export function deleteChat(id: string): void {
  getDb().delete(chat).where(eq(chat.id, id)).run()
  changed()
}

export function deleteAllChats(): void {
  getDb().delete(chat).run()
  changed()
}
