<script setup lang="ts">
import { ArrowRightIcon } from '@heroicons/vue/24/outline'
import BaseInput from '@/components/ui/BaseInput.vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import { createDefaultRule, DEFAULT_REDIRECT_URL } from '@/utils/defaults'
import type { Rule, RuleKind, ScheduleRuleCondition, TimeRange, TimeWindow } from '@/utils/types'
import ScheduleWindowEditor from './ScheduleWindowEditor.vue'

/**
 * 1件の Rule を編集するコンポーネントの props。
 */
interface Props {
  /** 行番号（aria-label 用）。 */
  index: number
  /** このルールのバリデーションエラーメッセージ。 */
  error?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 編集したフィールドを親フォームへ伝える。 */ touch: [field: string]
  /** テキスト入力が保存可能かどうかを親フォームへ伝える。 */
  'validity-change': [field: string, valid: boolean]
}>()

const rule = defineModel<Rule>({ required: true })

/** 「いつ」のプルダウン選択肢。 */
const whenOptions = [
  { value: 'always', label: 'Always' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'period', label: 'Date range' },
]

/** 「何を」のプルダウン選択肢。評価順に並べる。 */
const kindOptions = [
  { value: 'block', label: 'Block access' },
  { value: 'dailyLimit', label: 'Daily limit' },
  { value: 'wait', label: 'Wait before access' },
] satisfies { value: RuleKind; label: string }[]

/** 変更を親フォームへ通知しつつルールを差し替える。 */
function update(next: Rule, field: string): void {
  emit('touch', field)
  rule.value = next
}

/** 現在の window 種別を選択肢の値へ変換する。 */
function windowValue(window: TimeWindow): string {
  return window.type === 'always' ? 'always' : window.condition.type
}

/** 「いつ」を切り替える。時刻ウィンドウは可能なら引き継ぐ。 */
function setWindow(value: string): void {
  const existing = rule.value.window
  if (value === 'always') {
    update({ ...rule.value, window: { type: 'always' } }, 'window')
    return
  }
  const conditions: Record<string, ScheduleRuleCondition> = {
    daily: { type: 'daily' },
    weekly: { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] },
    monthly: { type: 'monthly', daysOfMonth: [1] },
    period: { type: 'period', start: { month: 1, day: 1 }, end: { month: 12, day: 31 } },
  }
  const condition = conditions[value]
  if (!condition) return
  update(
    {
      ...rule.value,
      window: {
        type: 'scheduled',
        condition,
        timeRanges: existing.type === 'scheduled' ? existing.timeRanges : [],
      },
    },
    'window',
  )
}

/** 「何を」を切り替える。id と window は保ったまま制限内容だけ差し替える。 */
function setKind(value: string): void {
  const next = createDefaultRule(value as RuleKind)
  update(
    {
      id: rule.value.id,
      window: rule.value.window,
      restriction: next.restriction,
      ...(next.destination ? { destination: rule.value.destination ?? next.destination } : {}),
    },
    'restriction',
  )
}

/** 遷移先種別を切り替える。 */
function setDestinationType(value: string): void {
  update(
    {
      ...rule.value,
      destination:
        value === 'redirect'
          ? { type: 'redirect', url: destinationUrl() || DEFAULT_REDIRECT_URL }
          : { type: 'blockedPage' },
    },
    'destination',
  )
}

/** 現在の遷移先 URL を返す。未設定なら空文字。 */
function destinationUrl(): string {
  return rule.value.destination?.type === 'redirect' ? rule.value.destination.url : ''
}

/** 遷移先 URL を更新する。 */
function setDestinationUrl(value: string | number | undefined): void {
  update(
    { ...rule.value, destination: { type: 'redirect', url: String(value ?? '') } },
    'destination',
  )
}

/** scheduled window の適用条件を更新する。 */
function setCondition(condition: ScheduleRuleCondition): void {
  if (rule.value.window.type !== 'scheduled') return
  update({ ...rule.value, window: { ...rule.value.window, condition } }, 'window')
}

/** scheduled window の時刻ウィンドウを更新する。 */
function setTimeRanges(timeRanges: TimeRange[]): void {
  if (rule.value.window.type !== 'scheduled') return
  update({ ...rule.value, window: { ...rule.value.window, timeRanges } }, 'window')
}

