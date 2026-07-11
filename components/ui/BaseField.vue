<script setup lang="ts">
import AlertMessage from '@/components/ui/AlertMessage.vue'

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
      class="mb-1.5 flex items-center gap-1.5 text-label-md text-secondary-foreground"
    >
      <slot name="icon" />
      {{ label }}
    </span>
    <slot />
    <span v-if="description" class="mt-1 block text-body-sm text-muted-foreground">
      {{ description }}
    </span>
    <AlertMessage v-if="error" class="mt-2" :message="error" />
  </label>
</template>
