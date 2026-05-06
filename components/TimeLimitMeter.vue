<script setup lang="ts">
import { ClockIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import type { TimeLimitUsageSummary } from '@/utils/blocking'

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
  /** スクリーンリーダー向けのメーター名。 */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  remainingSec: undefined,
  compact: false,
  ariaLabel: 'Remaining time today',
})

const limitSec = computed(() => props.summary.limitMinutes * 60)
const displayedRemainingSec = computed(() => Math.max(0, Math.ceil(props.remainingSec ?? props.summary.remainingSec)))
const displayedConsumedSec = computed(() => Math.max(0, limitSec.value - displayedRemainingSec.value))
const usedPercent = computed(() => {
  if (limitSec.value <= 0) return 100
  return Math.min(100, Math.max(0, (displayedConsumedSec.value / limitSec.value) * 100))
})
const remainingPercent = computed(() => {
  if (limitSec.value <= 0) return 0
  return Math.min(100, Math.max(0, (displayedRemainingSec.value / limitSec.value) * 100))
})
const meterToneClass = computed(() => {
  if (displayedRemainingSec.value <= 0) return 'bg-destructive'
  if (remainingPercent.value <= 20) return 'bg-amber-500'
  return 'bg-primary'
})
const remainingTextClass = computed(() => {
  if (displayedRemainingSec.value <= 0) return 'text-destructive'
  if (remainingPercent.value <= 20) return 'text-amber-700'
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
    :aria-label="`${ariaLabel} summary`"
    :class="[
      'flex min-w-0 items-center gap-2 rounded-md border border-border bg-background',
      compact ? 'px-2.5 py-2' : 'px-3 py-2',
    ]"
  >
    <p class="flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase text-muted">
      <ClockIcon
        aria-hidden="true"
        class="size-3.5 shrink-0"
      />
      Daily limit
    </p>

    <p
      :class="[
        'shrink-0 font-semibold leading-none',
        compact ? 'text-sm' : 'text-base',
        remainingTextClass,
      ]"
    >
      {{ formatMinutesSeconds(displayedRemainingSec) }} left
    </p>

    <div
      role="meter"
      :aria-label="ariaLabel"
      :aria-valuemin="0"
      :aria-valuemax="limitSec"
      :aria-valuenow="displayedConsumedSec"
      class="h-2 min-w-12 flex-1 overflow-hidden rounded-sm bg-secondary"
    >
      <div
        aria-hidden="true"
        :class="['h-full rounded-sm transition-all', meterToneClass]"
        :style="{ width: `${usedPercent}%` }"
      />
    </div>

    <p class="shrink-0 text-xs text-muted">
      {{ formatMinutesSeconds(displayedConsumedSec) }} / {{ formatMinutesSeconds(limitSec) }}
    </p>
  </section>
</template>
