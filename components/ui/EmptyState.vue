<script setup lang="ts">
/**
 * 空状態表示の props。
 */
interface Props {
  /** aria-label。 */
  ariaLabel?: string
  /** 中央寄せで大きめに表示するかどうか。 */
  spacious?: boolean
}

withDefaults(defineProps<Props>(), {
  ariaLabel: undefined,
  spacious: false,
})
</script>

<template>
  <p
    :aria-label="ariaLabel"
    class="rounded-md border border-dashed border-border bg-surface-muted text-sm text-muted-foreground"
    :class="spacious ? 'p-8 text-center' : 'px-3 py-2'"
  >
    <slot />
  </p>
</template>
