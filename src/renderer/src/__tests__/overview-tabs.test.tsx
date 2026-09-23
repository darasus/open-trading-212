// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OpenT212Api, PositionRow } from '@shared/ipc'
import { TooltipProvider } from '@/components/ui/tooltip'

const position: PositionRow = {
  ticker: 'AAPL_US_EQ',
  name: 'Apple',
  isin: 'US0378331005',
  instrumentCurrency: 'USD',
  type: 'STOCK',
  quantity: 10,
  averagePrice: 150,
  currentPrice: 190,
  valueCents: 170_000,
  costCents: 140_000,
  unrealizedCents: 30_000,
  fxCents: -2_000,
  returnPct: 0.214,
  weight: 1,
  openedAt: Date.UTC(2025, 0, 2)
}

const month = (m: string, dividendsCents: number) => ({
  month: m,
  depositsCents: 0,
  withdrawalsCents: 0,
  buysCents: 0,
  sellsCents: 0,
  dividendsCents,
  feesCents: 0
})

const api = {
  app: {
    getInfo: async () => ({ version: '0.1.0', dbPath: '/tmp/opentrading212.db' }),
    allowedHosts: async () => ['live.trading212.com', 'api.anthropic.com', 'github.com']
  },
  ai: {
    getStatus: async () => ({
      provider: 'anthropic',
      model: 'claude-opus-5',
      localOnly: true,
      ollamaUrl: 'http://localhost:11434',
      blocked: 'local-only',
      providers: [
        {
          id: 'anthropic',
          name: 'Anthropic',
          description: 'Claude models.',
          local: false,
          hasKey: true,
          needsKey: true,
          keyPlaceholder: 'sk-ant-…',
          keyUrl: 'https://console.anthropic.com',
          suggested: [{ id: 'claude-opus-5', name: 'Claude Opus 5', note: 'The only one' }],
          model: 'claude-opus-5'
        },
        {
          id: 'ollama',
          name: 'Ollama',
          description: 'On this computer.',
          local: true,
          hasKey: true,
          needsKey: false,
          keyPlaceholder: '',
          keyUrl: 'https://ollama.com',
          suggested: [],
          model: null
        }
      ]
    })
  },

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
    onSyncProgress: () => () => undefined,
    sync: async () => ({ positions: 1, activities: 0 })
  },
  portfolio: {
    summary: async () => ({
      currency: 'EUR',
      totalCents: 180_000,
      investedCents: 140_000,
      unrealizedCents: 30_000,
      realizedCents: 0,
      cashCents: 10_000,
      positions: 1,
      takenAt: Date.now()
    }),
    positions: async () => [position],
    allocation: async ({ by }: { by: string }) => [
      {
        key: by === 'position' ? 'AAPL_US_EQ' : 'USD',
        label: by === 'position' ? 'Apple' : 'USD',
        valueCents: 170_000,
        share: 1
      }
    ]
  },
  activity: {
    list: async () => ({
      total: 1,
      rows: [
        {
          id: 'dividend:1',
          kind: 'dividend',
          ticker: 'AAPL_US_EQ',
          label: 'Apple',
          quantity: 10,
          price: 0.25,
          currency: 'USD',
          amountCents: 212,
          status: 'ORDINARY',
          at: Date.UTC(2026, 7, 15)
        }
      ]
    })
  },
  analysis: {
    valueHistory: async () => [
      { day: '2026-09-21', totalCents: 175_000, investedCents: 150_000, estimated: true },
      { day: '2026-09-22', totalCents: 178_000, investedCents: 150_000, estimated: true },
      { day: '2026-09-23', totalCents: 180_000, investedCents: 150_000, estimated: false }
    ],
    monthlyFlows: async ({ months }: { months: number }) =>
      Array.from({ length: months }, (_, i) =>
        month(`2026-${String((i % 12) + 1).padStart(2, '0')}`, i * 100)
      ),
    dividendPayers: async () => [
      { ticker: 'AAPL_US_EQ', name: 'Apple', amountCents: 6_600, payments: 11 }
    ],
    insights: async () => [
      {
        id: 'c',
        kind: 'concentration',
        severity: 'warn',
        title: 'Apple is 100% of your holdings',
        detail: 'Detail.'
      }
    ]
  },
  chats: { list: async () => [], onChanged: () => () => undefined }
} as unknown as OpenT212Api

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)))

