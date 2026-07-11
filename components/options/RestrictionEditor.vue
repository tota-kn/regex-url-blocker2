<script setup lang="ts">
import { ShieldExclamationIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { createDefaultRestriction } from '@/utils/defaults'
import { formatRestriction } from '@/utils/groups'
import type { RestrictionRule, RestrictionType } from '@/utils/types'

/**
 * 制限欄（禁止・猶予・待機の単一選択）の props。
 */
interface Props {
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
  /** 指定フィールドのバリデーションエラーメッセージを返す関数。 */
  error?: (field: 'graceMinutes' | 'waitSeconds' | 'condition' | 'timeRanges') => string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
  error: () => undefined,
})

const restriction = defineModel<RestrictionRule>({ required: true })

/** セグメントコントロールに渡す選択肢。 */
const typeOptions = [
  { value: 'block', label: 'Block', ariaLabel: 'Restriction type Block' },
  { value: 'grace', label: 'Grace', ariaLabel: 'Restriction type Grace' },
  { value: 'wait', label: 'Wait', ariaLabel: 'Restriction type Wait' },
]

/** セグメントコントロールの現在値。 */
const selectedType = computed<string>(() => restriction.value.type)

/** 制限種別を切り替える。既存の condition/timeRanges は引き継ぐ。 */
function setType(value: string): void {
  if (value !== 'block' && value !== 'grace' && value !== 'wait') return
  restriction.value = createDefaultRestriction(value as RestrictionType, restriction.value)
}

/** 猶予・待機のテキスト入力の作業状態。 */
const graceMinutesText = ref('')
const waitSecondsText = ref('')

/** props からテキスト入力の初期状態を作る。 */
function syncTexts(): void {
  graceMinutesText.value = restriction.value?.type === 'grace' && restriction.value.graceMinutes !== undefined
    ? String(restriction.value.graceMinutes)
    : ''
  waitSecondsText.value = restriction.value?.type === 'wait' && restriction.value.waitSeconds !== undefined
    ? String(restriction.value.waitSeconds)
    : ''
}

watch(restriction, syncTexts, { immediate: true, deep: true })

/** 猶予の1日上限分数を更新する。 */
function setGraceMinutesText(value: string | number | undefined): void {
  const text = String(value ?? '').replace(/\D/g, '')
  graceMinutesText.value = text
  if (restriction.value.type !== 'grace') return
  restriction.value.graceMinutes = text === '' ? undefined : Number(text)
}

/** 待機の秒数を更新する。 */
function setWaitSecondsText(value: string | number | undefined): void {
  const text = String(value ?? '').replace(/\D/g, '')
  waitSecondsText.value = text
  if (restriction.value.type !== 'wait') return
  restriction.value.waitSeconds = text === '' ? undefined : Number(text)
}

/** 数字以外の入力を事前に止める。 */
function preventNonDigitInput(event: InputEvent): void {
  if (event.data === null) return
  if (/^\d+$/.test(event.data)) return
  event.preventDefault()
}
</script>

<template>
  <section class="min-w-0 space-y-3">
    <h3 class="flex items-center gap-1.5 text-label-md">
      <ShieldExclamationIcon
        aria-hidden="true"
        class="size-4 text-muted"
      />
      Restriction
    </h3>

    <template v-if="isEditing">
      <SegmentedControl
        aria-label="Restriction type"
        :options="typeOptions"
        :model-value="selectedType"
        @update:model-value="setType"
      />

      <label
        v-if="restriction.type === 'grace'"
        class="flex min-w-0 items-center gap-1.5"
      >
        <span class="shrink-0 whitespace-nowrap text-label-md text-secondary-foreground">Allow up to</span>
        <BaseInput
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          aria-label="Grace minutes per day"
          placeholder="0"
          class="w-24"
          size="sm"
          :model-value="graceMinutesText"
          @beforeinput="preventNonDigitInput"
          @update:model-value="setGraceMinutesText"
        />
        <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground">min/day</span>
      </label>
      <AlertMessage v-if="restriction.type === 'grace' && props.error('graceMinutes')">
        {{ props.error('graceMinutes') }}
      </AlertMessage>

      <label
        v-if="restriction.type === 'wait'"
        class="flex min-w-0 items-center gap-1.5"
      >
        <span class="shrink-0 whitespace-nowrap text-label-md text-secondary-foreground">Wait</span>
        <BaseInput
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          aria-label="Wait seconds before access"
          placeholder="0"
          class="w-24"
          size="sm"
          :model-value="waitSecondsText"
          @beforeinput="preventNonDigitInput"
          @update:model-value="setWaitSecondsText"
        />
        <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground">sec before access</span>
      </label>
      <AlertMessage v-if="restriction.type === 'wait' && props.error('waitSeconds')">
        {{ props.error('waitSeconds') }}
      </AlertMessage>
    </template>

    <output
      v-else
      aria-label="Restriction"
      class="block text-body-md text-input-foreground"
    >
      {{ formatRestriction(restriction) }}
    </output>
  </section>
</template>
