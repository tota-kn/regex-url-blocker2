<script setup lang="ts">
import { ClockIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { TimeLimit } from '@/utils/types'
import DayOfWeekCheckboxes from './DayOfWeekCheckboxes.vue'

/**
 * 上限編集コンポーネントの props。
 */
interface Props {
  /** 指定上限番号・サブフィールドのエラーメッセージを返す関数。 */
  error: (index: number, subField: string) => string | undefined
}

defineProps<Props>()

/**
 * グループに属する閲覧上限配列。
 */
const timeLimits = defineModel<TimeLimit[]>({ required: true })

/** 既定値の閲覧上限を追加する。 */
function addTimeLimit(): void {
  timeLimits.value.push({ daysOfWeek: [], dailyMinutes: 30 })
}

/** number input の文字列値を timeLimit の `dailyMinutes` に反映する。 */
function setTimeLimitMinutes(limit: TimeLimit, value: string): void {
  limit.dailyMinutes = value === '' ? 0 : Number(value)
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-1.5 text-sm font-medium">
        <ClockIcon
          aria-hidden="true"
          class="size-4"
        />
        Limits
      </h3>
      <button
        type="button"
        aria-label="Add limit"
        class="inline-flex items-center gap-1 text-primary text-sm"
        @click="addTimeLimit"
      >
        <PlusIcon
          aria-hidden="true"
          class="size-4"
        />
        Limit
      </button>
    </div>
    <p
      v-if="timeLimits.length === 0"
      aria-label="No limits"
      class="text-muted text-sm"
    >
      Empty
    </p>
    <div
      v-for="(limit, i) in timeLimits"
      :key="i"
      class="border border-border rounded-md p-3 space-y-2"
    >
      <DayOfWeekCheckboxes v-model="limit.daysOfWeek" />
      <p
        v-if="error(i, 'daysOfWeek')"
        class="text-destructive text-sm"
      >
        {{ error(i, 'daysOfWeek') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1">
          <span class="text-sm">min/day</span>
          <input
            type="number"
            min="0"
            aria-label="Limit minutes"
            :value="limit.dailyMinutes"
            class="border border-input-border bg-input rounded-md px-2 py-1 w-28"
            @input="setTimeLimitMinutes(limit, ($event.target as HTMLInputElement).value)"
          >
        </label>
        <button
          type="button"
          aria-label="Delete limit"
          title="Delete"
          class="ml-auto inline-flex size-8 items-center justify-center rounded-md text-destructive hover:bg-muted"
          @click="timeLimits.splice(i, 1)"
        >
          <TrashIcon
            aria-hidden="true"
            class="size-4"
          />
        </button>
      </div>
      <p
        v-if="error(i, 'dailyMinutes')"
        class="text-destructive text-sm"
      >
        {{ error(i, 'dailyMinutes') }}
      </p>
    </div>
  </div>
</template>
