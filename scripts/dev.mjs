/**
 * WXT のビルド完了を検出してからブラウザを起動する開発用オーケストレータ。
 * Ctrl+C で両プロセスを同時に終了する。
 */
import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const pathToExtension = path.resolve(projectRoot, '.output/chrome-mv3')
const userDataDir = path.resolve(projectRoot, '.dev-browser-profile')

/** ANSI エスケープシーケンスを除去する */
const stripAnsi = (str) => str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')

const wxt = spawn('node_modules/.bin/wxt', [], {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: projectRoot,
})

wxt.stdout.pipe(process.stdout)
wxt.stderr.pipe(process.stderr)

let browserContext = null
let browserLaunching = false

const launchBrowser = async () => {
  if (browserContext || browserLaunching) return
  browserLaunching = true

  browserContext = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  })

  const [background] = browserContext.serviceWorkers()
  const sw = background ?? await browserContext.waitForEvent('serviceworker')
  const extensionId = sw.url().split('/')[2]

  console.log(`Extension ID: ${extensionId}`)
  console.log(`Options: chrome-extension://${extensionId}/options.html`)

  const page = await browserContext.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  console.log('ブラウザを閉じるとスクリプトが終了します。空白の場合はページを再読み込みしてください。')

  browserContext.on('close', () => {
    wxt.kill()
    process.exit(0)
  })
}

wxt.stdout.on('data', (chunk) => {
  if (stripAnsi(chunk.toString()).includes('Built extension in')) {
    launchBrowser().catch((error) => {
      console.error(error)
      wxt.kill()
      process.exit(1)
    })
  }
})

wxt.on('exit', (code) => {
  browserContext?.close().catch(() => {})
  process.exit(code ?? 0)
})

const shutdown = (signal) => {
  wxt.kill(signal)
  browserContext?.close().catch(() => {})
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
