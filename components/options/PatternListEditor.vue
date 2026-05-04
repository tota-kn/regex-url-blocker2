<template>
  <div class="space-y-2">
    <div
      v-for="(pattern, i) in localPatterns"
      :key="i"
      class="flex flex-col gap-1"
    >
      <div class="flex gap-2 items-center">
        <input
          :value="pattern"
          type="text"
          class="flex-1 px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          :class="errors[i] ? 'border-red-400' : 'border-gray-300'"
          :aria-label="`正規表現パターン ${i + 1}`"
          :data-testid="`pattern-input-${i}`"
          placeholder="例: .*twitter\.com.*"
          @input="onInput(i, ($event.target as HTMLInputElement).value)"
        >
        <button
          class="px-2 py-1.5 text-sm text-red-600 hover:text-red-800 focus:outline-none"
          :aria-label="`パターン ${i + 1} を削除`"
          @click="remove(i)"
        >
          削除
        </button>
      </div>
      <p
        v-if="errors[i]"
        class="text-xs text-red-600"
        :data-testid="`pattern-error-${i}`"
      >
        {{ errors[i] }}
      </p>
    </div>
    <button
      class="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none"
      aria-label="正規表現パターンを追加"
      @click="add"
    >
      ＋ パターンを追加
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { validatePattern } from '@/utils/regex-match'

/**
 * PatternListEditor のプロパティ定義。
 */
const props = defineProps<{
  /** 正規表現パターン文字列の配列 */
  patterns: string[]
}>()

const emit = defineEmits<{
  /** パターン変更時に発火 */
  'update:patterns': [patterns: string[]]
  /** バリデーションエラーの有無 */
  'update:hasError': [hasError: boolean]
}>()

const localPatterns = ref<string[]>([...props.patterns])
const errors = ref<(string | null)[]>(props.patterns.map(() => null))

watch(() => props.patterns, (p) => {
  localPatterns.value = [...p]
  errors.value = p.map(() => null)
})

/**
 * 指定インデックスのパターンを更新し、バリデーションを実行する。
 */
const onInput = (i: number, value: string) => {
  localPatterns.value[i] = value
  const result = validatePattern(value)
  errors.value[i] = result.ok ? null : result.message
  const hasError = errors.value.some(e => e !== null)
  emit('update:patterns', [...localPatterns.value])
  emit('update:hasError', hasError)
}

/**
 * 新しいパターン行を追加する。
 */
const add = () => {
  localPatterns.value.push('')
  errors.value.push(null)
  emit('update:patterns', [...localPatterns.value])
}

/**
 * 指定インデックスのパターンを削除する。
 */
const remove = (i: number) => {
  localPatterns.value.splice(i, 1)
  errors.value.splice(i, 1)
  const hasError = errors.value.some(e => e !== null)
  emit('update:patterns', [...localPatterns.value])
  emit('update:hasError', hasError)
}
</script>
