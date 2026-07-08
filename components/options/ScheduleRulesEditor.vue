<script setup lang="ts">
import { ClockIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { ref, watch } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { formatMonthDay, minutesToTime, parseDaysOfMonthText, parseMonthDayText, parseTimeRangeText } from '@/utils/datetime'
import { createEmptyScheduleRule } from '@/utils/defaults'
import { formatScheduleRule } from '@/utils/groups'
import type { DayOfWeek, ScheduleRule, ScheduleRuleCondition } from '@/utils/types'
import DayOfWeekCheckboxes from './DayOfWeekCheckboxes.vue'

/**
 * スケジュールルール編集コンポーネントの props。
 */
interface Props {
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
  /** 指定ルール番号のバリデーションエラーメッセージを返す関数。 */
  ruleError?: (index: number) => string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
  ruleError: () => undefined,
})

const rules = defineModel<ScheduleRule[]>({ required: true })

/**
 * ルール id を key にしたテキスト入力の作業状態。
 */
interface RuleTexts {
  /** ブロック時間帯のカンマ区切りテキスト。 */
  timeRanges: string
  /** 毎月の日付のカンマ区切りテキスト。 */
  daysOfMonth: string
  /** 期間開始の MM/DD テキスト。 */
  periodStart: string
  /** 期間終了の MM/DD テキスト。 */
  periodEnd: string
  /** 上限分数のテキスト。空文字は上限なし。 */
  limit: string
}

const ruleTexts = ref<Record<string, RuleTexts>>(createRuleTexts())

watch(rules, () => {
  ruleTexts.value = createRuleTexts()
}, { deep: true })

/** 保存済みルールからテキスト入力の初期状態を作る。 */
function createRuleTexts(): Record<string, RuleTexts> {
  const state: Record<string, RuleTexts> = {}
  for (const rule of rules.value) {
    state[rule.id] = {
      timeRanges: rule.blockedTimeRanges
        .map(range => `${minutesToTime(range.startMinute)}-${minutesToTime(range.endMinute)}`)
        .join(', '),
      daysOfMonth: rule.condition.type === 'monthly' ? rule.condition.daysOfMonth.join(', ') : '',
      periodStart: rule.condition.type === 'period' ? formatMonthDay(rule.condition.start) : '',
      periodEnd: rule.condition.type === 'period' ? formatMonthDay(rule.condition.end) : '',
      limit: rule.dailyLimitMinutes === undefined ? '' : String(rule.dailyLimitMinutes),
    }
  }
  return state
}

/** 指定ルールのテキスト入力状態を返す。 */
function textsOf(rule: ScheduleRule): RuleTexts {
  ruleTexts.value[rule.id] ??= {
    timeRanges: '',
    daysOfMonth: '',
    periodStart: '',
    periodEnd: '',
    limit: '',
  }
  return ruleTexts.value[rule.id]
}

/** 条件タイプ変更時に対応する既定の条件へ差し替える。 */
function setConditionType(rule: ScheduleRule, value: string): void {
  if (value === rule.condition.type) return
  const conditions: Record<string, ScheduleRuleCondition> = {
    daily: { type: 'daily' },
    weekly: { type: 'weekly', daysOfWeek: [] },
    monthly: { type: 'monthly', daysOfMonth: [] },
    period: { type: 'period', start: { month: 1, day: 1 }, end: { month: 12, day: 31 } },
  }
  const condition = conditions[value]
  if (condition) rule.condition = condition
}

/** weekly 条件の曜日配列を返す。 */
function weeklyDays(rule: ScheduleRule): DayOfWeek[] {
  return rule.condition.type === 'weekly' ? rule.condition.daysOfWeek : []
}

/** weekly 条件の曜日配列を更新する。 */
function setWeeklyDays(rule: ScheduleRule, days: DayOfWeek[]): void {
  if (rule.condition.type === 'weekly') rule.condition.daysOfWeek = days
}

/** 毎月の日付テキストを更新し、解析できたら条件へ反映する。 */
function setDaysOfMonthText(rule: ScheduleRule, value: string | number | undefined): void {
  const text = String(value ?? '')
  textsOf(rule).daysOfMonth = text

  const days = parseDaysOfMonthText(text)
  if (!days || rule.condition.type !== 'monthly') return
  rule.condition.daysOfMonth = days
}

