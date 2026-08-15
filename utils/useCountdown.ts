import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useNowTimer } from './useNowTimer'

/** 壁時計ベースのカウントダウン状態。 */
export interface Countdown {
  /** 現在時刻。attention 状態の監視にも利用できる。 */
  now: Ref<Date>
  /** 残りミリ秒。 */
  remainingMs: ComputedRef<number>
  /** 切り上げた残り秒数。 */
  remainingSeconds: ComputedRef<number>
  /** 指定時間が経過したかどうか。 */
  isReady: ComputedRef<boolean>
  /** 現在の壁時計を起点に開始する。 */
  start: () => void
  /** 時計更新を停止する。 */
  stop: () => void
}

/** setInterval の遅延に左右されない壁時計ベースのカウントダウンを作る。 */
export function useCountdown(durationMs: Ref<number>, tickMs = 250): Countdown {
  const startedAt = ref(0)
  const { now, start: startTimer, stop } = useNowTimer(tickMs)
  const elapsedMs = computed(() => Math.max(0, now.value.getTime() - startedAt.value))
  const remainingMs = computed(() => Math.max(0, durationMs.value - elapsedMs.value))
  const remainingSeconds = computed(() => Math.ceil(remainingMs.value / 1_000))
  const isReady = computed(() => startedAt.value > 0 && remainingMs.value <= 0)

  /** 現在時刻からカウントダウンを開始する。 */
  function start(): void {
    stop()
    startedAt.value = Date.now()
    now.value = new Date(startedAt.value)
    startTimer()
  }

  return { now, remainingMs, remainingSeconds, isReady, start, stop }
}
