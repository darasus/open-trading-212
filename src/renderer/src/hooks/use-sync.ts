import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SyncProgress } from '@shared/ipc'
import { errorMessage } from '@/lib/format'

export const queryKeys = {
  status: ['t212-status'] as const,
  portfolio: ['portfolio'] as const,
  activity: ['activity'] as const,
  analysis: ['analysis'] as const
}

const STREAM_LABELS = { orders: 'Orders', dividends: 'Dividends', transactions: 'Cash' } as const

/** Subscribes to sync progress from the main process and refreshes data when a sync finishes. */
export function useSyncProgress(): SyncProgress | null {
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    return window.ot212.t212.onSyncProgress((next) => {
      setProgress(next)
      if (next.phase === 'done' || next.phase === 'error') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.status })
        void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
        void queryClient.invalidateQueries({ queryKey: queryKeys.activity })
        void queryClient.invalidateQueries({ queryKey: queryKeys.analysis })
      } else if (next.phase === 'history' && next.fetched > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
      }
    })
  }, [queryClient])

  return progress
}

export function useConnectionStatus() {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: () => window.ot212.t212.getStatus()
  })
}

export function useSyncNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.ot212.t212.sync(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.status }),
    onError: (error) => console.error(errorMessage(error))
  })
}

export function isSyncActive(progress: SyncProgress | null): boolean {
  return progress !== null && progress.phase !== 'done' && progress.phase !== 'error'
}

export function progressLabel(progress: SyncProgress | null): string | null {
  if (!progress) return null
  switch (progress.phase) {
    case 'account':
      return progress.message
    case 'history':
      return `${STREAM_LABELS[progress.stream]}: ${progress.message} (${progress.fetched})`
    case 'done':
      return null
    case 'error':
      return `Sync failed: ${progress.message}`
  }
}
