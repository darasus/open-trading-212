// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OpenT212Api } from '@shared/ipc'
import { ModelPicker } from '@/components/model-picker'

const listModels = vi.fn(async () => [
  { id: 'claude-opus-5', name: 'Claude Opus 5' },
  { id: 'claude-new-model', name: 'Claude New Model' }
])

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))

beforeAll(() => {
  ;(window as unknown as { ot212: Partial<OpenT212Api> }).ot212 = {
    ai: { listModels } as unknown as OpenT212Api['ai']
  }
  // cmdk scrolls the active item into view; happy-dom has no layout.
  Element.prototype.scrollIntoView ??= () => undefined
  globalThis.ResizeObserver ??= class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  } as unknown as typeof ResizeObserver
})
afterEach(() => cleanup())

function mount(onChange = vi.fn(), enabled = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ModelPicker
        provider="anthropic"
        value="claude-opus-5"
        suggested={[{ id: 'claude-opus-5', name: 'Claude Opus 5', note: 'Best reasoning' }]}
        enabled={enabled}
        onChange={onChange}
      />
    </QueryClientProvider>
  )
  return onChange
}

describe('ModelPicker', () => {
  it('shows the current model, loads the live list on open, and picks one', async () => {
    const onChange = mount()
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain('Claude Opus 5')
    expect(listModels).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    await settle()
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Suggested', {}, { timeout: 5000 })).toBeTruthy()
    expect(
      await screen.findByText('Available with your account', {}, { timeout: 5000 })
    ).toBeTruthy()
    expect(await screen.findByText('2 models available', {}, { timeout: 5000 })).toBeTruthy()

    fireEvent.click(screen.getByText('Claude New Model'))
    expect(onChange).toHaveBeenCalledWith('claude-new-model')
  })

  it('accepts a typed model id that is not in the list', async () => {
    const onChange = mount()
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    await settle()
    fireEvent.change(screen.getByPlaceholderText('Search or type a model id'), {
      target: { value: 'claude-tomorrow' }
    })
    await settle()
    fireEvent.click(screen.getByText('claude-tomorrow'))
    expect(onChange).toHaveBeenCalledWith('claude-tomorrow')
  })

  it('does not call the provider before a key exists', async () => {
    listModels.mockClear()
    mount(vi.fn(), false)
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    await settle()
    expect(listModels).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Add a key to load the full list.', {}, { timeout: 5000 })
    ).toBeTruthy()
  })
})
