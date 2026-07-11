<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  inheritAttrs: false,
})

/**
 * 入力欄の表示モード。
 */
type InputDisplay = 'editable' | 'readonly'

/**
 * 入力欄のサイズ。
 */
type InputSize = 'sm' | 'md'

/**
 * 共通入力欄の props。
 */
interface Props {
  /** input の type 属性。 */
  type?: string
  /** 編集中か読み取り表示か。 */
  display?: InputDisplay
  /** 入力欄のサイズ。 */
  size?: InputSize
  /** 等幅フォントにするかどうか。 */
  monospace?: boolean
  /** エラー状態の見た目にするかどうか。 */
  invalid?: boolean
  /** disabled 属性。 */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  display: 'editable',
  size: 'md',
  monospace: false,
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

const stateClass = computed(() => {
  if (props.display === 'readonly') {
    return 'cursor-default border-transparent bg-field-readonly text-input-foreground disabled:opacity-100'
  }
  if (props.disabled) {
    return 'border-field-border bg-field-disabled text-muted-foreground'
  }
  if (props.invalid) {
    return 'border-danger-border bg-field text-input-foreground focus:border-danger focus:ring-2 focus:ring-danger-border/70 hover:bg-field-hover'
  }
  return 'border-field-border bg-field text-input-foreground focus:border-primary focus:ring-2 focus:ring-ring/50 hover:bg-field-hover hover:border-field-border-hover'
})

/** input イベントの値を v-model に反映する。 */
function onInput(event: Event): void {
  modelValue.value = (event.target as HTMLInputElement).value
}
</script>

<template>
  <input
    v-bind="$attrs"
    :type="type"
    :value="modelValue"
    :disabled="disabled"
    class="min-w-0 rounded-lg border text-body-md outline-none transition"
    :class="[sizeClass, stateClass, monospace ? 'font-mono' : '']"
    @input="onInput"
  />
</template>
