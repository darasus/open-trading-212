// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityQuery, ActivityRow, OpenT212Api } from '@shared/ipc'
import { ActivityTable } from '@/components/overview/activity-table'
import { TooltipProvider } from '@/components/ui/tooltip'

const TOTAL = 60
const all: ActivityRow[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: `order:${i}`,
  kind: i % 3 === 0 ? 'dividend' : 'buy',
  ticker: i % 2 === 0 ? 'AAPL_US_EQ' : 'VUSAl_EQ',
  label: i % 2 === 0 ? 'Apple' : 'S&P 500 ETF',
  quantity: 1,
  price: 190,
  currency: 'USD',
  amountCents: -19_000,
  status: 'FILLED',
  at: Date.UTC(2026, 8, 20) - i * 86_400_000
}))

const list = vi.fn(async (q: ActivityQuery) => {
  const rows = all.filter(
    (r) =>
      (!q.kind || r.kind === q.kind) &&
      (!q.search || r.label.toLowerCase().includes(q.search.toLowerCase()))
  )
  return { rows: rows.slice(q.offset, q.offset + q.limit), total: rows.length }
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

function mount(onTicker = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ActivityTable currency="EUR" onTicker={onTicker} />
      </TooltipProvider>
    </QueryClientProvider>
  )
  return onTicker
}

beforeEach(() => {
  list.mockClear()
  ;(window as unknown as { ot212: Partial<OpenT212Api> }).ot212 = {
    activity: { list } as OpenT212Api['activity']
  }
})
afterEach(() => cleanup())

describe('ActivityTable', () => {
  it('pages through results', async () => {
    mount()
    await settle()
    expect(await screen.findByText('1–25 of 60', {}, { timeout: 5000 })).toBeTruthy()
    expect(await screen.findByText('Page 1 of 3', {}, { timeout: 5000 })).toBeTruthy()
    expect((screen.getByLabelText('Previous page') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Next page'))
    await settle()
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25, limit: 25 }))
    expect(await screen.findByText('26–50 of 60', {}, { timeout: 5000 })).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Last page'))
    await settle()
    expect(await screen.findByText('51–60 of 60', {}, { timeout: 5000 })).toBeTruthy()
    expect((screen.getByLabelText('Next page') as HTMLButtonElement).disabled).toBe(true)
  })

  it('goes back to the first page when a filter changes', async () => {
    mount()
    await settle()
    fireEvent.click(screen.getByLabelText('Next page'))
    await settle()
    fireEvent.click(screen.getByRole('radio', { name: 'Dividends' }))
    await settle()
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'dividend', offset: 0 }))
    expect(await screen.findByText('1–20 of 20', {}, { timeout: 5000 })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Filter by name or ticker'), {
      target: { value: 'apple' }
    })
    await settle()
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'dividend', search: 'apple', offset: 0 })
    )
  })

  it('changes the page size and opens a row', async () => {
    const onTicker = mount()
    await settle()
    fireEvent.click(screen.getByRole('radio', { name: '50' }))
    await settle()
    expect(await screen.findByText('1–50 of 60', {}, { timeout: 5000 })).toBeTruthy()
    expect(await screen.findByText('Page 1 of 2', {}, { timeout: 5000 })).toBeTruthy()

    fireEvent.click(screen.getAllByText('Apple')[0])
    expect(onTicker).toHaveBeenCalledWith('AAPL_US_EQ')
  })
})
