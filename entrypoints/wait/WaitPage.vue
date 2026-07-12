<script setup lang="ts">
import { ArrowRightIcon, ArrowUturnLeftIcon } from '@heroicons/vue/24/outline'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import InfoValue from '@/components/ui/InfoValue.vue'
import { DEFAULT_WAIT_GRANT_MINUTES } from '@/utils/defaults'
import { loadDelayGrantState, loadPageState, saveDelayGrantState } from '@/utils/storage'

const targetUrl = ref('')
const groupId = ref('')
const groupName = ref('')
const totalSeconds = ref(0)
const remainingSeconds = ref(0)
const grantMinutes = ref(DEFAULT_WAIT_GRANT_MINUTES)
let intervalId: ReturnType<typeof setInterval> | undefined

/** カウントダウンが完了しアクセス可能なら true。 */
const canContinue = computed(() => remainingSeconds.value <= 0 && targetUrl.value !== '')

/** 進捗バーの充填率（0-100）。 */
const progressPercent = computed(() => {
  if (totalSeconds.value <= 0) return 100
  const elapsed = totalSeconds.value - remainingSeconds.value
  return Math.min(100, Math.max(0, Math.round((elapsed / totalSeconds.value) * 100)))
})

/** query から待機秒数を取り出す。数値でなければ 0。 */
function parseSeconds(params: URLSearchParams): number {
  const raw = Number(params.get('seconds'))
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

/** query から通過後の許可期間（分）を取り出す。数値でなければ既定値。 */
function parseGrantMinutes(params: URLSearchParams): number {
  const raw = Number(params.get('grantMinutes'))
  return Number.isInteger(raw) && raw >= 1 ? raw : DEFAULT_WAIT_GRANT_MINUTES
}

/** カウントダウンを開始する。 */
function startCountdown(): void {
  if (remainingSeconds.value <= 0) return
  intervalId = setInterval(() => {
    remainingSeconds.value = Math.max(0, remainingSeconds.value - 1)
    if (remainingSeconds.value <= 0 && intervalId !== undefined) {
      clearInterval(intervalId)
      intervalId = undefined
    }
  }, 1000)
}

/** 待機を完了して対象 URL へ進む。許可枠を保存してから遷移する。 */
async function proceed(): Promise<void> {
  if (!canContinue.value) return
  const state = await loadDelayGrantState()
  state.delayGrantState[groupId.value] = {
    grantedUntil: Date.now() + grantMinutes.value * 60 * 1000,
  }
  await saveDelayGrantState(state)
  location.replace(targetUrl.value)
}

/** 直前のページへ戻る。 */
function goBack(): void {
  history.back()
}

onMounted(async () => {
  const params = new URLSearchParams(location.search)
  targetUrl.value = params.get('url') ?? ''
  groupId.value = params.get('group') ?? ''
  totalSeconds.value = parseSeconds(params)
  remainingSeconds.value = totalSeconds.value
  grantMinutes.value = parseGrantMinutes(params)

  const { effectiveSettings } = await loadPageState()
  groupName.value = effectiveSettings.groups.find((group) => group.id === groupId.value)?.name ?? ''

  startCountdown()
})

onUnmounted(() => {
  if (intervalId !== undefined) clearInterval(intervalId)
})
</script>

<template>
  <main class="min-h-screen bg-secondary/40 px-4 py-10 text-foreground sm:px-6">
    <section class="mx-auto max-w-2xl rounded-lg border border-border bg-background p-6 shadow-sm">
      <div class="flex items-start gap-3">
        <img src="/icon/48.png" alt="" aria-hidden="true" class="mt-0.5 size-8 shrink-0" />
        <div class="min-w-0">
          <h1 class="text-heading-lg">Take a moment</h1>
          <p class="mt-1 text-body-md text-secondary-foreground">
            <template v-if="groupName">
              This page is gated by "{{ groupName }}". Wait before continuing.
            </template>
            <template v-else>
              This page is gated by Regex URL Guard. Wait before continuing.
            </template>
          </p>
        </div>
      </div>

      <div class="mt-6 space-y-4">
        <div
          class="rounded-lg border border-border bg-surface-muted p-4"
          aria-label="Wait countdown"
        >
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-label-md text-secondary-foreground">Time remaining</span>
            <span
              class="font-mono text-heading-lg tabular-nums"
              aria-label="Remaining seconds"
              role="timer"
              >{{ remainingSeconds }}s</span
            >
          </div>
          <div
            class="mt-3 h-2 overflow-hidden rounded-sm bg-surface-subtle"
            role="meter"
            :aria-valuenow="progressPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded-sm bg-primary transition-[width] duration-1000 ease-linear"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>

        <InfoValue label="URL" aria-label="Waiting URL" break-all>
          {{ targetUrl || 'Unknown' }}
        </InfoValue>
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <BaseButton type="button" variant="secondary" class="h-10 px-4" @click="goBack">
          <ArrowUturnLeftIcon aria-hidden="true" class="size-4" />
          Back
        </BaseButton>
        <BaseButton
          type="button"
          variant="primary"
          class="h-10 px-4"
          :disabled="!canContinue"
          aria-label="Continue"
          @click="proceed"
        >
          Continue
          <ArrowRightIcon aria-hidden="true" class="size-4" />
        </BaseButton>
      </div>
    </section>
  </main>
</template>