/** 毎月の日付テキストが不正かどうかを返す。 */
function isDaysOfMonthTextInvalid(rule: ScheduleRule): boolean {
  return parseDaysOfMonthText(textsOf(rule).daysOfMonth) === undefined
}

/** 期間端の MM/DD テキストを更新し、解析できたら条件へ反映する。 */
function setPeriodText(rule: ScheduleRule, edge: 'start' | 'end', value: string | number | undefined): void {
  const text = String(value ?? '')
  if (edge === 'start') textsOf(rule).periodStart = text
  else textsOf(rule).periodEnd = text

  const monthDay = parseMonthDayText(text)
  if (!monthDay || rule.condition.type !== 'period') return
  rule.condition[edge] = monthDay
}

/** 期間端の MM/DD テキストが不正かどうかを返す。 */
function isPeriodTextInvalid(rule: ScheduleRule, edge: 'start' | 'end'): boolean {
  const text = edge === 'start' ? textsOf(rule).periodStart : textsOf(rule).periodEnd
  return parseMonthDayText(text) === undefined
}

/** ブロック時間帯テキストを更新し、解析できたらルールへ反映する。 */
function setTimeRangeText(rule: ScheduleRule, value: string | number | undefined): void {
  const text = String(value ?? '')
  textsOf(rule).timeRanges = text

  const ranges = parseTimeRangeText(text)
  if (!ranges) return
  rule.blockedTimeRanges = ranges
}

/** ブロック時間帯テキストが不正かどうかを返す。 */
function isTimeRangeTextInvalid(rule: ScheduleRule): boolean {
  return parseTimeRangeText(textsOf(rule).timeRanges) === undefined
}

/** 上限分数を更新する。 */
function setLimitText(rule: ScheduleRule, value: string | number | undefined): void {
  const text = String(value ?? '').replace(/\D/g, '')
  textsOf(rule).limit = text
  rule.dailyLimitMinutes = text === '' ? undefined : Number(text)
}

/** 数字以外の入力を事前に止める。 */
function preventNonDigitInput(event: InputEvent): void {
  if (event.data === null) return
  if (/^\d+$/.test(event.data)) return
  event.preventDefault()
}

/** 新しいルールを追加する。 */
function addRule(): void {
  rules.value.push(createEmptyScheduleRule())
}

/** 指定番号のルールを削除する。 */
function removeRule(index: number): void {
  rules.value.splice(index, 1)
}
</script>

