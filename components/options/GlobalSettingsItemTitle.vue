<script setup lang="ts">
/**
 * General settings 内の項目見出し props。
 */
interface Props {
  label: string
}

defineProps<Props>()
</script>

<template>
  <span
    class="mb-1.5 flex items-center gap-1.5 text-label-md font-semibold text-secondary-foreground"
  >
    <slot name="icon" />
    {{ label }}
  </span>
</template>
