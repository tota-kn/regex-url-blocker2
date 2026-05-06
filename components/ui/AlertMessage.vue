<script setup lang="ts">
/**
 * アラートメッセージの props。
 */
interface Props {
  /** 表示内容。 */
  message?: string | number
}

defineProps<Props>()
</script>

<template>
  <p class="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
    <slot>{{ message }}</slot>
  </p>
</template>
