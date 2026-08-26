<script setup lang="ts">
import { computed, ref } from 'vue'
import { fieldStateClasses, type FieldDisplay } from '@/utils/fieldClasses'

defineOptions({
  inheritAttrs: false,
})

/**
 * 入力欄のサイズ。
 */
type InputSize = 'sm' | 'md'

/**
 * 共通入力欄の props。
 */
interface Props {
  type?: string
  /** 編集中か読み取り表示か。 */
  display?: FieldDisplay
  size?: InputSize
  monospace?: boolean
  /** エラー状態の見た目にするかどうか。 */
  invalid?: boolean
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
const inputRef = ref<HTMLInputElement | null>(null)

const sizeClass = computed(
  () =>
    ({
      sm: 'h-8 px-2',
      md: 'h-10 px-3',
    })[props.size],
)

const stateClass = computed(() => fieldStateClasses(props))

/** input イベントの値を v-model に反映する。 */
function onInput(event: Event): void {
  modelValue.value = (event.target as HTMLInputElement).value
}

/** 入力要素へプログラムからフォーカスする。 */
function focus(): void {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <input
    ref="inputRef"
    v-bind="$attrs"
    :type="type"
    :value="modelValue"
    :disabled="disabled"
    class="min-w-0 rounded-lg border text-body-md outline-none transition"
    :class="[sizeClass, stateClass, monospace ? 'font-mono' : '']"
    @input="onInput"
  />
</template>
