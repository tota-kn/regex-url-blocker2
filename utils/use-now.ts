import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * 指定間隔（ms）で現在時刻を更新するリアクティブな `Ref<Date>` を返す。
 * コンポーネントのアンマウント時に自動でタイマーを解除する。
 */
export function useNow(intervalMs: number = 1000): Ref<Date> {
  const now = ref(new Date())
  const timer = setInterval(() => {
    now.value = new Date()
  }, intervalMs)
  onUnmounted(() => clearInterval(timer))
  return now
}
