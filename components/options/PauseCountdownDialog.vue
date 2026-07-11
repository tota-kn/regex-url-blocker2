<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import { PAUSE_COUNTDOWN_TICK_MS, PAUSE_COUNTDOWN_WAIT_MS } from '@/utils/constants'
import { useNowTimer } from '@/utils/useNowTimer'

/**
 * 一時停止前カウントダウンダイアログが親へ通知するイベント。
 */
interface Emits {
  /** カウントダウン完了後に一時停止開始が確定されたときに発火する。 */
  confirm: []
}

const emit = defineEmits<Emits>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const startedAt = ref(0)
const { now, start: startTimer, stop: stopTimer } = useNowTimer(PAUSE_COUNTDOWN_TICK_MS)

const elapsedMs = computed(() => Math.max(0, now.value.getTime() - startedAt.value))
const remainingMs = computed(() => Math.max(0, PAUSE_COUNTDOWN_WAIT_MS - elapsedMs.value))
const remainingSeconds = computed(() => Math.ceil(remainingMs.value / 1_000))
const isReady = computed(() => elapsedMs.value >= PAUSE_COUNTDOWN_WAIT_MS)

watch(now, () => {
  if (!dialogRef.value?.open) return
  if (shouldCancelForLostAttention()) close()
})

/** ダイアログを開いてカウントダウンを開始する。 */
function open(): void {
  stopTimer()
  startedAt.value = Date.now()
  now.value = new Date(startedAt.value)
  dialogRef.value?.showModal()
  window.addEventListener('blur', cancelForFocusLoss, true)
  document.addEventListener('blur', cancelForFocusLoss, true)
  document.addEventListener('visibilitychange', cancelForVisibilityChange)
  startTimer()
}

/** フォーカス喪失時のイベント監視を解除する。 */
function removeFocusLossListeners(): void {
  window.removeEventListener('blur', cancelForFocusLoss, true)
  document.removeEventListener('blur', cancelForFocusLoss, true)
  document.removeEventListener('visibilitychange', cancelForVisibilityChange)
}

/** ダイアログを閉じ、カウントダウンを破棄する。 */
function close(): void {
  stopTimer()
  removeFocusLossListeners()
  if (dialogRef.value?.open) dialogRef.value.close()
}

/** ユーザーキャンセル時にカウントダウンを破棄する。 */
function cancel(): void {
  close()
}

/** ウィンドウまたは文書フォーカス喪失時にカウントダウンを破棄する。 */
function cancelForFocusLoss(event: Event): void {
  const nextTarget = event instanceof FocusEvent ? event.relatedTarget : null
  if (nextTarget instanceof Node && document.contains(nextTarget)) return
  close()
}

/** カウントダウンを続けてよいフォーカス状態かどうかを返す。 */
function shouldCancelForLostAttention(): boolean {
  if (document.visibilityState === 'hidden') return true
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true
  return false
}

/** ページが hidden になった場合にカウントダウンを破棄する。 */
function cancelForVisibilityChange(): void {
  if (document.visibilityState !== 'hidden') return
  close()
}

/** カウント完了後、一時停止の保存を親へ依頼する。 */
function confirmPause(): void {
  if (!isReady.value) return
  close()
  emit('confirm')
}

defineExpose({ open })

onUnmounted(() => {
  close()
})
</script>

<template>
  <dialog
    ref="dialogRef"
    aria-labelledby="pause-countdown-title"
    class="dialog-centered w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/30"
    @cancel.prevent="cancel"
  >
    <div class="space-y-5 p-5 text-center">
      <div
        aria-hidden="true"
        class="mx-auto flex size-24 items-center justify-center rounded-full bg-accent"
      >
        <div class="size-14 rounded-full bg-primary/45 pause-breathe" />
      </div>

      <div>
        <h2 id="pause-countdown-title" class="text-heading-md">Take a breath</h2>
        <p class="mt-1 text-body-sm text-muted-foreground">
          Stay here for a minute before pausing this group.
        </p>
      </div>

      <p class="text-mono-md text-secondary-foreground" aria-live="polite">
        {{ isReady ? 'Ready' : `${remainingSeconds}s remaining` }}
      </p>

      <div class="flex justify-end gap-2">
        <BaseButton type="button" @click="cancel">
          <XMarkIcon aria-hidden="true" class="size-4" />
          Cancel
        </BaseButton>
        <BaseButton
          type="button"
          variant="primary"
          aria-label="Pause 10 min"
          :disabled="!isReady"
          @click="confirmPause"
        >
          <CheckIcon aria-hidden="true" class="size-4" />
          Pause 10 min
        </BaseButton>
      </div>
    </div>
  </dialog>
</template>
