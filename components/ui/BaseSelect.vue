<script setup lang="ts">
import { computed } from 'vue'
import { fieldStateClasses } from '@/utils/fieldClasses'

defineOptions({
  inheritAttrs: false,
})

/** 共通選択欄のサイズ。 */
type SelectSize = 'sm' | 'md'

/** 共通選択欄の props。 */
interface Props {
  /** 選択欄の高さと左右余白。 */
  size?: SelectSize
  /** エラー状態の見た目にするか。 */
  invalid?: boolean
  /** 操作を無効化するか。 */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  invalid: false,
  disabled: false,
})

const modelValue = defineModel<string | number>()

const sizeClass = computed(
  () =>
    ({
      sm: 'h-8 px-2',
      md: 'h-10 px-3',
    })[props.size],
)

const stateClass = computed(() => fieldStateClasses(props))

/** change イベントの値を v-model に反映する。 */
function onChange(event: Event): void {
  modelValue.value = (event.target as HTMLSelectElement).value
}
</script>

<template>
  <select
    v-bind="$attrs"
    :value="modelValue"
    :disabled="disabled"
    class="min-w-0 rounded-lg border text-body-md outline-none transition"
    :class="[sizeClass, stateClass]"
    @change="onChange"
  >
    <slot />
  </select>
</template>
