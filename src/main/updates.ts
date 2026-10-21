import type { UpdateState } from '../shared/ipc'

/**
 * The update state machine, kept apart from electron-updater so it can be tested without
 * Electron. `updater.ts` binds it to electron-updater and the app's settings.
 *
 * One check at a time: a scheduled tick and a click on "Check for updates" share the
 * in-flight check. Once an update is downloaded (`ready`) nothing checks again; the next
 * launch is the new version.
 */

/** Checks on launch happen after the window is up and the first sync has had its turn. */
export const FIRST_CHECK_DELAY_MS = 10_000
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export type UpdateDriver = {
  /** Resolves with the newest published version, or null when nothing is newer than this build. */
  checkForUpdates(): Promise<string | null>
  /** Downloads and verifies the update found by the last check. */
  downloadUpdate(): Promise<void>
  quitAndInstall(): void
  onDownloadProgress(listener: (percent: number) => void): void
}

export type Updater = {
  getState(): UpdateState
  /** Runs a check now (or joins the running one) and resolves with the state it ends in. */
  check(): Promise<UpdateState>
  /** Schedules a check shortly after launch and every `CHECK_INTERVAL_MS` while `automatic()` holds. */
  start(): void
  stop(): void
  /** Quits and installs. Does nothing unless an update is `ready`. */
  quitAndInstall(): void
  onChange(listener: (state: UpdateState) => void): () => void
}

export type UpdaterOptions = {
  /** Null when updates cannot run at all (a development build), with the reason. */
  driver: UpdateDriver | null
  disabledReason?: string
  currentVersion: string
  /** Whether scheduled checks are on. Read at every tick, so a settings change applies at the next one. */
  automatic: () => boolean
  now?: () => number
}

export function createUpdater({
  driver,
  disabledReason = 'not a packaged build',
  currentVersion,
  automatic,
  now = Date.now
}: UpdaterOptions): Updater {
  let state: UpdateState = driver
    ? { status: 'idle' }
    : { status: 'disabled', reason: disabledReason }
  const listeners = new Set<(state: UpdateState) => void>()
  let inFlight: Promise<UpdateState> | null = null
  let firstCheck: NodeJS.Timeout | null = null
  let interval: NodeJS.Timeout | null = null

  function set(next: UpdateState): void {
    state = next
    for (const listener of listeners) listener(next)
  }

  driver?.onDownloadProgress((percent) => {
    if (state.status === 'downloading') set({ ...state, percent })
  })

  async function run(driver: UpdateDriver): Promise<UpdateState> {
    set({ status: 'checking' })
    try {
      const version = await driver.checkForUpdates()
      if (!version) {
        set({ status: 'up-to-date', version: currentVersion, checkedAt: now() })
        return state
      }
      set({ status: 'downloading', version, percent: null })
      await driver.downloadUpdate()
      set({ status: 'ready', version })
    } catch (error) {
      set({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        checkedAt: now()
      })
    }
    return state
  }

  function check(): Promise<UpdateState> {
    if (!driver || state.status === 'ready') return Promise.resolve(state)
    if (!inFlight) {
      inFlight = run(driver).finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }

  function tick(): void {
    if (automatic()) void check()
  }

  return {
    getState: () => state,
    check,
    start() {
      if (!driver || interval) return
      firstCheck = setTimeout(tick, FIRST_CHECK_DELAY_MS)
      interval = setInterval(tick, CHECK_INTERVAL_MS)
    },
    stop() {
      if (firstCheck) clearTimeout(firstCheck)
      if (interval) clearInterval(interval)
      firstCheck = null
      interval = null
    },
    quitAndInstall() {
      if (driver && state.status === 'ready') driver.quitAndInstall()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
