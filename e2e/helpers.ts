import { createServer, type RequestListener, type Server } from 'node:http'
import type { Page } from '@playwright/test'

/** E2E 用 HTTP サーバーの参照。 */
export interface TestServer {
  /** 起動したサーバーの origin。 */
  origin: string
  /** サーバーと既存接続を終了する。 */
  close: () => Promise<void>
}

/** HTTP サーバーと既存接続を終了する。 */
export async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/** E2E 用 HTTP サーバーを空きポートで起動する。 */
export async function startTestServer(listener?: RequestListener): Promise<TestServer> {
  const server = createServer(
    listener ??
      ((req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(`<!doctype html><title>${req.url}</title><main>${req.url}</main>`)
      }),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to start test server')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

/** redirect によって中断される可能性がある navigation を実行する。 */
export async function gotoPossiblyRedirected(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url)
  } catch (error) {
    if (error instanceof Error && error.message.includes('net::ERR_ABORTED')) return
    if (error instanceof Error && error.message.includes('is interrupted by another navigation'))
      return
    throw error
  }
}
