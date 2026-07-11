<script setup lang="ts">
import { computed } from 'vue'

/**
 * 共通ボタンの見た目の種類。
 */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'

/**
 * 共通ボタンのサイズ。
 */
type ButtonSize = 'sm' | 'md' | 'icon-sm' | 'icon-md'

/**
 * 共通ボタンの props。
 */
interface Props {
  /** ボタンの visual variant。 */
  variant?: ButtonVariant
  /** ボタンのサイズ。 */
  size?: ButtonSize
  /** ボタンを disabled にするかどうか。 */
  disabled?: boolean
  /** aria-pressed を付与する場合の値。 */
  pressed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  pressed: undefined,
})

const baseClass =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-label-md transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50'

const sizeClass = computed(
  () =>
    ({
      sm: 'h-8 px-2.5',
      md: 'h-9 px-3',
      'icon-sm': 'size-8',
      'icon-md': 'size-9',
    })[props.size],
)

const variantClass = computed(
  () =>
    ({
      primary: 'bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-ring',
      secondary:
        'border border-border bg-surface text-secondary-foreground hover:bg-secondary-hover focus:ring-ring',
      ghost: 'border border-primary/30 bg-transparent text-primary hover:bg-accent focus:ring-ring',
      danger: 'bg-danger text-danger-foreground hover:bg-danger-hover focus:ring-danger-border',
      'danger-ghost':
        'border border-danger-border bg-surface text-danger hover:bg-danger-subtle focus:ring-danger-border',
    })[props.variant],
)
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :aria-pressed="pressed"
    :class="[baseClass, sizeClass, variantClass]"
  >
    <slot />
  </button>
</template>
