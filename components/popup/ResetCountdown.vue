<template>
  <p class="text-xs text-gray-500 text-right">
    次のリセットまで {{ countdown }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatHMMSS } from '@/utils/format'
import { msUntilNextLogicalDay } from '@/utils/logical-day'

/**
 * ResetCountdown のプロパティ定義。
 */
const props = defineProps<{
  /** 現在時刻 */
  now: Date
  /** リセット時刻 `HH:MM` */
  resetHour: string
}>()

const countdown = computed(() => {
  const ms = msUntilNextLogicalDay(props.now, props.resetHour)
  return formatHMMSS(Math.floor(ms / 1000))
})
</script>
