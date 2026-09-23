import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'

export const chatsKey = ['chats'] as const

export function useChats(enabled = true) {
  const queryClient = useQueryClient()
  // Main writes chats (on send and when a reply ends), so follow its change events.
  useEffect(
    () =>
      window.ot212.chats.onChanged(() => {
        void queryClient.invalidateQueries({ queryKey: chatsKey })
      }),
    [queryClient]
  )
  return useQuery({
    queryKey: chatsKey,
    queryFn: () => window.ot212.chats.list(),
    enabled
  })
}

/** The chat currently open, read from the URL so the sidebar and the page agree on it. */
export function useActiveChatId(): string | undefined {
  return useRouterState({
    select: (s) => {
      if (s.location.pathname !== '/chat') return undefined
      const id = (s.location.search as Record<string, unknown>).id
      return typeof id === 'string' ? id : undefined
    }
  })
}

export function useNewChat(): () => void {
  const navigate = useNavigate()
  return () => {
    void navigate({ to: '/chat', search: { id: crypto.randomUUID() } })
  }
}

export function useDeleteChat() {
  const queryClient = useQueryClient()
  const activeId = useActiveChatId()
  const startNew = useNewChat()
  return useMutation({
    mutationFn: (id: string) => window.ot212.chats.delete(id),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: chatsKey })
      if (id === activeId) startNew()
    }
  })
}
