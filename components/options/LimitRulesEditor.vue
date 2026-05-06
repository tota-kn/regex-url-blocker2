<script setup lang="ts">
import { ClockIcon, NoSymbolIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { BlockedTimeSlot, DayOfWeek, TimeLimit } from '@/utils/types'
import DayOfWeekCheckboxes from './DayOfWeekCheckboxes.vue'

/**
 * 制限ルール編集コンポーネントの props。
 */
interface Props {
  /** 指定時間帯番号・サブフィールドのエラーメッセージを返す関数。 */
  blockedTimeSlotError: (index: number, subField: string) => string | undefined
  /** 指定上限番号・サブフィールドのエラーメッセージを返す関数。 */
  timeLimitError: (index: number, subField: string) => string | undefined
}

defineProps<Props>()

const ALL_DAYS_OF_WEEK: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * グループに属するブロック時間帯配列。
 */
const blockedTimeSlots = defineModel<BlockedTimeSlot[]>('blockedTimeSlots', { required: true })

/**
 * グループに属する閲覧上限配列。
 */
const timeLimits = defineModel<TimeLimit[]>('timeLimits', { required: true })

/** 既定値のブロック時間帯を追加する。 */
function addBlockedTimeSlot(): void {
  blockedTimeSlots.value.push({ daysOfWeek: [...ALL_DAYS_OF_WEEK], start: '00:00', end: '00:00' })
}

/** 既定値の閲覧上限を追加する。 */
function addTimeLimit(): void {
  timeLimits.value.push({ daysOfWeek: [...ALL_DAYS_OF_WEEK], dailyMinutes: 30 })
}

/** number input の文字列値を timeLimit の `dailyMinutes` に反映する。 */
function setTimeLimitMinutes(limit: TimeLimit, value: string): void {
  limit.dailyMinutes = value === '' ? 0 : Number(value)
}
</script>

<template>
  <section class="rounded-md border border-border bg-background p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-semibold">
        <ClockIcon
          aria-hidden="true"
          class="size-4 text-muted"
        />
        Blocking rules
      </h3>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Add blocked time"
          class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-primary/30 px-2.5 text-sm font-medium text-primary transition hover:bg-accent"
          @click="addBlockedTimeSlot"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          Blocked time
        </button>
        <button
          type="button"
          aria-label="Add daily limit"
          class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-primary/30 px-2.5 text-sm font-medium text-primary transition hover:bg-accent"
          @click="addTimeLimit"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          Daily limit
        </button>
      </div>
    </div>

    <p
      v-if="blockedTimeSlots.length === 0 && timeLimits.length === 0"
      aria-label="No blocking rules"
      class="mt-3 rounded-md border border-dashed border-border bg-input/60 px-3 py-2 text-sm text-muted"
    >
      No blocking rules yet
    </p>

    <div
      v-if="blockedTimeSlots.length > 0 || timeLimits.length > 0"
      class="mt-3 space-y-3"
    >
      <div
        v-for="(slot, i) in blockedTimeSlots"
        :key="`slot-${i}`"
        class="space-y-3 rounded-md border border-border bg-input/40 p-3"
      >
        <div class="flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
          <NoSymbolIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
          Blocked time
        </div>
        <DayOfWeekCheckboxes v-model="slot.daysOfWeek" />
        <p
          v-if="blockedTimeSlotError(i, 'daysOfWeek')"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {{ blockedTimeSlotError(i, 'daysOfWeek') }}
        </p>
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label class="min-w-0">
            <span class="mb-1 flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
              <ClockIcon
                aria-hidden="true"
                class="size-4 text-muted"
              />
              Start
            </span>
            <input
              v-model="slot.start"
              type="time"
              aria-label="Start time"
              class="h-9 w-full rounded-md border border-input-border bg-background px-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/50"
            >
          </label>
          <label class="min-w-0">
            <span class="mb-1 block text-sm font-medium text-secondary-foreground">End</span>
            <input
              v-model="slot.end"
              type="time"
              aria-label="End time"
              class="h-9 w-full rounded-md border border-input-border bg-background px-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/50"
            >
          </label>
          <button
            type="button"
            aria-label="Delete blocked time"
            title="Delete"
            class="inline-flex size-9 items-center justify-center self-end rounded-md border border-border bg-background text-destructive transition hover:bg-red-50"
            @click="blockedTimeSlots.splice(i, 1)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </button>
        </div>
        <p
          v-if="blockedTimeSlotError(i, 'start')"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {{ blockedTimeSlotError(i, 'start') }}
        </p>
        <p
          v-if="blockedTimeSlotError(i, 'end')"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {{ blockedTimeSlotError(i, 'end') }}
        </p>
      </div>

      <div
        v-for="(limit, i) in timeLimits"
        :key="`limit-${i}`"
        class="space-y-3 rounded-md border border-border bg-input/40 p-3"
      >
        <div class="flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
          <ClockIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
          Daily limit
        </div>
        <DayOfWeekCheckboxes v-model="limit.daysOfWeek" />
        <p
          v-if="timeLimitError(i, 'daysOfWeek')"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {{ timeLimitError(i, 'daysOfWeek') }}
        </p>
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label class="min-w-0">
            <span class="mb-1 block text-sm font-medium text-secondary-foreground">Minutes per day</span>
            <input
              type="number"
              min="0"
              aria-label="Minutes per day"
              :value="limit.dailyMinutes"
              class="h-9 w-full rounded-md border border-input-border bg-background px-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/50"
              @input="setTimeLimitMinutes(limit, ($event.target as HTMLInputElement).value)"
            >
          </label>
          <button
            type="button"
            aria-label="Delete limit"
            title="Delete"
            class="inline-flex size-9 items-center justify-center self-end rounded-md border border-border bg-background text-destructive transition hover:bg-red-50"
            @click="timeLimits.splice(i, 1)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </button>
        </div>
        <p
          v-if="timeLimitError(i, 'dailyMinutes')"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {{ timeLimitError(i, 'dailyMinutes') }}
        </p>
      </div>
    </div>
  </section>
</template>
