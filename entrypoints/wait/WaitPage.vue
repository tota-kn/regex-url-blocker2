<script setup lang="ts">
import { ArrowRightIcon, ArrowUturnLeftIcon } from '@heroicons/vue/24/outline'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import InfoValue from '@/components/ui/InfoValue.vue'
import PageShell from '@/components/ui/PageShell.vue'
import AccessChallenge from '@/components/wait/AccessChallenge.vue'
import { normalizeChallenge, mergeChallenges } from '@/utils/accessChallenge'
import type { AccessChallenge as Challenge } from '@/utils/types'
import { DEFAULT_WAIT_GRANT_MINUTES } from '@/utils/defaults'
import { loadDelayGrantState, saveDelayGrantState } from '@/utils/storage'
import { useCountdown } from '@/utils/useCountdown'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const challenges = ref<Challenge[]>([])
const challengeIndex = ref(0)
const currentChallenge = computed(() => challenges.value[challengeIndex.value])
const targetUrl = ref('')
const groupId = ref('')
const totalSeconds = ref(0)
const grantMinutes = ref(DEFAULT_WAIT_GRANT_MINUTES)
const totalMilliseconds = computed(() => totalSeconds.value * 1_000)
const {
  remainingSeconds,
  isReady,
  start: startCountdown,
  stop: stopCountdown,
} = useCountdown(totalMilliseconds, 250)

/** カウントダウンが完了しアクセス可能なら true。 */
const canContinue = computed(
  () => isReady.value && !currentChallenge.value && targetUrl.value !== '',
)

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

onMounted(() => {
  const params = new URLSearchParams(location.search)
  targetUrl.value = params.get('url') ?? ''
  groupId.value = params.get('group') ?? ''
  totalSeconds.value = parseSeconds(params)
  grantMinutes.value = parseGrantMinutes(params)

  try {
    const raw: unknown = JSON.parse(params.get('challenges') ?? '[]')
    if (Array.isArray(raw))
      challenges.value = mergeChallenges(
        raw.slice(0, 100).flatMap((item) => {
          const challenge = normalizeChallenge(item)
          return challenge ? [challenge] : []
        }),
      )
  } catch {
    // 不正なクエリでも既存の時間待機は維持する。
    challenges.value = []
  }
  startCountdown()
})

onUnmounted(() => {
  stopCountdown()
})
</script>

<template>
  <PageShell :title="t('Take a moment')">
    <div class="mt-6">
      <InfoValue label="URL" :aria-label="t('Waiting URL')" break-all>
        {{ targetUrl || t('Unknown') }}
      </InfoValue>
    </div>

    <AccessChallenge
      v-if="currentChallenge"
      :key="challengeIndex"
      :challenge="currentChallenge"
      @complete="challengeIndex++"
    />

    <div class="mt-6 flex flex-wrap justify-end gap-2">
      <BaseButton type="button" variant="secondary" size="lg" @click="goBack">
        <ArrowUturnLeftIcon aria-hidden="true" class="size-4" />
        {{ t('Back') }}
      </BaseButton>
      <BaseButton
        type="button"
        variant="primary"
        size="lg"
        :disabled="!canContinue"
        @click="proceed"
      >
        <span class="tabular-nums"
          >{{ t('Continue') }}{{ isReady ? '' : `(${remainingSeconds})` }}</span
        >
        <ArrowRightIcon aria-hidden="true" class="size-4" />
      </BaseButton>
    </div>
  </PageShell>
</template>
