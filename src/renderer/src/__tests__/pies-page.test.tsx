// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OpenT212Api, PieRow, PiesState } from '@shared/ipc'
import { TooltipProvider } from '@/components/ui/tooltip'

const pie: PieRow = {
  id: 7,
  name: 'Dividend growth',
  valueCents: 110_055,
  investedCents: 100_000,
  resultCents: 10_055,
  returnPct: 0.1006,
  cashCents: 250,
  dividendsGainedCents: 321,
  dividendsReinvestedCents: 300,
  dividendsInCashCents: 21,
  dividendCashAction: 'REINVEST',
  goalCents: 500_000,
  progress: 0.22,
  goalStatus: 'BEHIND',
  initialInvestmentCents: null,
  createdAt: Date.UTC(2025, 2, 1),
  endAt: Date.UTC(2030, 0, 1),
  publicUrl: null,
  instruments: [
    {
      ticker: 'VUSAl_EQ',
      name: 'Vanguard S&P 500',
      instrumentCurrency: 'GBX',
      quantity: 3.5,
      valueCents: 60_530,
      investedCents: 55_000,
      resultCents: 5_530,
      returnPct: 0.1,
      targetShare: 0.6,
      currentShare: 0.52,
      issues: [{ name: 'MAX_POSITION_SIZE_REACHED', severity: 'REVERSIBLE' }]
    }
  ]
}

let piesState: PiesState = { currency: 'EUR', pies: [pie], syncedAt: Date.now(), error: null }

const api = {
  t212: {
    getStatus: async () => ({
      connected: true,
      environment: 'live',
      accountId: 1,
      currency: 'EUR',
      connectedAt: 1,
      lastSyncedAt: Date.now(),
      syncing: false
    }),
    onSyncProgress: () => () => undefined
  },
  portfolio: { summary: async () => null, positions: async () => [] },
  analysis: {
    valueHistory: async () => [],
    monthlyFlows: async () => [],
    insights: async () => []
  },
  activity: { list: async () => ({ rows: [], total: 0 }) },
  pies: { list: async () => piesState },
  chats: { list: async () => [], onChanged: () => () => undefined }
} as unknown as OpenT212Api

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)))

beforeAll(() => {
  ;(window as unknown as { ot212: OpenT212Api }).ot212 = api
})
afterEach(() => cleanup())

/** Mounts the app, then navigates: the router is shared across tests, so it must be mounted first. */
async function renderAt(search: { id?: number }) {
  const { router } = await import('../router')
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  )
  await settle()
  await act(() => router.navigate({ to: '/pies', search }))
  await settle()
  return router
}

describe('pies page', () => {
  it('lists pies, opens one, and goes back with Escape', async () => {
    const errors = vi.spyOn(console, 'error')
    piesState = { currency: 'EUR', pies: [pie], syncedAt: Date.now(), error: null }
    const router = await renderAt({})

    const row = await screen.findByRole('button', { name: /Dividend growth/ }, { timeout: 5000 })
    expect(screen.getByText('In pies')).toBeTruthy()
    expect(screen.getByText('Behind')).toBeTruthy()

    fireEvent.click(row)
    await settle()
    expect(router.state.location.search).toEqual({ id: 7 })
    expect(await screen.findByText('Vanguard S&P 500')).toBeTruthy()
    expect(screen.getByText('Max position size reached')).toBeTruthy()
    expect(screen.getByText('Reinvested in the pie')).toBeTruthy()
    // 52% against a 60% target.
    expect(screen.getByText('−8.0 pp')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    await settle()
    expect(router.state.location.search).toEqual({})
    expect(errors).not.toHaveBeenCalled()
  })

  it('opens a holding on the overview', async () => {
    piesState = { currency: 'EUR', pies: [pie], syncedAt: Date.now(), error: null }
    const router = await renderAt({ id: 7 })
    fireEvent.click(await screen.findByText('Vanguard S&P 500', {}, { timeout: 5000 }))
    await settle()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toMatchObject({ ticker: 'VUSAl_EQ' })
  })

  it('explains a key without the pies permission', async () => {
    piesState = {
      currency: 'EUR',
      pies: [],
      syncedAt: null,
      error: 'The API key is missing the "pies:read" permission.'
    }
    await renderAt({})
    expect(
      await screen.findByText('Pies could not be read from Trading 212', {}, { timeout: 5000 })
    ).toBeTruthy()
    expect(screen.getByText(/missing the "pies:read" permission/)).toBeTruthy()
  })
})
