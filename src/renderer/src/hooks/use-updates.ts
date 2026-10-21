import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpdateState } from '@shared/ipc'

const updateKey = ['update-state'] as const

/** The updater's state, kept current by the main process as checks and downloads progress. */
export function useUpdateState(): UpdateState | undefined {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: updateKey,
    queryFn: () => window.ot212.app.getUpdateState(),
    staleTime: Infinity
  })

  useEffect(() => {
    return window.ot212.app.onUpdateState((state) => queryClient.setQueryData(updateKey, state))
  }, [queryClient])

  return query.data
}

/** A manual check from Settings. The state itself arrives through `useUpdateState`. */
export function useCheckForUpdates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.ot212.app.checkForUpdates(),
    onSuccess: (state) => queryClient.setQueryData(updateKey, state)
  })
}

export function useAutomaticUpdates() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['setting', 'updates.auto'] as const,
    queryFn: async () => (await window.ot212.settings.get('updates.auto')) !== 'false'
  })
  const set = useMutation({
    mutationFn: (on: boolean) => window.ot212.settings.set('updates.auto', on ? 'true' : 'false'),
    onSuccess: (_result, on) => queryClient.setQueryData(['setting', 'updates.auto'], on)
  })
  return { enabled: query.data ?? true, set: (on: boolean) => set.mutate(on) }
}

export function installUpdate(): void {
  void window.ot212.app.installUpdate()
}