/** 数値を入力欄の表示文字列へ変換する。未入力（NaN）は空文字にする。 */
function numberText(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

/** 数値フィールドを更新する。空入力は NaN にして検証エラーを出す。 */
function setNumber(field: string, value: string | number | undefined): void {
  const text = String(value ?? '').replace(/\D/g, '')
  const parsed = text === '' ? Number.NaN : Number(text)
  update(
    {
      ...rule.value,
      restriction: { ...rule.value.restriction, [field]: parsed } as Rule['restriction'],
    },
    `restriction.${field}`,
  )
}

/** 数字以外の入力を事前に止める。 */
function preventNonDigitInput(event: InputEvent): void {
  if (event.data === null) return
  if (/^\d+$/.test(event.data)) return
  event.preventDefault()
}

/** 選択欄の共通クラス。 */
const selectClass =
  'h-8 min-w-0 rounded-lg border border-field-border bg-field px-2 text-body-md text-input-foreground outline-none transition hover:border-field-border-hover hover:bg-field-hover focus:border-primary focus:ring-2 focus:ring-ring/50'
</script>

<template>
  <div class="min-w-0 space-y-3">
    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
      <label class="min-w-0">
        <span class="sr-only">Rule {{ props.index + 1 }} when</span>
        <select
          :aria-label="`Rule ${props.index + 1} when`"
          :value="windowValue(rule.window)"
          :class="selectClass"
          @change="setWindow(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in whenOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <ArrowRightIcon aria-hidden="true" class="size-4 shrink-0 text-muted" />

      <label class="min-w-0">
        <span class="sr-only">Rule {{ props.index + 1 }} restriction</span>
        <select
          :aria-label="`Rule ${props.index + 1} restriction`"
          :value="rule.restriction.kind"
          :class="selectClass"
          @change="setKind(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in kindOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <template v-if="rule.restriction.kind === 'dailyLimit'">
        <BaseInput
          type="text"
          inputmode="numeric"
          :aria-label="`Rule ${props.index + 1} daily limit minutes`"
          class="w-20"
          size="sm"
          :model-value="numberText(rule.restriction.minutes)"
          @beforeinput="preventNonDigitInput"
          @update:model-value="setNumber('minutes', $event)"
        />
        <span class="shrink-0 text-label-sm text-muted-foreground">min per day</span>
      </template>

      <template v-if="rule.restriction.kind === 'wait'">
        <BaseInput
          type="text"
          inputmode="numeric"
          :aria-label="`Rule ${props.index + 1} wait seconds`"
          class="w-16"
          size="sm"
          :model-value="numberText(rule.restriction.seconds)"
          @beforeinput="preventNonDigitInput"
          @update:model-value="setNumber('seconds', $event)"
        />
        <span class="shrink-0 text-label-sm text-muted-foreground">sec, then allow</span>
        <BaseInput
          type="text"
          inputmode="numeric"
          :aria-label="`Rule ${props.index + 1} grant minutes`"
          class="w-16"
          size="sm"
          :model-value="numberText(rule.restriction.grantMinutes)"
          @beforeinput="preventNonDigitInput"
          @update:model-value="setNumber('grantMinutes', $event)"
        />
        <span class="shrink-0 text-label-sm text-muted-foreground">min</span>
      </template>
    </div>

    <div
      v-if="rule.restriction.kind !== 'wait'"
      class="flex min-w-0 flex-wrap items-center gap-2 pl-1"
    >
      <span class="shrink-0 text-label-sm text-muted-foreground">When blocked, go to</span>
      <label class="min-w-0">
        <span class="sr-only">Rule {{ props.index + 1 }} destination</span>
        <select
          :aria-label="`Rule ${props.index + 1} destination`"
          :value="rule.destination?.type ?? 'blockedPage'"
          :class="selectClass"
          @change="setDestinationType(($event.target as HTMLSelectElement).value)"
        >
          <option value="blockedPage">Blocked page</option>
          <option value="redirect">Another URL</option>
        </select>
      </label>
      <BaseInput
        v-if="rule.destination?.type === 'redirect'"
        type="url"
        :aria-label="`Rule ${props.index + 1} destination URL`"
        placeholder="https://example.com"
        class="min-w-0 flex-1"
        size="sm"
        :model-value="destinationUrl()"
        @update:model-value="setDestinationUrl"
      />
    </div>

    <AlertMessage v-if="props.error">{{ props.error }}</AlertMessage>

    <ScheduleWindowEditor
      v-if="rule.window.type === 'scheduled'"
      :condition="rule.window.condition"
      :time-ranges="rule.window.timeRanges"
      :error="() => props.error"
      @update:condition="setCondition"
      @update:time-ranges="setTimeRanges"
      @touch="(field) => emit('touch', `window.${field}`)"
      @validity-change="(field, valid) => emit('validity-change', `window.${field}`, valid)"
    />
  </div>
</template>
