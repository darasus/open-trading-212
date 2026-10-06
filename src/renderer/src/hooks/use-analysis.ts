import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ActivityQuery, AllocationBy } from '@shared/ipc'
import { queryKeys } from '@/hooks/use-sync'

export function useSummary() {
  return useQuery({
    queryKey: [...queryKeys.portfolio, 'summary'],
    queryFn: () => window.ot212.portfolio.summary()
  })
}

export function usePositions() {
  return useQuery({
    queryKey: [...queryKeys.portfolio, 'positions'],
    queryFn: () => window.ot212.portfolio.positions()
  })
}

export function useAllocation(by: AllocationBy) {
  return useQuery({
    queryKey: [...queryKeys.portfolio, 'allocation', by],
    queryFn: () => window.ot212.portfolio.allocation({ by })
  })
}

/** Every pie with its instruments. Pass `enabled: false` where only some routes need it. */
export function usePies(enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.portfolio, 'pies'],
    queryFn: () => window.ot212.pies.list(),
    enabled
  })
}

export function useValueHistory(days: number) {
  return useQuery({
    queryKey: [...queryKeys.analysis, 'value', days],
    queryFn: () => window.ot212.analysis.valueHistory({ days })
  })
}

export function useMonthlyFlows(months = 12) {
  return useQuery({
    queryKey: [...queryKeys.analysis, 'flows', months],
    queryFn: () => window.ot212.analysis.monthlyFlows({ months })
  })
}

export function useDividendPayers(months = 12, limit = 8) {
  return useQuery({
    queryKey: [...queryKeys.analysis, 'payers', months, limit],
    queryFn: () => window.ot212.analysis.dividendPayers({ months, limit })
  })
}

export function useInsights() {
  return useQuery({
    queryKey: [...queryKeys.analysis, 'insights'],
    queryFn: () => window.ot212.analysis.insights()
  })
}

/** One page of the activity table. Keeps the previous page on screen while the next loads. */
export function useActivityPage(
  query: Omit<ActivityQuery, 'limit' | 'offset'>,
  page: number,
  pageSize: number
) {
  return useQuery({
    queryKey: [...queryKeys.activity, query, page, pageSize],
    queryFn: () =>
      window.ot212.activity.list({ ...query, limit: pageSize, offset: page * pageSize }),
    placeholderData: keepPreviousData
  })
}

export function monthLabel(key: string, style: 'short' | 'long' = 'short'): string {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', {
    month: style,
    year: style === 'long' ? 'numeric' : '2-digit'
  }).format(new Date(year, month - 1, 1))
}
