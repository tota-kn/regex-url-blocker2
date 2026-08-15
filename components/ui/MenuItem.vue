<script setup lang="ts">
/** メニュー項目のprops。 */
interface Props {
  /** 通常または危険操作の表示。 */
  variant?: 'default' | 'danger'
}

withDefaults(defineProps<Props>(), { variant: 'default' })
</script>

<template>
  <button
    type="button"
    role="menuitem"
    class="flex h-9 w-full items-center gap-2 px-3 text-left text-label-md transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    :class="
      variant === 'danger'
        ? 'text-danger hover:bg-danger-subtle focus:bg-danger-subtle'
        : 'text-secondary-foreground hover:bg-secondary-hover focus:bg-secondary-hover'
    "
  >
    <slot />
  </button>
</template>
