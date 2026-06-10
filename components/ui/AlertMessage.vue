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
  <span class="block rounded-lg bg-danger-subtle px-3 py-2 text-body-md text-danger">
    <slot>{{ message }}</slot>
  </span>
</template>
