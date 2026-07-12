<script setup lang="ts">
import { ClockIcon, PlusIcon, ShieldExclamationIcon, TrashIcon } from '@heroicons/vue/24/outline'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { createDefaultRestriction, createDefaultTimeWindow } from '@/utils/defaults'
import { formatStandaloneRestriction, formatTimeWindow } from '@/utils/groups'
import type { Restriction, ScheduleRuleCondition, TimeWindow } from '@/utils/types'
import RestrictionEditor from './RestrictionEditor.vue'
import RuleSectionHeader from './RuleSectionHeader.vue'
import ScheduleWindowEditor from './ScheduleWindowEditor.vue'

/**
 * 複数の制限ルールを編集するコンポーネントの props。
 */
interface Props {
  /** Time windows 一覧全体のエラーメッセージ。 */
  timeWindowsSectionError?: string
  /** Restrictions 一覧全体のエラーメッセージ。 */
  restrictionsSectionError?: string
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
  /** 指定フィールドのバリデーションエラーメッセージを返す関数。 */
  timeWindowError?: (index: number, field: 'condition' | 'timeRanges') => string | undefined
  restrictionError?: (
    index: number,
    field: 'type' | 'graceMinutes' | 'waitSeconds' | 'waitGrantMinutes' | 'redirectUrl',
  ) => string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
  timeWindowError: () => undefined,
  restrictionError: () => undefined,
})

const timeWindows = defineModel<TimeWindow[]>('timeWindows', { required: true })
const restrictions = defineModel<Restriction[]>('restrictions', { required: true })

/** 新しい制限ルールを追加する。 */
function addTimeWindow(): void {
  timeWindows.value = [...timeWindows.value, createDefaultTimeWindow()]
}

/** 指定位置の制限ルールを削除する。 */
function removeTimeWindow(index: number): void {
  timeWindows.value = timeWindows.value.filter((_, i) => i !== index)
}

/** 選択された種別に対応する時間ウィンドウへ切り替える。 */
function setTimeWindowType(index: number, value: string): void {
  const existing = timeWindows.value[index]
  if (value === 'always') {
    timeWindows.value[index] = { type: 'always' }
    return
  }

  const conditions: Record<string, ScheduleRuleCondition> = {
    daily: { type: 'daily' },
    weekly: { type: 'weekly', daysOfWeek: [] },
    monthly: { type: 'monthly', daysOfMonth: [] },
    period: { type: 'period', start: { month: 1, day: 1 }, end: { month: 12, day: 31 } },
  }
  const condition = conditions[value]
  if (condition) {
    timeWindows.value[index] = {
      type: 'scheduled',
      condition,
      timeRanges: existing.type === 'scheduled' ? existing.timeRanges : [],
    }
  }
}

/** 新しい制限を追加する。 */
function addRestriction(): void {
  restrictions.value = [...restrictions.value, createDefaultRestriction('block')]
}

/** 指定位置の制限を削除する。 */
function removeRestriction(index: number): void {
  restrictions.value = restrictions.value.filter((_, i) => i !== index)
}
</script>

<template>
  <section class="min-w-0 space-y-3">
    <RuleSectionHeader title="Time windows">
      <template #icon>
        <ClockIcon aria-hidden="true" class="size-4 text-muted" />
      </template>
    </RuleSectionHeader>

    <ol class="space-y-3" aria-label="Time windows">
      <li
        v-for="(window, index) in timeWindows"
        :key="index"
        class="space-y-3 rounded-lg border border-border bg-surface p-3"
      >
        <div v-if="isEditing" class="flex min-w-0 items-center justify-between gap-2">
          <label class="min-w-0">
            <span class="sr-only">Time window type</span>
            <select
              aria-label="Time window type"
              :value="window.type === 'always' ? 'always' : window.condition.type"
              class="h-8 min-w-0 rounded-lg border border-field-border bg-field px-2 text-body-md text-input-foreground outline-none transition hover:border-field-border-hover hover:bg-field-hover focus:border-primary focus:ring-2 focus:ring-ring/50"
              @change="setTimeWindowType(index, ($event.target as HTMLSelectElement).value)"
            >
              <option value="always">Always</option>
              <option value="daily">Every day</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="period">Period</option>
            </select>
          </label>
          <BaseButton
            type="button"
            variant="danger-ghost"
            size="icon-sm"
            :aria-label="`Remove time window ${index + 1}`"
            @click="removeTimeWindow(index)"
          >
            <TrashIcon aria-hidden="true" class="size-4" />
          </BaseButton>
        </div>

        <template v-if="isEditing">
          <ScheduleWindowEditor
            v-if="window.type === 'scheduled'"
            :condition="window.condition"
            :time-ranges="window.timeRanges"
            :is-editing="isEditing"
            @update:condition="window.condition = $event"
            @update:time-ranges="window.timeRanges = $event"
          />
        </template>

        <output
          v-else
          :aria-label="`Time window ${index + 1}`"
          class="block text-body-md text-input-foreground"
        >
          {{ formatTimeWindow(window) }}
        </output>
      </li>
    </ol>
    <BaseButton
      v-if="isEditing"
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Add time window"
      @click="addTimeWindow"
    >
      <PlusIcon aria-hidden="true" class="size-4" />
      Time window
    </BaseButton>
    <AlertMessage v-if="timeWindowsSectionError">
      {{ timeWindowsSectionError }}
    </AlertMessage>

    <RuleSectionHeader title="Restrictions" class="pt-3">
      <template #icon>
        <ShieldExclamationIcon aria-hidden="true" class="size-4 text-muted" />
      </template>
    </RuleSectionHeader>
    <ol v-if="restrictions.length > 0" class="space-y-3" aria-label="Restrictions">
      <li
        v-for="(restriction, index) in restrictions"
        :key="index"
        class="relative space-y-3 rounded-lg border border-border bg-surface p-3"
      >
        <BaseButton
          v-if="isEditing"
          type="button"
          variant="danger-ghost"
          size="icon-sm"
          class="absolute right-3 top-3"
          :aria-label="`Remove restriction ${index + 1}`"
          @click="removeRestriction(index)"
        >
          <TrashIcon aria-hidden="true" class="size-4" />
        </BaseButton>
        <RestrictionEditor
          v-if="isEditing"
          v-model="restrictions[index]"
          class="pr-10"
          :is-editing="isEditing"
          :error="(field) => props.restrictionError(index, field)"
        />
        <output
          v-else
          :aria-label="`Restriction ${index + 1}`"
          class="block text-body-md text-input-foreground"
          >{{ formatStandaloneRestriction(restriction) }}</output
        >
      </li>
    </ol>
    <BaseButton
      v-if="isEditing"
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Add restriction"
      @click="addRestriction"
    >
      <PlusIcon aria-hidden="true" class="size-4" />
      Restriction
    </BaseButton>
    <AlertMessage v-if="restrictionsSectionError">
      {{ restrictionsSectionError }}
    </AlertMessage>
  </section>
</template>
