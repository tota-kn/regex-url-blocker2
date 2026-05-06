<script setup lang="ts">
import { TrashIcon } from '@heroicons/vue/24/outline'
import type { TimeLimitUsageSummary } from '@/utils/blocking'
import type { Group } from '@/utils/types'
import BlockedTimeSlotListEditor from './BlockedTimeSlotListEditor.vue'
import PatternListEditor from './PatternListEditor.vue'
import TimeLimitListEditor from './TimeLimitListEditor.vue'

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
  <div class="border border-border rounded-md p-4 space-y-4">
    <div class="flex flex-wrap items-start gap-3">
      <label class="block flex-1 min-w-0">
        <span class="block text-sm">Name</span>
        <input
          v-model="group.name"
          aria-label="Name"
          class="w-full border border-input-border bg-input rounded-md px-2 py-1"
        >
      </label>
    </div>
    <p
      v-if="timeLimitUsageSummary"
      aria-label="Remaining time today"
      class="text-sm text-muted"
    >
      {{ formatMinutesSeconds(timeLimitUsageSummary.remainingSec) }} / {{ formatMinutesSeconds(timeLimitUsageSummary.limitMinutes * 60) }}
    </p>
    <p
      v-if="error('name')"
      class="text-destructive text-sm"
    >
      {{ error('name') }}
    </p>

    <PatternListEditor
      v-model="group.patterns"
      v-model:mode="group.mode"
      :error="patternError"
    />
    <BlockedTimeSlotListEditor
      v-model="group.blockedTimeSlots"
      :error="blockedTimeSlotError"
    />
    <TimeLimitListEditor
      v-model="group.timeLimits"
      :error="timeLimitError"
    />

    <button
      type="button"
      aria-label="Delete group"
      class="inline-flex items-center gap-1.5 text-destructive"
      @click="$emit('remove')"
    >
      <TrashIcon
        aria-hidden="true"
        class="size-4"
      />
      Delete
    </button>
  </div>
</template>
