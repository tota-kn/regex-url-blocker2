<script setup lang="ts">
import { ClockIcon, NoSymbolIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
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
  /** 編集モードかどうか。false のとき追加・削除ボタンを隠す。 */
  isEditing?: boolean
}

withDefaults(defineProps<Props>(), {
  isEditing: true,
})

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
  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-semibold">
        <ClockIcon
          aria-hidden="true"
          class="size-4 text-muted"
        />
        Blocking rules
      </h3>
      <div class="flex flex-wrap items-center gap-2">
        <BaseButton
          v-if="isEditing"
          type="button"
          aria-label="Add blocked time"
          size="sm"
          variant="ghost"
          @click="addBlockedTimeSlot"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          Blocked time
        </BaseButton>
        <BaseButton
          v-if="isEditing"
          type="button"
          aria-label="Add daily limit"
          size="sm"
          variant="ghost"
          @click="addTimeLimit"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          Daily limit
        </BaseButton>
      </div>
    </div>

    <EmptyState
      v-if="blockedTimeSlots.length === 0 && timeLimits.length === 0"
      aria-label="No blocking rules"
    >
      No blocking rules yet
    </EmptyState>

    <div
      v-if="blockedTimeSlots.length > 0 || timeLimits.length > 0"
      class="space-y-3"
    >
      <div
        v-for="(slot, i) in blockedTimeSlots"
        :key="`slot-${i}`"
        class="space-y-2 rounded-md border p-2.5"
        :class="isEditing ? 'border-border bg-surface-muted' : 'border-border bg-background'"
      >
        <div class="flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
          <NoSymbolIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
          Blocked time
        </div>
        <DayOfWeekCheckboxes
          v-model="slot.daysOfWeek"
          :is-editing="isEditing"
        />
        <AlertMessage
          v-if="blockedTimeSlotError(i, 'daysOfWeek')"
        >
          {{ blockedTimeSlotError(i, 'daysOfWeek') }}
        </AlertMessage>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-x-3">
            <span class="w-36 shrink-0 whitespace-nowrap text-sm font-medium text-secondary-foreground">
              Start - End
            </span>
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <label class="min-w-0">
                <span class="sr-only">Start</span>
                <BaseInput
                  v-model="slot.start"
                  type="time"
                  aria-label="Start time"
                  class="w-28 sm:w-36"
                  size="sm"
                  :disabled="!isEditing"
                  :display="isEditing ? 'editable' : 'readonly'"
                  :invalid="Boolean(blockedTimeSlotError(i, 'start'))"
                /></label>
              <span class="shrink-0 text-sm font-medium text-secondary-foreground">-</span>
              <label class="min-w-0">
                <span class="sr-only">End</span>
                <BaseInput
                  v-model="slot.end"
                  type="time"
                  aria-label="End time"
                  class="w-28 sm:w-36"
                  size="sm"
                  :disabled="!isEditing"
                  :display="isEditing ? 'editable' : 'readonly'"
                  :invalid="Boolean(blockedTimeSlotError(i, 'end'))"
                /></label>
            </div>
          </div>
          <BaseButton
            v-if="isEditing"
            type="button"
            aria-label="Delete blocked time"
            title="Delete"
            class="self-end"
            size="icon-sm"
            variant="danger-ghost"
            @click="blockedTimeSlots.splice(i, 1)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </BaseButton>
        </div>
        <AlertMessage
          v-if="blockedTimeSlotError(i, 'start')"
        >
          {{ blockedTimeSlotError(i, 'start') }}
        </AlertMessage>
        <AlertMessage
          v-if="blockedTimeSlotError(i, 'end')"
        >
          {{ blockedTimeSlotError(i, 'end') }}
        </AlertMessage>
      </div>

      <div
        v-for="(limit, i) in timeLimits"
        :key="`limit-${i}`"
        class="space-y-2 rounded-md border p-2.5"
        :class="isEditing ? 'border-border bg-surface-muted' : 'border-border bg-background'"
      >
        <div class="flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
          <ClockIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
          Daily limit
        </div>
        <DayOfWeekCheckboxes
          v-model="limit.daysOfWeek"
          :is-editing="isEditing"
        />
        <AlertMessage
          v-if="timeLimitError(i, 'daysOfWeek')"
        >
          {{ timeLimitError(i, 'daysOfWeek') }}
        </AlertMessage>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex min-w-0 flex-1 items-center gap-x-3">
            <span class="w-36 shrink-0 whitespace-nowrap text-sm font-medium text-secondary-foreground">Minutes per day</span>
            <BaseInput
              type="number"
              min="0"
              aria-label="Minutes per day"
              :model-value="String(limit.dailyMinutes)"
              class="w-20"
              size="sm"
              :disabled="!isEditing"
              :display="isEditing ? 'editable' : 'readonly'"
              :invalid="Boolean(timeLimitError(i, 'dailyMinutes'))"
              @update:model-value="setTimeLimitMinutes(limit, String($event))"
            /></label>
          <BaseButton
            v-if="isEditing"
            type="button"
            aria-label="Delete limit"
            title="Delete"
            class="self-end"
            size="icon-sm"
            variant="danger-ghost"
            @click="timeLimits.splice(i, 1)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </BaseButton>
        </div>
        <AlertMessage
          v-if="timeLimitError(i, 'dailyMinutes')"
        >
          {{ timeLimitError(i, 'dailyMinutes') }}
        </AlertMessage>
      </div>
    </div>
  </section>
</template>
