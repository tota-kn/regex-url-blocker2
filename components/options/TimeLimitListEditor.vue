<script setup lang="ts">
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
      <h3 class="text-sm font-medium">
        上限
      </h3>
      <button
        type="button"
        class="text-primary text-sm"
        @click="addTimeLimit"
      >
        + 上限追加
      </button>
    </div>
    <p
      v-if="timeLimits.length === 0"
      class="text-muted text-sm"
    >
      なし
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
          <span class="text-sm">上限（分/日）</span>
          <input
            type="number"
            min="0"
            aria-label="上限分数"
            :value="limit.dailyMinutes"
            class="border border-input-border bg-input rounded-md px-2 py-1 w-28"
            @input="setTimeLimitMinutes(limit, ($event.target as HTMLInputElement).value)"
          >
        </label>
        <button
          type="button"
          class="text-destructive text-sm ml-auto"
          @click="timeLimits.splice(i, 1)"
        >
          削除
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
