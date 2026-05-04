<template>
  <li class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
    <div class="flex-1 min-w-0">
      <p class="font-medium text-sm truncate">
        {{ group.name }}
      </p>
      <p class="text-xs text-gray-500">
        {{ consumedLabel }}
      </p>
    </div>
    <div class="flex items-center gap-1.5 ml-2 shrink-0">
      <span
        v-if="isBlocked"
        class="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-700 font-semibold"
      >ブロック中</span>
      <span
        v-else-if="!isInAllowedHours"
        class="px-1.5 py-0.5 text-xs rounded bg-orange-100 text-orange-700"
      >時間帯外</span>
      <span
        v-else
        class="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700"
      >許可中</span>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { decideGroupBlock } from '@/utils/block-decision'
import { isWithinAllowedHours } from '@/utils/time-of-day'
import { formatMSS } from '@/utils/format'
import type { Accumulator, Group } from '@/utils/types'

/**
 * GroupStatusRow のプロパティ定義。
 */
const props = defineProps<{
  /** 対象グループ */
  group: Group
  /** 当日の累積カウンタ（未計測なら undefined） */
  accumulator: Accumulator | undefined
  /** 現在時刻 */
  now: Date
}>()

const decision = computed(() => decideGroupBlock(props.group, props.accumulator, props.now))
const isBlocked = computed(() => decision.value.blocked)
const isInAllowedHours = computed(() =>
  props.group.allowedHours.length === 0 || isWithinAllowedHours(props.now, props.group.allowedHours),
)

const consumedLabel = computed(() => {
  const consumed = formatMSS(props.accumulator?.consumedSec ?? 0)
  if (props.group.dailyTimeLimitMinutes === null) return `${consumed} / 無制限`
  const limit = formatMSS(props.group.dailyTimeLimitMinutes * 60)
  return `${consumed} / ${limit}`
})
</script>
