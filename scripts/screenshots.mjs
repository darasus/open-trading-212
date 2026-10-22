// Regenerates the README screenshots in docs/screenshots from made-up demo data (see
// demo-data.mjs). Run `bun run screenshots`, which builds the app first.
//
// The app runs on a throwaway profile (`--user-data-dir`), so your own database, keys and
// settings are never read. Pages are captured over the DevTools protocol, which records only
// the app's own web contents, never the rest of the screen.
import { spawn } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import electronPath from 'electron'
import { seedDemo } from './demo-data.mjs'

const PORT = 9339
const OUT = resolve(import.meta.dirname, '../docs/screenshots')
const SHOTS = [
  { name: 'overview', hash: '#/' },
  { name: 'pies', hash: '#/pies?id=1' },
  { name: 'chat', hash: '#/chat?id=demo-chat-1' }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Waits for the route's data to load and its transitions to finish. CSS and motion animations
 * show up in `getAnimations()`; the charts animate in JavaScript, hence the fixed tail.
 */
async function settle(cdp) {
  await sleep(1000)
  for (let i = 0; i < 50; i++) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `document.getAnimations().some((a) => a.playState === 'running')`,
      returnByValue: true
    })
    if (!result.value) break
    await sleep(100)
  }
  await sleep(1500)
}

async function pageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      // not listening yet
    }
    await sleep(500)
  }
  throw new Error('The app did not open a window')
}

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((r, reject) => {
    ws.addEventListener('open', r)
    ws.addEventListener('error', reject)
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data)
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(msg.error.message))
    else p.resolve(msg.result)
  })
  const send = (method, params = {}) =>
    new Promise((r, reject) => {
      id += 1
      pending.set(id, { resolve: r, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { send, close: () => ws.close() }
}

const profile = mkdtempSync(join(tmpdir(), 'ot212-demo-'))
seedDemo(profile)

// Strip the development fallback keys so the chat looks the same on every machine. `--lang`
// below keeps number and date formats British whatever the system locale is.
const env = { ...process.env }
for (const key of [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENROUTER_API_KEY',
  'ELECTRON_RENDERER_URL'
]) {
  delete env[key]
}
const app = spawn(
  electronPath,
  ['.', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--lang=en-GB'],
  {
    cwd: resolve(import.meta.dirname, '..'),
    env,
    stdio: 'ignore'
  }
)

try {
  const cdp = await connect((await pageTarget()).webSocketDebuggerUrl)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    mobile: false
  })
  mkdirSync(OUT, { recursive: true })
  for (const shot of SHOTS) {
    await cdp.send('Runtime.evaluate', {
      expression: `location.hash = ${JSON.stringify(shot.hash)}`
    })
    await settle(cdp)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, `${shot.name}.png`), Buffer.from(data, 'base64'))
    console.log(`docs/screenshots/${shot.name}.png`)
  }
  cdp.close()
} finally {
  app.kill()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}
