import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpc, syncWithBroadcast } from './ipc'
import { closeDb, getDb } from './db'
import { failInterruptedSyncs } from './t212/sync'
import { closeReadonlyDb } from './ai/readonly-sql'
import { openClickedLink } from './links'
import { isUpdateUrl, lockDownMainNetwork } from './network'

/**
 * The renderer must never talk to the network. Its only job is to render what
 * the main process hands it over IPC. Block every request from the renderer
 * session except the app's own files and, in development, the Vite dev server.
 */
function lockDownRendererNetwork(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url)
    const isLocalFile = url.protocol === 'file:' || url.protocol === 'devtools:'
    const isDevServer = is.dev && url.hostname === 'localhost'
    callback({ cancel: !(isLocalFile || isDevServer) })
  })
}

/**
 * electron-updater does not use `fetch`; it downloads with Electron's `net` on its own
 * session partition (`electron-updater`, NET_SESSION_NAME in electron-updater). Limit that
 * session to this app's GitHub releases. The options match electron-updater's own, since
 * whichever caller creates the partition first sets them.
 */
function lockDownUpdaterNetwork(): void {
  session
    .fromPartition('electron-updater', { cache: false })
    .webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !isUpdateUrl(details.url) })
    })
}

const SYNC_INTERVAL_MS = 15 * 60 * 1000

/** Sync on launch and every 15 minutes while the app is open. Nothing runs when it is closed. */
function scheduleSync(): void {
  const run = (): void => {
    void syncWithBroadcast().catch((error) => console.error('[sync]', error))
  }
  setTimeout(run, 2_000)
  setInterval(run, SYNC_INTERVAL_MS)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d16',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Links never open inside the app window, and only https links reach the browser.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void openClickedLink(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.darasus.opentrading212')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  lockDownRendererNetwork()
  lockDownUpdaterNetwork()
  getDb() // opens the SQLite file and applies pending migrations
  lockDownMainNetwork() // needs settings (local-only mode), so after the database
  failInterruptedSyncs()
  registerIpc()
  createWindow()
  scheduleSync()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeReadonlyDb()
  closeDb()
})
