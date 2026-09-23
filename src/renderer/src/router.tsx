import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect
} from '@tanstack/react-router'
import { AppShell } from './components/app-shell'
import { OverviewPage } from './routes/overview'
import { ChatPage } from './routes/chat'
import { PrivacyPage } from './routes/privacy'
import { SettingsPage } from './routes/settings'

const rootRoute = createRootRoute({ component: AppShell })

export const OVERVIEW_TABS = [
  'holdings',
  'allocation',
  'dividends',
  'insights',
  'activity'
] as const
export type OverviewTab = (typeof OVERVIEW_TABS)[number]

/** The open tab and position live in the URL, so leaving and coming back keeps your place. */
export type OverviewSearch = { ticker?: string; tab?: OverviewTab }

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): OverviewSearch => ({
    ticker: typeof search.ticker === 'string' ? search.ticker : undefined,
    tab: OVERVIEW_TABS.includes(search.tab as OverviewTab) ? (search.tab as OverviewTab) : undefined
  }),
  component: OverviewPage
})
const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === 'string' ? search.id : undefined
  }),
  // Every thread is addressed by id, so the sidebar can highlight the open one.
  // Landing on /chat without one starts a fresh thread.
  beforeLoad: ({ search }) => {
    if (!search.id) {
      throw redirect({ to: '/chat', search: { id: crypto.randomUUID() }, replace: true })
    }
  },
  component: ChatPage
})
const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: PrivacyPage
})
export const SETTINGS_TABS = ['connection', 'ai', 'app'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => ({
    tab: SETTINGS_TABS.includes(search.tab as SettingsTab) ? (search.tab as SettingsTab) : undefined
  }),
  component: SettingsPage
})

const routeTree = rootRoute.addChildren([overviewRoute, chatRoute, privacyRoute, settingsRoute])

// Hash history: the packaged app is served from file://, so path-based routing has nothing to resolve.
export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
