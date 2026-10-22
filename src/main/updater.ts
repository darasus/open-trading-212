import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getSetting } from './settings'
import { createUpdater, type UpdateDriver } from './updates'

/**
 * Updates come from GitHub Releases (see electron-builder.yml `publish`). The app checks on
 * launch and every six hours, downloads a newer version in the background, and installs it
 * when the app quits or when the user clicks "Restart". `updates.auto` = 'false' turns the
 * scheduled checks off; a manual check from Settings always works.
 *
 * Disabled in development builds. On macOS only a signed build can install an update; an
 * unsigned one finds it but macOS refuses to apply it.
 */
function electronDriver(): UpdateDriver {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  return {
    async checkForUpdates() {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.isUpdateAvailable) return null
      return result.updateInfo.version
    },
    async downloadUpdate() {
      await autoUpdater.downloadUpdate()
    },
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    onDownloadProgress(listener) {
      autoUpdater.on('download-progress', (progress) => listener(progress.percent))
    }
  }
}

export function automaticUpdatesEnabled(): boolean {
  return getSetting('updates.auto') !== 'false'
}

export const updater = createUpdater({
  driver: app.isPackaged ? electronDriver() : null,
  disabledReason: 'development build',
  currentVersion: app.getVersion(),
  automatic: automaticUpdatesEnabled
})
