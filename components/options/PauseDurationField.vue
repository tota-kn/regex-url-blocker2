<script setup lang="ts">
import AlertMessage from '@/components/ui/AlertMessage.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import PendingFieldNote from './PendingFieldNote.vue'

/** Pause時間数値フィールドのprops。 */
interface Props {
  /** 入力前のラベル。 */
  label: string
  /** 入力後の単位。 */
  unit: string
  /** inputのaria-label。 */
  inputAriaLabel: string
  /** 最小値。 */
  min: number
  /** 入力を無効化するか。 */
  disabled?: boolean
  /** 検証エラー。 */
  error?: string
  /** 保留中の実効値説明。 */
  pending?: string
}

/** Pause時間フィールドのイベント。 */
interface Emits {
  /** 入力されたことを通知する。 */
  touch: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()
const model = defineModel<number>({ required: true })
</script>

<template>
  <div class="min-w-0">
    <label class="flex items-center gap-2 text-label-md text-secondary-foreground">
      <span class="shrink-0">{{ label }}</span>
      <NumberInput
        v-model="model"
        :min="min"
        step="1"
        :aria-label="inputAriaLabel"
        class="w-20"
        :disabled="disabled"
        :invalid="Boolean(error)"
        @input="emit('touch')"
      />
      <span class="shrink-0">{{ unit }}</span>
    </label>
    <AlertMessage v-if="error" class="mt-2">{{ error }}</AlertMessage>
    <PendingFieldNote v-if="pending">{{ pending }}</PendingFieldNote>
  </div>
</template>
