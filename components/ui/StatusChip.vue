<script setup lang="ts">
/** 非操作ステータス表示のprops。 */
interface Props {
  /** 通常または弱い表示色。 */
  kind?: 'default' | 'muted'
}

withDefaults(defineProps<Props>(), { kind: 'default' })
</script>

<template>
  <span
    class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-label-md"
    :class="kind === 'muted' ? 'text-muted' : 'text-secondary-foreground'"
    role="status"
  >
    <slot />
  </span>
</template>
