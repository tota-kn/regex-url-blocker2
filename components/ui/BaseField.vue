<script setup lang="ts">
/**
 * 入力フィールド外枠の props。
 */
interface Props {
  /** 表示ラベル。 */
  label?: string
  /** エラーメッセージ。 */
  error?: string
  /** 補足説明。 */
  description?: string
}

defineProps<Props>()
</script>

<template>
  <label class="block min-w-0">
    <span
      v-if="label"
      class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-secondary-foreground"
    >
      <slot name="icon" />
      {{ label }}
    </span>
    <slot />
    <span
      v-if="description"
      class="mt-1 block text-xs text-muted-foreground"
    >
      {{ description }}
    </span>
    <span
      v-if="error"
      class="mt-2 block rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
    >
      {{ error }}
    </span>
  </label>
</template>
