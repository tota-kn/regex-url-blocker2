<script setup lang="ts">
/** 淡い背景の補助パネルprops。 */
interface Props {
  /** 描画するHTML要素。 */
  as?: 'div' | 'article'
}

withDefaults(defineProps<Props>(), { as: 'div' })
</script>

<template>
  <component :is="as" class="rounded-lg border border-border bg-surface-muted">
    <slot />
  </component>
</template>
