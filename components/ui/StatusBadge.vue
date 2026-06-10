<script setup lang="ts">
/**
 * 状態バッジの props。
 */
interface Props {
  /** バッジの配色種別。 */
  kind: 'danger' | 'warning' | 'muted'
}

defineProps<Props>()

/** 配色種別ごとの Tailwind クラス。 */
const kindClasses: Record<Props['kind'], string> = {
  danger: 'border-danger-border bg-danger-subtle text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning-text',
  muted: 'border-border bg-surface-subtle text-secondary-foreground',
}
</script>

<template>
  <span :class="['rounded-sm border px-1.5 py-1 text-label-sm', kindClasses[kind]]">
    <slot />
  </span>
</template>
