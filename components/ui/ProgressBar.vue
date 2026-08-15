<script setup lang="ts">
import { computed } from 'vue'

/** 共通進捗バーの props。 */
interface Props {
  /** 現在値。 */
  value: number
  /** 最小値。 */
  min?: number
  /** 最大値。 */
  max?: number
  /** スクリーンリーダー向け名称。 */
  ariaLabel?: string
  /** 充填部分へ追加する色・transition class。 */
  indicatorClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  ariaLabel: undefined,
  indicatorClass: 'bg-primary transition-all',
})

const percent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 100
  return Math.min(100, Math.max(0, ((props.value - props.min) / range) * 100))
})
</script>

<template>
  <div
    role="meter"
    :aria-label="ariaLabel"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="value"
    class="h-2 overflow-hidden rounded-sm bg-surface-subtle"
  >
    <div
      aria-hidden="true"
      :class="['h-full rounded-sm', indicatorClass]"
      :style="{ width: `${percent}%` }"
    />
  </div>
</template>
