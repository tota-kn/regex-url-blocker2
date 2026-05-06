<script setup lang="ts">
import { ClockIcon, NoSymbolIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { BlockedTimeSlot } from '@/utils/types'
import DayOfWeekCheckboxes from './DayOfWeekCheckboxes.vue'

/**
 * ブロック時間帯編集コンポーネントの props。
 */
interface Props {
  /** 指定時間帯番号・サブフィールドのエラーメッセージを返す関数。 */
  error: (index: number, subField: string) => string | undefined
}

defineProps<Props>()

/**
 * グループに属するブロック時間帯配列。
 */
const blockedTimeSlots = defineModel<BlockedTimeSlot[]>({ required: true })

/** 既定値のブロック時間帯を追加する。 */
function addBlockedTimeSlot(): void {
  blockedTimeSlots.value.push({ daysOfWeek: [], start: '00:00', end: '00:00' })
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-1.5 text-sm font-medium">
        <NoSymbolIcon
          aria-hidden="true"
          class="size-4"
        />
        Blocked slots
      </h3>
      <button
        type="button"
        aria-label="Add slot"
        class="inline-flex items-center gap-1 text-primary text-sm"
        @click="addBlockedTimeSlot"
      >
        <PlusIcon
          aria-hidden="true"
          class="size-4"
        />
        Slot
      </button>
    </div>
    <p
      v-if="blockedTimeSlots.length === 0"
      aria-label="No blocked slots"
      class="text-muted text-sm"
    >
      Empty
    </p>
    <div
      v-for="(slot, i) in blockedTimeSlots"
      :key="i"
      class="border border-border rounded-md p-3 space-y-2"
    >
      <DayOfWeekCheckboxes v-model="slot.daysOfWeek" />
      <p
        v-if="error(i, 'daysOfWeek')"
        class="text-destructive text-sm"
      >
        {{ error(i, 'daysOfWeek') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1">
          <ClockIcon
            aria-hidden="true"
            class="size-4"
          />
          <input
            v-model="slot.start"
            type="time"
            aria-label="Start time"
            class="border border-input-border bg-input rounded-md px-2 py-1"
          >
        </label>
        <span>-</span>
        <label class="flex items-center gap-1">
          <span class="text-sm">End</span>
          <input
            v-model="slot.end"
            type="time"
            aria-label="End time"
            class="border border-input-border bg-input rounded-md px-2 py-1"
          >
        </label>
        <button
          type="button"
          aria-label="Delete blocked slot"
          title="Delete"
          class="ml-auto inline-flex size-8 items-center justify-center rounded-md text-destructive hover:bg-muted"
          @click="blockedTimeSlots.splice(i, 1)"
        >
          <TrashIcon
            aria-hidden="true"
            class="size-4"
          />
        </button>
      </div>
      <p
        v-if="error(i, 'start')"
        class="text-destructive text-sm"
      >
        {{ error(i, 'start') }}
      </p>
      <p
        v-if="error(i, 'end')"
        class="text-destructive text-sm"
      >
        {{ error(i, 'end') }}
      </p>
    </div>
  </div>
</template>