<template>
  <section class="min-w-0 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-label-md">
        <ClockIcon
          aria-hidden="true"
          class="size-4 text-muted"
        />
        Schedule rules
      </h3>
      <p class="basis-full text-body-sm text-muted">
        Rules apply on matching days. All matching rules combine: blocked hours add up and the smallest daily limit wins.
      </p>
    </div>

    <div :class="isEditing ? 'space-y-2' : 'space-y-1'">
      <EmptyState
        v-if="rules.length === 0"
        aria-label="No schedule rules"
      >
        No schedule rules yet
      </EmptyState>

      <template v-if="isEditing">
        <div
          v-for="(rule, index) in rules"
          :key="rule.id"
          class="space-y-2 rounded-lg border border-border bg-surface-muted p-3"
        >
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <label class="min-w-0">
              <span class="sr-only">Rule {{ index + 1 }} condition type</span>
              <select
                :aria-label="`Rule ${index + 1} condition type`"
                :value="rule.condition.type"
                class="h-8 min-w-0 rounded-lg border border-field-border bg-field px-2 text-body-md text-input-foreground outline-none transition hover:border-field-border-hover hover:bg-field-hover focus:border-primary focus:ring-2 focus:ring-ring/50"
                @change="setConditionType(rule, ($event.target as HTMLSelectElement).value)"
              >
                <option value="daily">Every day</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="period">Period</option>
              </select>
            </label>

            <label
              v-if="rule.condition.type === 'monthly'"
              class="flex min-w-0 items-center gap-1.5"
            >
              <span class="sr-only">Rule {{ index + 1 }} days of month</span>
              <BaseInput
                type="text"
                :aria-label="`Rule ${index + 1} days of month`"
                placeholder="1, 15"
                class="w-28"
                size="sm"
                monospace
                :model-value="textsOf(rule).daysOfMonth"
                :invalid="isDaysOfMonthTextInvalid(rule)"
                @update:model-value="setDaysOfMonthText(rule, $event)"
              />
              <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground">of every month</span>
            </label>

            <template v-if="rule.condition.type === 'period'">
              <label class="min-w-0">
                <span class="sr-only">Rule {{ index + 1 }} period start</span>
                <BaseInput
                  type="text"
                  :aria-label="`Rule ${index + 1} period start`"
                  placeholder="12/28"
                  class="w-20"
                  size="sm"
                  monospace
                  :model-value="textsOf(rule).periodStart"
                  :invalid="isPeriodTextInvalid(rule, 'start')"
                  @update:model-value="setPeriodText(rule, 'start', $event)"
                />
              </label>
              <span
                aria-hidden="true"
                class="shrink-0 text-label-sm text-muted-foreground"
              >-</span>
              <label class="min-w-0">
                <span class="sr-only">Rule {{ index + 1 }} period end</span>
                <BaseInput
                  type="text"
                  :aria-label="`Rule ${index + 1} period end`"
                  placeholder="01/03"
                  class="w-20"
                  size="sm"
                  monospace
                  :model-value="textsOf(rule).periodEnd"
                  :invalid="isPeriodTextInvalid(rule, 'end')"
                  @update:model-value="setPeriodText(rule, 'end', $event)"
                />
              </label>
              <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground">every year</span>
            </template>

            <BaseButton
              type="button"
              aria-label="Delete rule"
              title="Delete"
              size="icon-md"
              variant="danger-ghost"
              class="ml-auto shrink-0"
              @click="removeRule(index)"
            >
              <TrashIcon
                aria-hidden="true"
                class="size-4"
              />
            </BaseButton>
          </div>

          <DayOfWeekCheckboxes
            v-if="rule.condition.type === 'weekly'"
            :model-value="weeklyDays(rule)"
            :is-editing="isEditing"
            @update:model-value="setWeeklyDays(rule, $event)"
          />

          <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <label class="flex min-w-0 flex-1 items-center gap-1.5">
              <span class="w-36 shrink-0 whitespace-nowrap text-label-md text-secondary-foreground">Always block during</span>
              <BaseInput
                type="text"
                :aria-label="`Rule ${index + 1} blocked time ranges`"
                placeholder="09:00-12:30, 22:00-01:30"
                class="min-w-0 flex-1"
                size="sm"
                monospace
                :model-value="textsOf(rule).timeRanges"
                :invalid="isTimeRangeTextInvalid(rule)"
                @update:model-value="setTimeRangeText(rule, $event)"
              />
            </label>
            <label class="flex min-w-0 items-center gap-1.5">
              <span class="shrink-0 whitespace-nowrap text-label-md text-secondary-foreground">Allow up to</span>
              <BaseInput
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                :aria-label="`Rule ${index + 1} daily limit minutes`"
                placeholder="No daily limit"
                class="w-24"
                size="sm"
                :model-value="textsOf(rule).limit"
                @beforeinput="preventNonDigitInput"
                @update:model-value="setLimitText(rule, $event)"
              />
              <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground">min/day</span>
            </label>
          </div>

          <AlertMessage v-if="props.ruleError(index)">
            {{ props.ruleError(index) }}
          </AlertMessage>
        </div>

        <BaseButton
          type="button"
          aria-label="Add schedule rule"
          size="sm"
          variant="ghost"
          @click="addRule"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          Schedule rule
        </BaseButton>
      </template>

      <output
        v-for="(rule, index) in (isEditing ? [] : rules)"
        v-else
        :key="rule.id"
        :aria-label="`Schedule rule ${index + 1}`"
        class="block text-body-md text-input-foreground"
      >
        {{ formatScheduleRule(rule) }}
      </output>
    </div>
  </section>
</template>
