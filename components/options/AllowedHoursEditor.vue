<template>
  <div class="space-y-2">
    <p
      v-if="localRanges.length === 0"
      class="text-sm text-gray-500 italic"
    >
      設定なし（24 時間 OK）
    </p>
    <div
      v-for="(range, i) in localRanges"
      :key="i"
      class="flex items-center gap-2"
    >
      <input
        v-model="localRanges[i].start"
        type="time"
        class="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        :aria-label="`許可時間帯 ${i + 1} 開始`"
        @change="emit('update:allowedHours', localRanges.map(r => ({ ...r })))"
      >
      <span class="text-gray-500">–</span>
      <input
        v-model="localRanges[i].end"
        type="time"
        class="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        :aria-label="`許可時間帯 ${i + 1} 終了`"
        @change="emit('update:allowedHours', localRanges.map(r => ({ ...r })))"
      >
      <span
        v-if="localRanges[i].end !== '' && localRanges[i].start !== '' && localRanges[i].end <= localRanges[i].start"
        class="text-xs text-blue-600"
      >日跨ぎ</span>
      <button
        class="text-sm text-red-600 hover:text-red-800 focus:outline-none"
        :aria-label="`時間帯 ${i + 1} を削除`"
        @click="remove(i)"
      >
        削除
      </button>
    </div>
    <button
      class="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none"
      aria-label="許可時間帯を追加"
      @click="add"
    >
      ＋ 時間帯を追加
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AllowedHourRange } from '@/utils/types'

/**
 * AllowedHoursEditor のプロパティ定義。
 */
const props = defineProps<{
  /** 許可時間帯の配列 */
  allowedHours: AllowedHourRange[]
}>()

const emit = defineEmits<{
  /** 時間帯変更時に発火 */
  'update:allowedHours': [ranges: AllowedHourRange[]]
}>()

const localRanges = ref<AllowedHourRange[]>(props.allowedHours.map(r => ({ ...r })))

watch(() => props.allowedHours, (ranges) => {
  localRanges.value = ranges.map(r => ({ ...r }))
})

/**
 * 新しい時間帯行を追加する。
 */
const add = () => {
  localRanges.value.push({ start: '09:00', end: '18:00' })
  emit('update:allowedHours', localRanges.value.map(r => ({ ...r })))
}

/**
 * 指定インデックスの時間帯を削除する。
 */
const remove = (i: number) => {
  localRanges.value.splice(i, 1)
  emit('update:allowedHours', localRanges.value.map(r => ({ ...r })))
}
</script>
