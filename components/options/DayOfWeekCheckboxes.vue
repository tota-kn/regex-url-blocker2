<script setup lang="ts">
import type { DayOfWeek } from '@/utils/types'

/**
 * 曜日チェックボックスで編集する曜日番号配列。
 */
const daysOfWeek = defineModel<DayOfWeek[]>({ required: true })

const DAY_LABELS: { value: DayOfWeek, label: string }[] = [
  { value: 0, label: '日' },
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
]

/** チェックボックスのトグルで `daysOfWeek` を昇順に保ったまま追加/削除する。 */
function toggleDay(day: DayOfWeek): void {
  const idx = daysOfWeek.value.indexOf(day)
  if (idx >= 0) {
    daysOfWeek.value.splice(idx, 1)
  }
  else {
    daysOfWeek.value = [...daysOfWeek.value, day].sort((a, b) => a - b)
  }
}
</script>

<template>
  <fieldset class="space-y-1">
    <legend class="text-sm">
      曜日（未選択=毎日）
    </legend>
    <div class="flex flex-wrap gap-2">
      <label
        v-for="d in DAY_LABELS"
        :key="d.value"
        class="flex items-center gap-1 text-sm"
      >
        <input
          type="checkbox"
          :aria-label="d.label"
          :checked="daysOfWeek.includes(d.value)"
          @change="toggleDay(d.value)"
        >
        <span>{{ d.label }}</span>
      </label>
    </div>
  </fieldset>
</template>
