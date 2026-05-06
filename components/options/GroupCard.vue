<script setup lang="ts">
import { ClockIcon, PencilSquareIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { TimeLimitUsageSummary } from '@/utils/blocking'
import type { Group } from '@/utils/types'
import LimitRulesEditor from './LimitRulesEditor.vue'
import PatternListEditor from './PatternListEditor.vue'

/**
 * グループカードの props。
 */
interface Props {
  /** 指定フィールドのグループエラーメッセージを返す関数。 */
  error: (field: string) => string | undefined
  /** 指定パターン番号のエラーメッセージを返す関数。 */
  patternError: (index: number) => string | undefined
  /** 指定ブロック時間帯番号・サブフィールドのエラーメッセージを返す関数。 */
  blockedTimeSlotError: (index: number, subField: string) => string | undefined
  /** 指定上限番号・サブフィールドのエラーメッセージを返す関数。 */
  timeLimitError: (index: number, subField: string) => string | undefined
  /** 今日の上限利用状況。今日有効な上限がなければ undefined。 */
  timeLimitUsageSummary?: TimeLimitUsageSummary
}

/**
 * グループカードが親へ通知するイベント。
 */
interface Emits {
  /** グループ削除が要求されたときに発火する。 */
  remove: []
}

defineProps<Props>()
defineEmits<Emits>()

/**
 * Options 画面で編集するグループ。
 */
const group = defineModel<Group>({ required: true })

/**
 * 秒数を mm:ss 形式に変換する。
 */
function formatMinutesSeconds(seconds: number): string {
  const roundedSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(roundedSeconds / 60)
  const remainingSeconds = String(roundedSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}
</script>

<template>
  <article class="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
    <div class="border-b border-border bg-input/60 p-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <label class="group/name block min-w-0 flex-1">
          <span class="sr-only">Name</span>
          <span class="flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1 transition focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/50 hover:border-border hover:bg-background">
            <input
              v-model="group.name"
              aria-label="Name"
              class="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
            >
            <PencilSquareIcon
              aria-hidden="true"
              class="size-4 shrink-0 text-muted opacity-60 transition group-focus-within/name:opacity-100 group-hover/name:opacity-100"
            />
          </span>
        </label>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <p
            v-if="timeLimitUsageSummary"
            aria-label="Remaining time today"
            class="inline-flex h-9 items-center gap-1.5 rounded-md bg-secondary px-3 text-sm text-muted"
          >
            <ClockIcon
              aria-hidden="true"
              class="size-4"
            />
            {{ formatMinutesSeconds(timeLimitUsageSummary.remainingSec) }} / {{ formatMinutesSeconds(timeLimitUsageSummary.limitMinutes * 60) }}
          </p>
          <button
            type="button"
            aria-label="Delete group"
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-background px-3 text-sm font-medium text-destructive transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-destructive/30"
            @click="$emit('remove')"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
            Delete
          </button>
        </div>
      </div>
      <p
        v-if="error('name')"
        class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
      >
        {{ error('name') }}
      </p>
    </div>

    <div class="space-y-4 p-4">
      <PatternListEditor
        v-model="group.patterns"
        v-model:mode="group.mode"
        :error="patternError"
      />
      <LimitRulesEditor
        v-model:blocked-time-slots="group.blockedTimeSlots"
        v-model:time-limits="group.timeLimits"
        :blocked-time-slot-error="blockedTimeSlotError"
        :time-limit-error="timeLimitError"
      />
    </div>
  </article>
</template>
