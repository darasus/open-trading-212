import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/**
 * Updates come from GitHub Releases (see electron-builder.yml `publish`). electron-updater
 * only checks; nothing installs without the user quitting. Disabled in development builds.
 * On macOS only a signed build can install an update; an unsigned one finds it but macOS
 * refuses to apply it.
 */
let configured = false

function configure(): void {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
}

export type UpdateCheck =
  | { status: 'disabled'; reason: string }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string }

export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!app.isPackaged) return { status: 'disabled', reason: 'development build' }
  configure()
  try {
    const result = await autoUpdater.checkForUpdates()
    const latest = result?.updateInfo.version
    if (latest && latest !== app.getVersion()) {
      await autoUpdater.downloadUpdate()
      return { status: 'available', version: latest }
    }
    return { status: 'up-to-date', version: app.getVersion() }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
