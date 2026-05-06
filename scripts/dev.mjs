/**
 * WXT のビルド完了を検出してからブラウザを起動する開発用オーケストレータ。
 * Ctrl+C で両プロセスを同時に終了する。
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

/** ANSI エスケープシーケンスを除去する */
const stripAnsi = (str) => str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')

const wxt = spawn('node_modules/.bin/wxt', [], {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: projectRoot,
})

wxt.stdout.pipe(process.stdout)
wxt.stderr.pipe(process.stderr)

let browserProcess = null

const launchBrowser = () => {
  if (browserProcess) return
  browserProcess = spawn('node', [path.join(__dirname, 'open-dev-browser.mjs')], {
    stdio: 'inherit',
    cwd: projectRoot,
  })
  browserProcess.on('exit', () => {
    wxt.kill()
    process.exit(0)
  })
}

wxt.stdout.on('data', (chunk) => {
  if (stripAnsi(chunk.toString()).includes('Built extension in')) {
    launchBrowser()
  }
})

wxt.on('exit', (code) => {
  browserProcess?.kill()
  process.exit(code ?? 0)
})

const shutdown = (signal) => {
  wxt.kill(signal)
  browserProcess?.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
