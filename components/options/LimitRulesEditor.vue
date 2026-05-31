<script setup lang="ts">
import { ClockIcon } from '@heroicons/vue/24/outline'
import { ref, watch } from 'vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import {
  DAYS,
  HALF_HOUR_CELLS,
  cellsToRanges,
  createDayRecord,
  minutesToTime,
  parseTimeRangeText,
  rangeToOverlappingCells,
  selectedCellsToRangeText,
} from '@/utils/datetime'
import type { DayOption } from '@/utils/datetime'
import type { DailyRule, DayOfWeek } from '@/utils/types'

/**
 * 制限ルール編集コンポーネントの props。
 */
interface Props {
  /** 編集モードかどうか。false のとき追加・削除ボタンを隠す。 */
  isEditing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
})

const dailyRules = defineModel<DailyRule[]>('dailyRules', { required: true })

const HOUR_MARKERS = [
  { label: '0', cell: 0 },
  { label: '6', cell: 12 },
  { label: '12', cell: 24 },
  { label: '18', cell: 36 },
  { label: '24', cell: 48 },
]

/**
 * UI 確認用の曜日別上限状態。
 */
interface MockDailyLimit {
  /** 上限分数。空文字なら上限なし。 */
  minutes: string
}

/**
 * UI 確認用の hover 中セル情報。
 */
interface HoveredCell {
  /** hover 中の曜日。 */
  day: DayOfWeek
  /** hover 中の 30 分セル番号。 */
  index: number
  /** tooltip の横位置。 */
  leftPercent: number
}

/**
 * 曜日番号を key にした UI 確認用状態。
 */
type DayRecord<T> = Record<DayOfWeek, T>

const selectedCells = ref<DayRecord<boolean[]>>(createInitialSelectedCells())
const timeRangeTexts = ref<DayRecord<string>>(createInitialTimeRangeTexts())
const dailyLimits = ref<DayRecord<MockDailyLimit>>(createInitialDailyLimits())
const pointerSelection = ref<{ active: boolean, selected: boolean, day?: DayOfWeek, startIndex?: number, baseCells?: boolean[] }>({ active: false, selected: false })
const hoveredCell = ref<HoveredCell | undefined>(undefined)

watch(dailyRules, () => {
  selectedCells.value = createInitialSelectedCells()
  timeRangeTexts.value = createInitialTimeRangeTexts()
  dailyLimits.value = createInitialDailyLimits()
}, { deep: true })

/** 既存のブロック時間帯を UI 確認用の 30 分セルへ粗く反映する。 */
function createInitialSelectedCells(): DayRecord<boolean[]> {
  const state = Object.fromEntries(DAYS.map(day => [day.value, Array.from({ length: 48 }, () => false)])) as DayRecord<boolean[]>

  for (const rule of dailyRules.value) {
    for (const range of rule.blockedTimeRanges) {
      for (const index of rangeToOverlappingCells(range)) {
        state[rule.dayOfWeek][index] = true
      }
    }
  }

  return state
}

/** 既存の閲覧上限を UI 確認用の曜日別上限へ粗く反映する。 */
function createInitialDailyLimits(): DayRecord<MockDailyLimit> {
  const state = Object.fromEntries(DAYS.map(day => [
    day.value,
    { minutes: '' },
  ])) as DayRecord<MockDailyLimit>

  for (const rule of dailyRules.value) {
    if (rule.dailyLimitMinutes !== undefined) {
      state[rule.dayOfWeek] = {
        minutes: String(rule.dailyLimitMinutes),
      }
    }
  }

  return state
}

/** 既存のブロック時間帯を曜日別テキスト入力の初期値へ反映する。 */
function createInitialTimeRangeTexts(): DayRecord<string> {
  const ranges = createDayRecord((): string[] => [])

  for (const rule of dailyRules.value) {
    for (const range of rule.blockedTimeRanges) {
      ranges[rule.dayOfWeek].push(`${minutesToTime(range.startMinute)}-${minutesToTime(range.endMinute)}`)
    }
  }

  return Object.fromEntries(DAYS.map(day => [day.value, ranges[day.value].join(', ')])) as DayRecord<string>
}

/** 指定曜日の保存ルールを返す。 */
function dailyRule(day: DayOfWeek): DailyRule {
  let rule = dailyRules.value.find(current => current.dayOfWeek === day)
  if (!rule) {
    rule = { dayOfWeek: day, blockedTimeRanges: [], dailyLimitMinutes: undefined }
    dailyRules.value.push(rule)
  }
  return rule
}

/** 30 分セルのアクセシブルなラベルを返す。 */
function cellLabel(day: DayOption, index: number): string {
  return `${day.label} ${cellTimeRangeLabel(index)}`
}

/** 30 分セルの時間帯ラベルを返す。 */
function cellTimeRangeLabel(index: number): string {
  return `${minutesToTime(index * 30)}-${minutesToTime((index + 1) * 30)}`
}

/** 30 分セルの開始時刻ラベルを返す。 */
function cellStartTimeLabel(index: number): string {
  return minutesToTime(index * 30)
}

