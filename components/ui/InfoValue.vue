<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

/**
 * 読み取り専用値表示の props。
 */
interface Props {
  /** ラベル。 */
  label?: string
  /** 値を折り返すかどうか。 */
  breakAll?: boolean
}

withDefaults(defineProps<Props>(), {
  label: undefined,
  breakAll: false,
})
</script>

<template>
  <div>
    <h2
      v-if="label"
      class="text-sm font-medium text-secondary-foreground"
    >
      {{ label }}
    </h2>
    <p
      v-bind="$attrs"
      class="mt-1 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground"
      :class="breakAll ? 'break-all' : ''"
    >
      <slot />
    </p>
  </div>
</template>
