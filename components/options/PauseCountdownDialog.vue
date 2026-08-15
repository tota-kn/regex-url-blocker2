<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import { PAUSE_COUNTDOWN_TICK_MS } from '@/utils/constants'
import { useCountdown } from '@/utils/useCountdown'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * 一時停止前カウントダウンダイアログが親へ通知するイベント。
 */
interface Emits {
  /** カウントダウン完了後に一時停止開始が確定されたときに発火する。 */
  confirm: []
}

/** 一時停止前カウントダウンダイアログの props。 */
interface Props {
  /** 一時停止を確定できるまでの待機秒数。 */
  waitSeconds: number
  /** 一時停止を継続する分数。 */
  pauseDurationMinutes: number
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const dialogRef = ref<InstanceType<typeof BaseDialog> | null>(null)
const waitMilliseconds = computed(() => props.waitSeconds * 1_000)
const {
  now,
  remainingSeconds,
  isReady,
  start: startTimer,
  stop: stopTimer,
} = useCountdown(waitMilliseconds, PAUSE_COUNTDOWN_TICK_MS)

watch(now, () => {
  if (!dialogRef.value?.isOpen()) return
  if (shouldCancelForLostAttention()) close()
})

/** ダイアログを開いてカウントダウンを開始する。 */
function open(): void {
  stopTimer()
  dialogRef.value?.open()
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
  dialogRef.value?.close()
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
  <BaseDialog
    ref="dialogRef"
    aria-labelledby="pause-countdown-title"
    class="w-[min(24rem,calc(100vw-2rem))] p-0"
    @cancel="cancel"
  >
    <div class="space-y-5 p-5 text-center">
      <div
        aria-hidden="true"
        class="mx-auto flex size-24 items-center justify-center rounded-full bg-accent"
      >
        <div class="size-14 rounded-full bg-primary/45 pause-breathe" />
      </div>

      <div>
        <h2 id="pause-countdown-title" class="text-heading-md">{{ t('Take a breath') }}</h2>
        <p class="mt-1 text-body-sm text-muted-foreground">
          {{
            t('Stay here for {seconds} seconds before pausing this group.', {
              seconds: waitSeconds,
            })
          }}
        </p>
      </div>

      <p class="text-mono-md text-secondary-foreground" aria-live="polite">
        {{ isReady ? t('Ready') : t('{seconds}s remaining', { seconds: remainingSeconds }) }}
      </p>

      <div class="flex justify-end gap-2">
        <BaseButton type="button" @click="cancel">
          <XMarkIcon aria-hidden="true" class="size-4" />
          {{ t('Cancel') }}
        </BaseButton>
        <BaseButton
          type="button"
          variant="primary"
          :aria-label="t('Pause {minutes} min', { minutes: pauseDurationMinutes })"
          :disabled="!isReady"
          @click="confirmPause"
        >
          <CheckIcon aria-hidden="true" class="size-4" />
          {{ t('Pause {minutes} min', { minutes: pauseDurationMinutes }) }}
        </BaseButton>
      </div>
    </div>
  </BaseDialog>
</template>
