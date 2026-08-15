<script setup lang="ts">
import { ClockIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import type { TimeLimitUsageSummary } from '@/utils/usageCounters'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * 残り時間メーターの props。
 */
interface Props {
  /** 今日の閲覧上限と消費状況。 */
  summary: TimeLimitUsageSummary
  /** 表示に使う残り秒数。省略時は summary.remainingSec を使う。 */
  remainingSec?: number
  /** 狭い表示領域向けに余白と文字サイズを抑えるかどうか。 */
  compact?: boolean
  showLabel?: boolean
  /** スクリーンリーダー向けのメーター名。 */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  remainingSec: undefined,
  compact: false,
  showLabel: true,
  ariaLabel: 'Remaining time today',
})

const limitSec = computed(() => props.summary.limitMinutes * 60)
const displayedRemainingSec = computed(() =>
  Math.max(0, Math.ceil(props.remainingSec ?? props.summary.remainingSec)),
)
const displayedConsumedSec = computed(() =>
  Math.max(0, limitSec.value - displayedRemainingSec.value),
)
const remainingPercent = computed(() => {
  if (limitSec.value <= 0) return 0
  return Math.min(100, Math.max(0, (displayedRemainingSec.value / limitSec.value) * 100))
})
const meterToneClass = computed(() => {
  if (displayedRemainingSec.value <= 0) return 'bg-danger'
  if (remainingPercent.value <= 20) return 'bg-warning'
  return 'bg-primary'
})
const remainingTextClass = computed(() => {
  if (displayedRemainingSec.value <= 0) return 'text-danger'
  if (remainingPercent.value <= 20) return 'text-warning-text'
  return 'text-foreground'
})

/**
 * 秒数を mm:ss 形式に変換する。
 */
function formatMinutesSeconds(seconds: number): string {
  const roundedSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(roundedSeconds / 60)
  const remainingSeconds = String(roundedSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}
</script>

<template>
  <section
    :aria-label="t('{label} summary', { label: ariaLabel })"
    :class="[
      'flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background',
      compact ? 'px-2.5 py-2' : 'px-3 py-2',
    ]"
  >
    <p
      v-if="showLabel"
      class="flex shrink-0 items-center gap-1.5 text-label-sm uppercase text-muted"
    >
      <ClockIcon aria-hidden="true" class="size-3.5 shrink-0" />
      {{ t('Daily limit') }}
    </p>

    <p
      :class="[
        'shrink-0 font-semibold leading-none',
        compact ? 'text-label-md' : 'text-heading-md',
        remainingTextClass,
      ]"
    >
      {{ t('{time} left', { time: formatMinutesSeconds(displayedRemainingSec) }) }}
    </p>

    <ProgressBar
      :aria-label="ariaLabel"
      :value="displayedConsumedSec"
      :max="limitSec"
      :indicator-class="`transition-all ${meterToneClass}`"
      class="min-w-12 flex-1 bg-secondary"
    />

    <p class="shrink-0 text-body-sm text-muted">
      {{ formatMinutesSeconds(displayedConsumedSec) }} / {{ formatMinutesSeconds(limitSec) }}
    </p>
  </section>
</template>