/** ドラッグ中の選択範囲ラベルを返す。 */
function dragRangeLabel(day: DayOfWeek, index: number): string | undefined {
  if (!pointerSelection.value.active) return undefined
  if (pointerSelection.value.day !== day) return undefined
  if (pointerSelection.value.startIndex === undefined) return undefined

  const start = Math.min(pointerSelection.value.startIndex, index)
  const end = Math.max(pointerSelection.value.startIndex, index) + 1
  return `${minutesToTime(start * 30)}-${minutesToTime(end * 30)}`
}

/** hover 中セルに表示する tooltip ラベルを返す。 */
function hoveredCellLabel(cell: HoveredCell): string {
  return dragRangeLabel(cell.day, cell.index) ?? cellStartTimeLabel(cell.index)
}

/** UI 確認用グリッドのドラッグ範囲をまとめて切り替える。 */
function setCellRange(day: DayOfWeek, startIndex: number, endIndex: number, selected: boolean, baseCells?: boolean[]): void {
  if (baseCells) {
    selectedCells.value[day] = [...baseCells]
  }

  const start = Math.min(startIndex, endIndex)
  const end = Math.max(startIndex, endIndex)
  for (let index = start; index <= end; index += 1) {
    selectedCells.value[day][index] = selected
  }
  timeRangeTexts.value[day] = selectedCellsToRangeText(selectedCells.value[day])
  dailyRule(day).blockedTimeRanges = cellsToRanges(selectedCells.value[day])
}

/** ポインター操作開始時にセルの新しい選択状態を決める。 */
function startCellSelection(day: DayOfWeek, index: number): void {
  if (!props.isEditing) return

  const selected = !selectedCells.value[day][index]
  const baseCells = [...selectedCells.value[day]]
  pointerSelection.value = { active: true, selected, day, startIndex: index, baseCells }
  setHoveredCell(day, index)
  setCellRange(day, index, index, selected, baseCells)
}

/** ドラッグ中のセルへ選択状態を反映する。 */
function continueCellSelection(day: DayOfWeek, index: number): void {
  setHoveredCell(day, index)
  if (!props.isEditing) return
  if (!pointerSelection.value.active) return
  if (pointerSelection.value.day !== day) return
  if (pointerSelection.value.startIndex === undefined) return
  setCellRange(day, pointerSelection.value.startIndex, index, pointerSelection.value.selected, pointerSelection.value.baseCells)
}

/** ポインター操作の選択状態を終了する。 */
function endCellSelection(): void {
  pointerSelection.value = { active: false, selected: pointerSelection.value.selected }
}

/** hover 中セル情報を更新する。 */
function setHoveredCell(day: DayOfWeek, index: number): void {
  hoveredCell.value = {
    day,
    index,
    leftPercent: Math.min(85, Math.max(15, ((index + 0.5) / HALF_HOUR_CELLS.length) * 100)),
  }
}

/** hover 中セル情報を消す。 */
function clearHoveredCell(): void {
  hoveredCell.value = undefined
}

/** 上限分数を更新する。 */
function setDailyLimitMinutes(day: DayOfWeek, value: string | number | undefined): void {
  const text = String(value ?? '').replace(/\D/g, '')
  dailyLimits.value[day].minutes = text
  dailyRule(day).dailyLimitMinutes = text === '' ? undefined : Number(text)
}

/** 数字以外の入力を事前に止める。 */
function preventNonDigitInput(event: InputEvent): void {
  if (event.data === null) return
  if (/^\d+$/.test(event.data)) return
  event.preventDefault()
}

/** 上限分数入力に表示する値を返す。 */
function dailyLimitDisplayValue(day: DayOfWeek, editing: boolean): string {
  const minutes = dailyLimits.value[day].minutes
  if (editing || minutes !== '') return minutes
  return 'No limit'
}

/** 読み取り表示用のブロック時間帯テキストを返す。 */
function blockedTimeDisplayValue(day: DayOfWeek): string {
  return timeRangeTexts.value[day] || 'No blocked time'
}

/** 上限分数が指定されているかどうかを返す。 */
function hasDailyLimit(day: DayOfWeek): boolean {
  return dailyLimits.value[day].minutes !== ''
}

/** 時間帯テキストを更新し、範囲と重なるセルをグリッドへ反映する。 */
function setTimeRangeText(day: DayOfWeek, value: string | number | undefined): void {
  const text = String(value ?? '')
  timeRangeTexts.value[day] = text

  const ranges = parseTimeRangeText(text)
  if (!ranges) return

  selectedCells.value[day] = Array.from({ length: 48 }, () => false)
  for (const range of ranges) {
    for (const index of rangeToOverlappingCells(range)) {
      selectedCells.value[day][index] = true
    }
  }
  dailyRule(day).blockedTimeRanges = ranges
}

/** 時間帯テキストが不正かどうかを返す。 */
function isTimeRangeTextInvalid(day: DayOfWeek): boolean {
  return parseTimeRangeText(timeRangeTexts.value[day]) === undefined
}

</script>

