<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import {
  formatMonthDay,
  minutesToTime,
  parseDaysOfMonthText,
  parseMonthDayText,
  parseTimeRangeText,
} from '@/utils/datetime'
import type { DayOfWeek, ScheduleRuleCondition, TimeRange } from '@/utils/types'
import DayOfWeekCheckboxes from './DayOfWeekCheckboxes.vue'

/**
 * 時間帯設定欄（グループの単一制限が有効になる「有効ウィンドウ」）の props。
 */
interface Props {
  /** 適用する日の条件。 */
  condition: ScheduleRuleCondition
  /** 制限が有効な時刻ウィンドウ。空配列は終日。 */
  timeRanges: TimeRange[]
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
}

/**
 * 時間帯設定欄が親へ通知するイベント。
 */
interface Emits {
  /** 条件が変更されたときに発火する。 */
  'update:condition': [condition: ScheduleRuleCondition]
  /** 時刻ウィンドウが変更されたときに発火する。 */
  'update:timeRanges': [timeRanges: TimeRange[]]
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
})
const emit = defineEmits<Emits>()

/**
 * テキスト入力の作業状態。
 */
interface WindowTexts {
  /** 時刻ウィンドウのカンマ区切りテキスト。 */
  timeRanges: string
  /** 毎月の日付のカンマ区切りテキスト。 */
  daysOfMonth: string
  /** 期間開始の MM/DD テキスト。 */
  periodStart: string
  /** 期間終了の MM/DD テキスト。 */
  periodEnd: string
}

/** props からテキスト入力の初期状態を作る。 */
function createTexts(): WindowTexts {
  return {
    timeRanges: props.timeRanges
      .map((range) => `${minutesToTime(range.startMinute)}-${minutesToTime(range.endMinute)}`)
      .join(', '),
    daysOfMonth: props.condition.type === 'monthly' ? props.condition.daysOfMonth.join(', ') : '',
    periodStart: props.condition.type === 'period' ? formatMonthDay(props.condition.start) : '',
    periodEnd: props.condition.type === 'period' ? formatMonthDay(props.condition.end) : '',
  }
}

const texts = ref<WindowTexts>(createTexts())

watch(
  () => [props.condition, props.timeRanges],
  () => {
    texts.value = createTexts()
  },
  { deep: true },
)

/** weekly 条件の曜日配列を返す。 */
function weeklyDays(): DayOfWeek[] {
  return props.condition.type === 'weekly' ? props.condition.daysOfWeek : []
}

/** weekly 条件の曜日配列を更新する。 */
function setWeeklyDays(days: DayOfWeek[]): void {
  if (props.condition.type === 'weekly')
    emit('update:condition', { type: 'weekly', daysOfWeek: days })
}

/** 毎月の日付テキストを更新し、解析できたら条件へ反映する。 */
function setDaysOfMonthText(value: string | number | undefined): void {
  const text = String(value ?? '')
  texts.value.daysOfMonth = text

  const days = parseDaysOfMonthText(text)
  if (!days || props.condition.type !== 'monthly') return
  emit('update:condition', { type: 'monthly', daysOfMonth: days })
}

/** 毎月の日付テキストが不正かどうかを返す。 */
function isDaysOfMonthTextInvalid(): boolean {
  return parseDaysOfMonthText(texts.value.daysOfMonth) === undefined
}

/** 期間端の MM/DD テキストを更新し、解析できたら条件へ反映する。 */
function setPeriodText(edge: 'start' | 'end', value: string | number | undefined): void {
  const text = String(value ?? '')
  if (edge === 'start') texts.value.periodStart = text
  else texts.value.periodEnd = text

  const monthDay = parseMonthDayText(text)
  if (!monthDay || props.condition.type !== 'period') return
  emit('update:condition', { ...props.condition, [edge]: monthDay })
}

/** 期間端の MM/DD テキストが不正かどうかを返す。 */
function isPeriodTextInvalid(edge: 'start' | 'end'): boolean {
  const text = edge === 'start' ? texts.value.periodStart : texts.value.periodEnd
  return parseMonthDayText(text) === undefined
}

/** 時刻ウィンドウのテキストを更新し、解析できたら反映する。 */
function setTimeRangeText(value: string | number | undefined): void {
  const text = String(value ?? '')
  texts.value.timeRanges = text

  const ranges = parseTimeRangeText(text)
  if (!ranges) return
  emit('update:timeRanges', ranges)
}

/** 時刻ウィンドウのテキストが不正かどうかを返す。 */
function isTimeRangeTextInvalid(): boolean {
  return parseTimeRangeText(texts.value.timeRanges) === undefined
}
</script>

<template>
  <section class="min-w-0 space-y-3">
    <div v-if="isEditing" class="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
      <div
        v-if="condition.type === 'monthly' || condition.type === 'period'"
        class="flex min-w-0 flex-wrap items-center gap-2"
      >
        <label v-if="condition.type === 'monthly'" class="flex min-w-0 items-center gap-1.5">
          <span class="sr-only">Time window days of month</span>
          <BaseInput
            type="text"
            aria-label="Time window days of month"
            placeholder="1, 15"
            class="w-28"
            size="sm"
            monospace
            :model-value="texts.daysOfMonth"
            :invalid="isDaysOfMonthTextInvalid()"
            @update:model-value="setDaysOfMonthText"
          />
          <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground"
            >of every month</span
          >
        </label>

        <template v-if="condition.type === 'period'">
          <label class="min-w-0">
            <span class="sr-only">Time window period start</span>
            <BaseInput
              type="text"
              aria-label="Time window period start"
              placeholder="12/28"
              class="w-20"
              size="sm"
              monospace
              :model-value="texts.periodStart"
              :invalid="isPeriodTextInvalid('start')"
              @update:model-value="setPeriodText('start', $event)"
            />
          </label>
          <span aria-hidden="true" class="shrink-0 text-label-sm text-muted-foreground">-</span>
          <label class="min-w-0">
            <span class="sr-only">Time window period end</span>
            <BaseInput
              type="text"
              aria-label="Time window period end"
              placeholder="01/03"
              class="w-20"
              size="sm"
              monospace
              :model-value="texts.periodEnd"
              :invalid="isPeriodTextInvalid('end')"
              @update:model-value="setPeriodText('end', $event)"
            />
          </label>
          <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground"
            >every year</span
          >
        </template>
      </div>

      <DayOfWeekCheckboxes
        v-if="condition.type === 'weekly'"
        :model-value="weeklyDays()"
        :is-editing="isEditing"
        @update:model-value="setWeeklyDays"
      />

      <label class="flex min-w-0 flex-1 items-center gap-1.5">
        <span class="w-36 shrink-0 whitespace-nowrap text-label-md text-secondary-foreground"
          >Active during</span
        >
        <BaseInput
          type="text"
          aria-label="Active time ranges"
          placeholder="09:00-12:30, 22:00-01:30"
          class="min-w-0 flex-1"
          size="sm"
          monospace
          :model-value="texts.timeRanges"
          :invalid="isTimeRangeTextInvalid()"
          @update:model-value="setTimeRangeText"
        />
      </label>
    </div>
  </section>
</template>
