<script setup lang="ts">
import AlertMessage from '@/components/ui/AlertMessage.vue'

/**
 * 入力フィールド外枠の props。
 */
interface Props {
  label?: string
  error?: string
  description?: string
  /** 見出しとしてラベルを強調するか。 */
  emphasis?: boolean
  /** 外枠に使う HTML 要素。 */
  as?: 'label' | 'div'
}

withDefaults(defineProps<Props>(), {
  emphasis: false,
  as: 'label',
})
</script>

<template>
  <component :is="as" class="block min-w-0">
    <span
      v-if="label"
      class="mb-1.5 flex items-center gap-1.5 text-label-md text-secondary-foreground"
      :class="emphasis ? 'font-semibold' : ''"
    >
      <slot name="icon" />
      {{ label }}
    </span>
    <slot />
    <span v-if="description" class="mt-1 block text-body-sm text-muted-foreground">
      {{ description }}
    </span>
    <AlertMessage v-if="error" class="mt-2" :message="error" />
  </component>
</template>
