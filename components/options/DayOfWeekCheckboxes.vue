<script setup lang="ts">
import type { DayOfWeek } from '@/utils/types'

/**
 * 曜日チェックボックスで編集する曜日番号配列。
 */
const daysOfWeek = defineModel<DayOfWeek[]>({ required: true })

const DAY_LABELS: { value: DayOfWeek, label: string, ariaLabel: string }[] = [
  { value: 0, label: 'Sun', ariaLabel: 'Sunday' },
  { value: 1, label: 'Mon', ariaLabel: 'Monday' },
  { value: 2, label: 'Tue', ariaLabel: 'Tuesday' },
  { value: 3, label: 'Wed', ariaLabel: 'Wednesday' },
  { value: 4, label: 'Thu', ariaLabel: 'Thursday' },
  { value: 5, label: 'Fri', ariaLabel: 'Friday' },
  { value: 6, label: 'Sat', ariaLabel: 'Saturday' },
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
  <fieldset class="space-y-2">
    <legend class="text-sm font-medium text-secondary-foreground">
      Days
    </legend>
    <div class="flex flex-wrap gap-2">
      <label
        v-for="d in DAY_LABELS"
        :key="d.value"
        :class="daysOfWeek.includes(d.value)
          ? 'inline-flex h-8 items-center gap-1.5 rounded-md border border-tag-selected-border bg-tag-selected-bg px-2.5 text-sm font-medium text-tag-selected-text'
          : 'inline-flex h-8 items-center gap-1.5 rounded-md border border-tag-default-border bg-tag-default-bg px-2.5 text-sm font-medium text-tag-default-text hover:bg-secondary-hover'"
      >
        <input
          type="checkbox"
          :aria-label="d.ariaLabel"
          :checked="daysOfWeek.includes(d.value)"
          class="size-3.5 accent-primary"
          @change="toggleDay(d.value)"
        >
        <span>{{ d.label }}</span>
      </label>
    </div>
  </fieldset>
</template>
