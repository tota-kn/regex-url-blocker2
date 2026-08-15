<script setup lang="ts">
import BaseInput from './BaseInput.vue'

defineOptions({ inheritAttrs: false })

/** 数値入力のprops。 */
interface Props {
  /** 入力を無効化するか。 */
  disabled?: boolean
  /** エラー表示にするか。 */
  invalid?: boolean
}

withDefaults(defineProps<Props>(), { disabled: false, invalid: false })
const model = defineModel<number>({ required: true })

/** 文字入力をnumberへ変換し、空欄はNaNとして保持する。 */
function update(value: string | number | undefined): void {
  const text = String(value ?? '')
  model.value = text === '' ? Number.NaN : Number(text)
}
</script>

<template>
  <BaseInput
    v-bind="$attrs"
    type="number"
    :model-value="Number.isFinite(model) ? String(model) : ''"
    :disabled="disabled"
    :invalid="invalid"
    @update:model-value="update"
  />
</template>