beforeAll(() => {
  ;(window as unknown as { ot212: OpenT212Api }).ot212 = api
  // Recharts measures its container; happy-dom has no layout.
  const noop = (): void => undefined
  globalThis.ResizeObserver ??= class {
    observe = noop
    unobserve = noop
    disconnect = noop
  } as unknown as typeof ResizeObserver
})
afterEach(() => cleanup())

describe('overview tabs', () => {
  it('renders every tab and keeps the tab in the URL', async () => {
    const errors = vi.spyOn(console, 'error')
    const { router } = await import('../router')
    await act(() => router.navigate({ to: '/' }))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    )
    await settle()
    expect(await screen.findByText('Account value', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Holdings/ }).getAttribute('aria-selected')).toBe('true')
    expect((await screen.findAllByText('Apple', {}, { timeout: 5000 })).length).toBeGreaterThan(0)

    for (const [name, expected] of [
      ['Allocation', 'By currency'],
      ['Dividends', 'Top payers'],
      ['Insights', 'Apple is 100% of your holdings'],
      ['Activity', '1–1 of 1']
    ] as const) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }))
      await settle()
      expect(
        screen.getByRole('tab', { name: new RegExp(name) }).getAttribute('aria-selected')
      ).toBe('true')
      expect((await screen.findAllByText(expected, {}, { timeout: 5000 })).length).toBeGreaterThan(
        0
      )
      expect(router.state.location.search).toMatchObject({ tab: name.toLowerCase() })
    }

    // Opening a position keeps the tab.
    fireEvent.click(screen.getAllByText('Apple')[0])
    await settle()
    expect(router.state.location.search).toMatchObject({ tab: 'activity', ticker: 'AAPL_US_EQ' })
    expect(await screen.findByLabelText('Position details', {}, { timeout: 5000 })).toBeTruthy()

    const reactErrors = errors.mock.calls.filter(
      (c) => !String(c[0]).includes('width(0) and height(0)')
    )
    expect(reactErrors).toEqual([])
  })

  it('renders the privacy page with grouped hosts and the local-only state', async () => {
    const errors = vi.spyOn(console, 'error')
    const { router } = await import('../router')
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    )
    await settle()
    fireEvent.click(screen.getByRole('link', { name: 'Privacy' }))
    await settle()
    expect(router.state.location.pathname).toBe('/privacy')
    expect(
      await screen.findByText('Your data stays on this computer.', {}, { timeout: 5000 })
    ).toBeTruthy()
    expect(await screen.findByText('live.trading212.com', {}, { timeout: 5000 })).toBeTruthy()
    expect(await screen.findByText('Blocked: local-only', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getAllByText('Never')).toHaveLength(2)
    expect(errors.mock.calls).toEqual([])
  })

  it('renders every settings tab', async () => {
    const errors = vi.spyOn(console, 'error')
    const { router } = await import('../router')
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    )
    await settle()
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    await settle()
    expect(await screen.findByText('Connected', {}, { timeout: 5000 })).toBeTruthy()
    // The settings row plus the sidebar status card.
    expect(screen.getAllByRole('button', { name: /Sync now/ })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    await settle()
    expect(router.state.location.search).toMatchObject({ tab: 'ai' })
    expect(await screen.findByText('Local-only mode', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Anthropic/ }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(await screen.findByText('Blocked by local-only', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Ollama/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain('Claude Opus 5')
    expect(await screen.findByText('The only one', {}, { timeout: 5000 })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'App' }))
    await settle()
    expect(await screen.findByText('/tmp/opentrading212.db', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Wipe everything/ })).toBeTruthy()
    expect(errors.mock.calls).toEqual([])
  })
})