<template>
  <section class="min-w-0 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-semibold">
        <ClockIcon
          aria-hidden="true"
          class="size-4 text-muted"
        />
        Blocking rules
      </h3>
    </div>

    <div
      class="max-w-full overflow-hidden rounded-lg border border-border bg-background"
      @pointerup="endCellSelection"
      @pointerleave="endCellSelection(); clearHoveredCell()"
    >
      <div
        class="overflow-x-auto"
        :class="isEditing ? 'bg-surface-muted' : 'bg-background'"
      >
        <div
          class="grid w-full grid-cols-[3.75rem_minmax(0,1fr)] border-b border-border bg-background px-2 py-1.5 sm:grid-cols-[3.75rem_20rem_minmax(12rem,1fr)_7.5rem]"
        >
          <span class="text-label-sm text-muted-foreground">Day</span>
          <div class="relative h-5">
            <span
              v-for="marker in HOUR_MARKERS"
              :key="marker.label"
              class="absolute top-0 -translate-x-1/2 text-label-sm text-muted-foreground"
              :style="{ left: `${(marker.cell / 48) * 100}%` }"
            >
              {{ marker.label }}
            </span>
          </div>
          <span class="hidden whitespace-nowrap pl-6 text-label-sm text-muted-foreground sm:block">Blocked time</span>
          <span class="hidden whitespace-nowrap pl-3 text-label-sm text-muted-foreground sm:block">Daily limit (min)</span>
        </div>

        <div
          v-for="day in DAYS"
          :key="day.value"
          class="grid w-full grid-cols-[3.75rem_minmax(0,1fr)] items-stretch border-b border-border px-2 py-2 last:border-b-0 sm:grid-cols-[3.75rem_20rem_minmax(12rem,1fr)_7.5rem]"
        >
          <div class="flex items-center pr-3 text-sm font-semibold text-secondary-foreground">
            {{ day.label }}
          </div>

          <div
            class="relative grid h-8 select-none overflow-visible rounded-md border border-border bg-background"
            style="grid-template-columns: repeat(48, minmax(0, 1fr));"
            @pointerup="endCellSelection"
            @pointerleave="clearHoveredCell"
          >
            <button
              v-for="index in HALF_HOUR_CELLS"
              :key="index"
              type="button"
              class="h-8 min-w-0 transition focus:relative focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring"
              :class="[
                selectedCells[day.value][index]
                  ? 'bg-primary hover:bg-primary-hover'
                  : 'bg-background hover:bg-accent',
              ]"
              :disabled="!isEditing"
              :aria-label="cellLabel(day, index)"
              :aria-pressed="selectedCells[day.value][index]"
              @pointerdown.prevent="startCellSelection(day.value, index)"
              @pointerenter="continueCellSelection(day.value, index)"
              @focus="setHoveredCell(day.value, index)"
              @blur="clearHoveredCell"
            />
            <div
              v-if="hoveredCell?.day === day.value"
              class="pointer-events-none absolute -top-8 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-sm"
              :style="{ left: `${hoveredCell.leftPercent}%` }"
            >
              {{ hoveredCellLabel(hoveredCell) }}
            </div>
          </div>

          <div class="col-span-2 mt-1.5 min-w-0 pl-15 sm:col-span-1 sm:mt-0 sm:pl-6">
            <label class="block min-w-0">
              <span class="sr-only">{{ day.label }} blocked time ranges</span>
              <BaseInput
                v-if="isEditing"
                type="text"
                :aria-label="`${day.label} blocked time ranges`"
                placeholder="09:00-12:30, 22:00-01:30"
                class="w-full"
                size="sm"
                monospace
                :model-value="timeRangeTexts[day.value]"
                :invalid="isTimeRangeTextInvalid(day.value)"
                @update:model-value="setTimeRangeText(day.value, $event)"
              />
              <output
                v-else
                :aria-label="`${day.label} blocked time ranges`"
                class="flex h-8 min-w-0 items-center truncate text-sm font-mono text-input-foreground"
              >
                {{ blockedTimeDisplayValue(day.value) }}
              </output>
            </label>
          </div>

          <div class="col-span-2 mt-1.5 flex min-w-0 items-center gap-1.5 pl-15 sm:col-span-1 sm:mt-0 sm:pl-3">
            <label class="min-w-0">
              <span class="sr-only">{{ day.label }} daily limit minutes</span>
              <BaseInput
                v-if="isEditing"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                :aria-label="`${day.label} daily limit minutes`"
                placeholder="No limit"
                class="w-20"
                size="sm"
                :model-value="dailyLimitDisplayValue(day.value, isEditing)"
                @beforeinput="preventNonDigitInput"
                @update:model-value="setDailyLimitMinutes(day.value, $event)"
              />
              <output
                v-else
                :aria-label="`${day.label} daily limit minutes`"
                class="flex h-8 min-w-0 items-center text-sm text-input-foreground"
              >
                {{ dailyLimitDisplayValue(day.value, false) }}
              </output>
            </label>
            <span
              class="shrink-0 text-xs font-medium text-muted-foreground"
              :class="hasDailyLimit(day.value) ? '' : 'invisible'"
            >m</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
