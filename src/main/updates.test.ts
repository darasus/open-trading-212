import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../shared/ipc'
import {
  CHECK_INTERVAL_MS,
  createUpdater,
  FIRST_CHECK_DELAY_MS,
  type UpdateDriver
} from './updates'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fakeDriver(latest: string | null = null) {
  let progress: ((percent: number) => void) | null = null
  const driver: UpdateDriver = {
    checkForUpdates: vi.fn(async () => latest),
    downloadUpdate: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
    onDownloadProgress: (listener) => {
      progress = listener
    }
  }
  return { driver, progress: (percent: number) => progress?.(percent) }
}

function recorder(updater: ReturnType<typeof createUpdater>): UpdateState[] {
  const seen: UpdateState[] = []
  updater.onChange((state) => seen.push(state))
  return seen
}

describe('createUpdater', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000 }))
  afterEach(() => vi.useRealTimers())

  it('is disabled without a driver and never schedules anything', async () => {
    const updater = createUpdater({ driver: null, currentVersion: '1.0.0', automatic: () => true })
    expect(updater.getState()).toEqual({ status: 'disabled', reason: 'not a packaged build' })
    updater.start()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)
    expect(updater.getState().status).toBe('disabled')
    await expect(updater.check()).resolves.toEqual(updater.getState())
  })

  it('reports up to date, with the time of the check, when nothing is newer', async () => {
    const { driver } = fakeDriver(null)
    const updater = createUpdater({ driver, currentVersion: '1.0.0', automatic: () => true })
    const seen = recorder(updater)
    await expect(updater.check()).resolves.toEqual({
      status: 'up-to-date',
      version: '1.0.0',
      checkedAt: 1_000
    })
    expect(seen.map((s) => s.status)).toEqual(['checking', 'up-to-date'])
    expect(driver.downloadUpdate).not.toHaveBeenCalled()
  })

  it('downloads a newer version, relays progress, and installs only once ready', async () => {
    const { driver, progress } = fakeDriver('1.1.0')
    const download = deferred<void>()
    vi.mocked(driver.downloadUpdate).mockReturnValue(download.promise)
    const updater = createUpdater({ driver, currentVersion: '1.0.0', automatic: () => true })
    const seen = recorder(updater)

    const result = updater.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(updater.getState()).toEqual({ status: 'downloading', version: '1.1.0', percent: null })
    progress(42)
    expect(updater.getState()).toEqual({ status: 'downloading', version: '1.1.0', percent: 42 })

    updater.quitAndInstall()
    expect(driver.quitAndInstall).not.toHaveBeenCalled()

    download.resolve()
    await expect(result).resolves.toEqual({ status: 'ready', version: '1.1.0' })
    expect(seen.map((s) => s.status)).toEqual(['checking', 'downloading', 'downloading', 'ready'])

    // Progress after the download is done is stale and must not undo `ready`.
    progress(100)
    expect(updater.getState().status).toBe('ready')

    updater.quitAndInstall()
    expect(driver.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight check between callers and stops checking once ready', async () => {
    const { driver } = fakeDriver('1.1.0')
    const updater = createUpdater({ driver, currentVersion: '1.0.0', automatic: () => true })
    const [a, b] = await Promise.all([updater.check(), updater.check()])
    expect(a).toBe(b)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)

    await updater.check()
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('turns a failed check into an error state and recovers on the next check', async () => {
    const { driver } = fakeDriver('1.1.0')
    vi.mocked(driver.checkForUpdates).mockRejectedValueOnce(
      new Error('net::ERR_INTERNET_DISCONNECTED')
    )
    const updater = createUpdater({ driver, currentVersion: '1.0.0', automatic: () => true })
    await expect(updater.check()).resolves.toEqual({
      status: 'error',
      message: 'net::ERR_INTERNET_DISCONNECTED',
      checkedAt: 1_000
    })
    await expect(updater.check()).resolves.toEqual({ status: 'ready', version: '1.1.0' })
  })

  it('checks shortly after start and then on the interval, only while automatic is on', async () => {
    const { driver } = fakeDriver(null)
    let automatic = true
    const updater = createUpdater({ driver, currentVersion: '1.0.0', automatic: () => automatic })
    updater.start()
    updater.start() // idempotent

    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS - 1)
    expect(driver.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)

    automatic = false
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)

    // A manual check ignores the setting.
    await updater.check()
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(3)

    updater.stop()
    automatic = true
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(3)
  })
})
