import { onUnmounted, ref } from 'vue'

/**
 * 現在時刻を一定間隔で更新するリアクティブな ref を提供する composable。
 * コンポーネントの unmount 時にタイマーを自動停止する。
 * @param intervalMs 更新間隔（ミリ秒）。既定は1秒。
 */
export function useNowTimer(intervalMs = 1_000) {
  const now = ref(new Date())
  let timerId: number | undefined

  /** タイマーを開始する。既に動いている場合は再起動する。 */
  function start(): void {
    stop()
    timerId = window.setInterval(() => {
      now.value = new Date()
    }, intervalMs)
  }

  /** タイマーを停止する。 */
  function stop(): void {
    if (timerId === undefined) return
    window.clearInterval(timerId)
    timerId = undefined
  }

  onUnmounted(stop)

  return { now, start, stop }
}
