<script setup lang="ts">
import { ref, watch } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { createDefaultRestriction } from '@/utils/defaults'
import { formatStandaloneRestriction } from '@/utils/groups'
import type { Restriction, RestrictionType } from '@/utils/types'

/**
 * 制限欄（禁止・猶予・待機の単一選択）の props。
 */
interface Props {
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
  /** 指定フィールドのバリデーションエラーメッセージを返す関数。 */
  error?: (
    field: 'type' | 'graceMinutes' | 'waitSeconds' | 'waitGrantMinutes' | 'redirectUrl',
  ) => string | undefined
}

const emit = defineEmits<{
  /** 編集したフィールドを親フォームへ伝える。 */ touch: [field: string]
}>()

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
  error: () => undefined,
})

const restriction = defineModel<Restriction>({ required: true })

/** プルダウンに表示する制限種別の選択肢。 */
const typeOptions = [
  { value: 'block', label: 'Block' },
  { value: 'redirect', label: 'Redirect' },
  { value: 'grace', label: 'Daily limit' },
  { value: 'wait', label: 'Wait' },
] satisfies { value: RestrictionType; label: string }[]

/** 制限種別を切り替える。 */
function setType(value: string): void {
  if (value !== 'block' && value !== 'redirect' && value !== 'grace' && value !== 'wait') return
  restriction.value = createDefaultRestriction(value as RestrictionType)
  emit('touch', 'type')
}

/** redirect の遷移先 URL を更新する。 */
function setRedirectUrl(value: string | number | undefined): void {
  emit('touch', 'redirectUrl')
  if (restriction.value.type !== 'redirect') return
  restriction.value.redirectUrl = value === undefined ? '' : String(value)
}

/** 猶予・待機のテキスト入力の作業状態。 */
const graceMinutesText = ref('')
const waitSecondsText = ref('')
const waitGrantMinutesText = ref('')

/** props からテキスト入力の初期状態を作る。 */
function syncTexts(): void {
  graceMinutesText.value =
    restriction.value?.type === 'grace' && restriction.value.graceMinutes !== undefined
      ? String(restriction.value.graceMinutes)
      : ''
  waitSecondsText.value =
    restriction.value?.type === 'wait' && restriction.value.waitSeconds !== undefined
      ? String(restriction.value.waitSeconds)
      : ''
  waitGrantMinutesText.value =
    restriction.value?.type === 'wait' && restriction.value.waitGrantMinutes !== undefined
      ? String(restriction.value.waitGrantMinutes)
      : ''
}

watch(restriction, syncTexts, { immediate: true, deep: true })

/** 猶予の1日上限分数を更新する。 */
function setGraceMinutesText(value: string | number | undefined): void {
  emit('touch', 'graceMinutes')
  const text = String(value ?? '').replace(/\D/g, '')
  graceMinutesText.value = text
  if (restriction.value.type !== 'grace') return
  restriction.value.graceMinutes = text === '' ? undefined : Number(text)
}

/** 待機の秒数を更新する。 */
function setWaitSecondsText(value: string | number | undefined): void {
  emit('touch', 'waitSeconds')
  const text = String(value ?? '').replace(/\D/g, '')
  waitSecondsText.value = text
  if (restriction.value.type !== 'wait') return
  restriction.value.waitSeconds = text === '' ? undefined : Number(text)
}

/** Wait 通過後の許可期間（分）を更新する。 */
function setWaitGrantMinutesText(value: string | number | undefined): void {
  emit('touch', 'waitGrantMinutes')
  const text = String(value ?? '').replace(/\D/g, '')
  waitGrantMinutesText.value = text
  if (restriction.value.type !== 'wait') return
  restriction.value.waitGrantMinutes = text === '' ? undefined : Number(text)
}

/** 数字以外の入力を事前に止める。 */
function preventNonDigitInput(event: InputEvent): void {
  if (event.data === null) return
  if (/^\d+$/.test(event.data)) return
  event.preventDefault()
}
</script>

<template>
  <div class="min-w-0 space-y-3">
    <template v-if="isEditing">
      <label class="block min-w-0">
        <span class="sr-only">Restriction type</span>
        <select
          aria-label="Restriction type"
          :value="restriction.type"
          class="h-8 min-w-0 rounded-lg border border-field-border bg-field px-2 text-body-md text-input-foreground outline-none transition hover:border-field-border-hover hover:bg-field-hover focus:border-primary focus:ring-2 focus:ring-ring/50"
          @change="setType(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in typeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <AlertMessage v-if="props.error('type')">{{ props.error('type') }}</AlertMessage>

      <label v-if="restriction.type === 'redirect'" class="block min-w-0 space-y-1.5">
        <span class="block text-label-md text-secondary-foreground">Redirect URL</span>
        <BaseInput
          type="url"
          aria-label="Redirect URL"
          placeholder="https://example.com"
          class="w-full"
          size="sm"
          :model-value="restriction.redirectUrl ?? ''"
          :invalid="Boolean(props.error('redirectUrl'))"
          @update:model-value="setRedirectUrl"
        />
      </label>
      <AlertMessage v-if="restriction.type === 'redirect' && props.error('redirectUrl')">
        {{ props.error('redirectUrl') }}
      </AlertMessage>

      <label v-if="restriction.type === 'grace'" class="flex min-w-0 items-center gap-1.5">
        <span class="shrink-0 whitespace-nowrap text-label-md text-secondary-foreground"
          >Allow up to</span
        >
        <BaseInput
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          aria-label="Daily limit minutes per day"
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

      <div v-if="restriction.type === 'wait'" class="space-y-2">
        <label class="flex min-w-0 items-center gap-1.5">
          <span class="shrink-0 whitespace-nowrap text-label-md text-secondary-foreground"
            >Wait</span
          >
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
          <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground"
            >sec before access</span
          >
        </label>
        <label class="flex min-w-0 items-center gap-1.5">
          <span class="shrink-0 whitespace-nowrap text-label-md text-secondary-foreground"
            >Allow for</span
          >
          <BaseInput
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            aria-label="Minutes allowed after wait"
            placeholder="1"
            class="w-24"
            size="sm"
            :model-value="waitGrantMinutesText"
            @beforeinput="preventNonDigitInput"
            @update:model-value="setWaitGrantMinutesText"
          />
          <span class="shrink-0 whitespace-nowrap text-label-sm text-muted-foreground"
            >min after passing</span
          >
        </label>
        <AlertMessage v-if="restriction.type === 'wait' && props.error('waitSeconds')">
          {{ props.error('waitSeconds') }}
        </AlertMessage>
        <AlertMessage v-if="restriction.type === 'wait' && props.error('waitGrantMinutes')">
          {{ props.error('waitGrantMinutes') }}
        </AlertMessage>
      </div>
    </template>

    <output v-else aria-label="Restriction" class="block text-body-md text-input-foreground">
      {{ formatStandaloneRestriction(restriction) }}
    </output>
  </div>
</template>
