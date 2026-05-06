<script setup lang="ts">
/**
 * セグメント選択肢。
 */
interface SegmentOption {
  /** v-model に入る値。 */
  value: string
  /** 表示ラベル。 */
  label: string
  /** aria-label。未指定なら label を使う。 */
  ariaLabel?: string
}

/**
 * セグメントコントロールの props。
 */
interface Props {
  /** 選択肢一覧。 */
  options: SegmentOption[]
  /** 編集可能かどうか。 */
  editable?: boolean
  /** 読み取り時に選択済み項目だけ表示するかどうか。 */
  showSelectedOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  showSelectedOnly: false,
})

const modelValue = defineModel<string>({ required: true })

/** 指定選択肢を表示するかどうかを返す。 */
function isVisible(option: SegmentOption): boolean {
  return props.editable || !props.showSelectedOnly || option.value === modelValue.value
}

/** 指定値を選択する。 */
function selectValue(value: string): void {
  if (!props.editable) return
  modelValue.value = value
}
</script>

<template>
  <div
    class="inline-grid overflow-hidden rounded-md border text-sm"
    :class="editable ? 'border-border bg-surface-muted p-1' : 'border-transparent bg-transparent'"
    :style="{ gridTemplateColumns: `repeat(${options.filter(isVisible).length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="option in options.filter(isVisible)"
      :key="option.value"
      type="button"
      :aria-label="option.ariaLabel ?? option.label"
      :aria-pressed="option.value === modelValue"
      :disabled="!editable"
      class="inline-flex h-8 items-center justify-center gap-1 rounded-sm px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-default disabled:opacity-100"
      :class="editable
        ? option.value === modelValue
          ? 'bg-surface text-foreground shadow-sm'
          : 'text-secondary-foreground hover:bg-secondary-hover'
        : 'rounded-md border border-border bg-surface text-secondary-foreground'"
      @click="selectValue(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
