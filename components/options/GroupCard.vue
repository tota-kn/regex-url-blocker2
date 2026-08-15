<script setup lang="ts">
import {
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  EllipsisVerticalIcon,
  LockClosedIcon,
  NoSymbolIcon,
  PauseIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { sortRulesByEvaluationOrder } from '@/utils/blocking'
import type { TimeLimitUsageSummary } from '@/utils/usageCounters'
import { DEFAULT_PAUSE_DURATION_MINUTES, DEFAULT_PAUSE_WAIT_SECONDS } from '@/utils/defaults'
import { getPendingGroupFieldKeys, resolveEffectiveGroup } from '@/utils/effectiveSettings'
import { getGroupPauseButtonState } from '@/utils/groupPause'
import { cloneGroup } from '@/utils/groups'
import type { GlobalSettings, Group, GroupPauseEntry } from '@/utils/types'
import { validateGroup } from '@/utils/validation'
import { useValidationFeedback } from '@/utils/useValidationFeedback'
import { useDismissOnOutsidePointer } from '@/utils/useDismissOnOutsidePointer'
import TimeLimitMeter from '../TimeLimitMeter.vue'
import PatternListEditor from './PatternListEditor.vue'
import PendingFieldNote from './PendingFieldNote.vue'
import RuleListEditor from './RuleListEditor.vue'

/**
 * グループカードの props。
 */
interface Props {
  /** 保存済み、または新規作成中のグループ。 */
  group: Group
  /** 初回表示から編集モードで開くかどうか。 */
  startInEdit?: boolean
  /** 新規作成中の未保存グループかどうか。 */
  isNew?: boolean
  pauseEntry?: GroupPauseEntry
  /** 一時停止表示の残り時間計算に使う現在時刻。 */
  now?: Date
  /** ルールの現在状態プレビューに使うグローバル設定。 */
  globalSettings: GlobalSettings
  /** 一時停止操作を無効化するときに表示する理由。 */
  pauseDisabledReason?: string
  /** 今日の上限利用状況。今日有効な上限がなければ undefined。 */
  timeLimitUsageSummary?: TimeLimitUsageSummary
  /** 読み取り専用表示にして編集・削除・Pause を含む操作を無効化するかどうか。 */
  readOnly?: boolean
  /** 保存設定へ戻す Restore 操作を表示するかどうか。 */
  restorable?: boolean
  /** このグループの基準スナップショット。Lock Mode の保留状況の算出に使う。 */
  effectiveGroup?: Group
  /** 保留中の制限が反映される日時。 */
  appliesAfterLabel?: string
}

/**
 * グループカードが親へ通知するイベント。
 */
interface Emits {
  save: [group: Group]
  cancel: []
  remove: []
  duplicate: []
  requestPause: []
  restore: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/**
 * 編集フォームに反映するグループの作業コピー。
 */
const draft = ref<Group>(cloneGroup(props.group))
const validationFeedback = useValidationFeedback()
const invalidTextFields = ref<Set<string>>(new Set())

const isEditing = ref(props.readOnly ? false : (props.startInEdit ?? false))
const isOptionsOpen = ref(false)
const isActionMenuOpen = ref(false)
const actionMenuRoot = ref<HTMLElement | null>(null)

const draftErrors = computed(() => validateGroup(draft.value, { requireConfiguredSections: true }))
const draftRules = computed({
  get: () => draft.value.rules,
  set: (rules) => {
    draft.value.rules = rules
  },
})
/** 保留状況の比較対象。編集中は入力中のドラフト、それ以外は保存済みの値を使う。 */
const comparedGroup = computed(() => (isEditing.value ? draft.value : props.group))
/** Lock Mode により希望値がまだ適用されていないフィールドのキー。 */
const pendingFieldKeys = computed<Array<keyof Group>>(() =>
  props.effectiveGroup ? getPendingGroupFieldKeys(props.effectiveGroup, comparedGroup.value) : [],
)
/** いま実際に適用されている値へ解決したグループ。 */
const resolvedGroup = computed(() =>
  props.effectiveGroup
    ? resolveEffectiveGroup(props.effectiveGroup, comparedGroup.value)
    : comparedGroup.value,
)
/** いま実際に適用されている一時停止の待機秒数。 */
const effectivePauseWaitSeconds = computed(() => resolvedGroup.value.pauseWaitSeconds)
/** いま実際に適用されている一時停止の継続分数。 */
const effectivePauseDurationMinutes = computed(() => resolvedGroup.value.pauseDurationMinutes)
/** 保留中フィールドに添える適用時期の文言。 */
const pendingUntilLabel = computed(() =>
  props.appliesAfterLabel ? `until ${props.appliesAfterLabel}` : 'until the next rule day',
)
/** 一時停止設定のうち保留中の項目を、いま効いている値の文言として並べる。 */
const pendingPauseNote = computed(() => {
  const parts: string[] = []
  if (isFieldPending('pauseAllowed')) parts.push('not allowed')
  if (isFieldPending('pauseWaitSeconds')) {
    parts.push(`wait ${effectivePauseWaitSeconds.value} sec`)
  }
  if (isFieldPending('pauseDurationMinutes')) {
    parts.push(`pause for ${effectivePauseDurationMinutes.value} min`)
  }
  if (parts.length === 0) return undefined
  return `Still ${parts.join(', ')} ${pendingUntilLabel.value}.`
})
const visibleOptionSummaries = computed(() => {
  const summaries: Array<{ label: string; value: string; pending?: string }> = []
  const lockModeLabel = 'Delay relaxed restrictions until next rule day'
  if (props.group.lockMode) {
    summaries.push({ label: lockModeLabel, value: 'On' })
  } else if (isFieldPending('lockMode')) {
    summaries.push({
      label: lockModeLabel,
      value: 'Off',
      pending: `Still on ${pendingUntilLabel.value}.`,
    })
  }
  const pauseWaitSeconds = props.group.pauseWaitSeconds
  const pauseDurationMinutes = props.group.pauseDurationMinutes
  if (props.group.pauseAllowed === false) {
    summaries.push({ label: 'Pause', value: 'Not allowed', pending: pendingPauseNote.value })
  } else if (
    pauseWaitSeconds !== DEFAULT_PAUSE_WAIT_SECONDS ||
    pauseDurationMinutes !== DEFAULT_PAUSE_DURATION_MINUTES ||
    pendingPauseNote.value
  ) {
    summaries.push({
      label: 'Pause',
      value: `Wait ${pauseWaitSeconds} sec, pause for ${pauseDurationMinutes} min`,
      pending: pendingPauseNote.value,
    })
  }
  return summaries
})
const pauseButtonState = computed(() =>
  getGroupPauseButtonState(props.pauseEntry, props.now ?? new Date()),
)
const pauseButtonLabel = computed(() => pauseButtonState.value.label)
const effectivePauseDisabledReason = computed(() => {
  if (props.pauseDisabledReason) return props.pauseDisabledReason
  if (props.group.pauseAllowed === false) return 'Pause is turned off for this group.'
  return props.group.disabled ? 'Enable this group to use Pause.' : undefined
})
const canRequestPause = computed(() => {
  if (effectivePauseDisabledReason.value) return false
  return !pauseButtonState.value.paused
})
const disabledToggleLabel = computed(() => (props.group.disabled ? 'Enable' : 'Disable'))
const showsPauseMenuItem = computed(
  () => !props.isNew && !props.readOnly && !pauseButtonState.value.paused,
)
const showsDisabledToggleMenuItem = computed(() => !props.isNew && !props.readOnly)
const showsDuplicateMenuItem = computed(() => !props.isNew && !props.readOnly)
const showsDeleteMenuItem = computed(() => !props.readOnly)
const showsActionMenu = computed(() => {
  if (isEditing.value || props.isNew) return false
  return (
    showsPauseMenuItem.value ||
    showsDisabledToggleMenuItem.value ||
    showsDuplicateMenuItem.value ||
    showsDeleteMenuItem.value
  )
})

watch(
  () => props.group,
  (group) => {
    if (isEditing.value) return
    draft.value = cloneGroup(group)
  },
  { deep: true },
)

watch(showsActionMenu, (visible) => {
  if (visible) return
  closeActionMenu()
})

/** 指定フィールドが Lock Mode により保留中なら true。 */
function isFieldPending(key: keyof Group): boolean {
  return pendingFieldKeys.value.includes(key)
}

/** 指定フィールドのドラフト検証エラーメッセージを返す。 */
function draftError(field: string): string | undefined {
  const error = draftErrors.value.find((e) => e.field === field)
  return error && validationFeedback.shouldShow(error.field) ? error.message : undefined
}

/** 指定パターン番号のドラフト検証エラーメッセージを返す。 */
function patternError(index: number): string | undefined {
  return draftError(`patterns[${index}]`)
}

/** URL pattern 一覧全体のドラフト検証エラーを返す。 */
function patternsSectionError(): string | undefined {
  return draftError('patterns')
}

/** 指定ルールのドラフト検証エラーメッセージを返す。 */
function ruleError(index: number): string | undefined {
  const prefix = `rules[${index}]`
  const error = draftErrors.value.find((e) => e.field.startsWith(`${prefix}.`))
  return error && validationFeedback.shouldShow(error.field) ? error.message : undefined
}

/** ルール一覧全体のドラフト検証エラーを返す。 */
function rulesSectionError(): string | undefined {
  return draftError('rules')
}

/** 編集モードを開始し、現在の保存済み値からドラフトを作り直す。 */
function startEditing(): void {
  if (props.readOnly) return
  draft.value = cloneGroup(props.group)
  validationFeedback.reset()
  invalidTextFields.value = new Set()
  isOptionsOpen.value = false
  closeActionMenu()
  isEditing.value = true
}

/** 編集内容を破棄する。新規グループの場合はカード自体を閉じる。 */
function cancelEditing(): void {
  if (props.isNew) {
    emit('cancel')
    return
  }
  draft.value = cloneGroup(props.group)
  validationFeedback.reset()
  invalidTextFields.value = new Set()
  isEditing.value = false
}

/** エラーがない場合だけドラフトを保存値として親へ通知する。 */
function saveEditing(): void {
  if (props.readOnly) return
  validationFeedback.showAllErrors()
  if (draftErrors.value.length > 0 || invalidTextFields.value.size > 0) return
  // 保存時に評価順へ並べ替え、表示順と実際の適用順を一致させる。
  draft.value.rules = sortRulesByEvaluationOrder(draft.value.rules)
  emit('save', cloneGroup(draft.value))
  isOptionsOpen.value = false
  closeActionMenu()
  isEditing.value = false
}

/** Options 全体の disclosure panel 表示を切り替える。 */
function toggleOptions(): void {
  isOptionsOpen.value = !isOptionsOpen.value
}

/** グループアクションメニューを開閉する。 */
function toggleActionMenu(): void {
  if (!showsActionMenu.value) return
  isActionMenuOpen.value = !isActionMenuOpen.value
}

/** グループアクションメニューを閉じる。 */
function closeActionMenu(): void {
  isActionMenuOpen.value = false
}

/** 一時停止要求を親へ通知し、メニューを閉じる。 */
function requestPause(): void {
  if (!canRequestPause.value) return
  closeActionMenu()
  emit('requestPause')
}

/** グループの永続的な無効化状態を切り替え、保存要求として親へ通知する。 */
function toggleGroupDisabled(): void {
  if (props.readOnly) return
  closeActionMenu()
  emit('save', {
    ...cloneGroup(props.group),
    disabled: !props.group.disabled,
  })
}

/** グループ複製要求を親へ通知し、メニューを閉じる。 */
function duplicateGroup(): void {
  if (props.readOnly || props.isNew) return
  closeActionMenu()
  emit('duplicate')
}

/** 保存設定への復元要求を親へ通知する。 */
function restoreGroup(): void {
  if (!props.restorable) return
  emit('restore')
}

/** 削除要求を親へ通知し、メニューを閉じる。 */
function removeGroup(): void {
  closeActionMenu()
  emit('remove')
}

/** グループアクションメニューに紐づく一意な DOM id を返す。 */
function actionMenuId(): string {
  return `group-actions-menu-${props.group.id}`
}

/** 一時停止操作の無効理由に紐づく一意な DOM id を返す。 */
function pauseDisabledReasonId(): string {
  return `group-pause-disabled-reason-${props.group.id}`
}

/** Pause 時間の数値入力を作業中グループへ反映する。 */
function setPauseSetting(field: 'pauseWaitSeconds' | 'pauseDurationMinutes', value: string): void {
  validationFeedback.touch(field)
  draft.value[field] = value === '' ? Number.NaN : Number(value)
}

/** 子エディタが編集したフィールドを検証表示の対象にする。 */
function touchField(field: string): void {
  validationFeedback.touch(field)
}

/** テキスト入力の一時的な妥当性を保存可否へ反映する。 */
function setTextFieldValidity(field: string, valid: boolean): void {
  const next = new Set(invalidTextFields.value)
  if (valid) next.delete(field)
  else next.add(field)
  invalidTextFields.value = next
}

/** Options 全体の disclosure panel に紐づく一意な DOM id を返す。 */
function optionsPanelId(): string {
  return `options-panel-${props.group.id}`
}

useDismissOnOutsidePointer(actionMenuRoot, isActionMenuOpen, closeActionMenu)
</script>

<template>
  <article
    class="min-w-0 overflow-hidden rounded-lg border bg-background shadow-sm"
    :class="isNew ? 'border-primary/40' : 'border-border'"
  >
    <div v-if="isNew" class="border-b border-primary/20 bg-accent px-4 py-2">
      <span class="inline-flex rounded-sm bg-surface px-1.5 py-1 text-label-sm text-primary">
        New group
      </span>
    </div>

    <div class="border-b border-border bg-background p-4">
      <div class="space-y-2.5">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label class="block min-w-0 flex-1">
            <span class="sr-only">Name</span>
            <BaseInput
              v-model="draft.name"
              aria-label="Name"
              :disabled="!isEditing"
              :display="isEditing ? 'editable' : 'readonly'"
              size="sm"
              class="w-full text-heading-md"
              :invalid="isEditing && Boolean(draftError('name'))"
              @input="touchField('name')"
            />
          </label>

          <div class="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            <span
              v-if="!isEditing && !isNew && group.disabled"
              class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-label-md text-muted"
              role="status"
            >
              <NoSymbolIcon aria-hidden="true" class="size-4" />
              Disabled
            </span>
            <span
              v-if="!isEditing && !isNew && pauseButtonState.paused"
              class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-label-md text-secondary-foreground"
              role="status"
              aria-live="polite"
            >
              <ClockIcon aria-hidden="true" class="size-4" />
              {{ pauseButtonState.label }}
            </span>
            <BaseButton
              v-if="restorable"
              type="button"
              aria-label="Restore group"
              variant="primary"
              @click="restoreGroup"
            >
              <ArrowUturnLeftIcon aria-hidden="true" class="size-4" />
              Restore
            </BaseButton>
            <BaseButton
              v-if="!isEditing && !readOnly"
              type="button"
              aria-label="Edit group"
              variant="ghost"
              @click="startEditing"
            >
              <PencilSquareIcon aria-hidden="true" class="size-4" />
              Edit
            </BaseButton>
            <div
              v-if="showsActionMenu"
              ref="actionMenuRoot"
              class="relative"
              @keydown.escape.stop.prevent="closeActionMenu"
            >
              <BaseButton
                type="button"
                aria-label="Group actions"
                aria-haspopup="menu"
                :aria-controls="actionMenuId()"
                :aria-expanded="isActionMenuOpen"
                size="icon-md"
                @click="toggleActionMenu"
              >
                <EllipsisVerticalIcon aria-hidden="true" class="size-5" />
              </BaseButton>

              <div
                v-if="isActionMenuOpen"
                :id="actionMenuId()"
                role="menu"
                class="absolute right-0 z-20 mt-2 min-w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
              >
                <div v-if="showsPauseMenuItem">
                  <button
                    type="button"
                    role="menuitem"
                    :aria-label="pauseButtonLabel"
                    :aria-describedby="
                      effectivePauseDisabledReason ? pauseDisabledReasonId() : undefined
                    "
                    :disabled="!canRequestPause"
                    class="flex h-9 w-full items-center gap-2 px-3 text-left text-label-md text-secondary-foreground transition hover:bg-secondary-hover focus:bg-secondary-hover focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                    @click="requestPause"
                  >
                    <PauseIcon aria-hidden="true" class="size-4 shrink-0" />
                    <span>{{ pauseButtonLabel }}</span>
                  </button>
                  <p
                    v-if="effectivePauseDisabledReason"
                    :id="pauseDisabledReasonId()"
                    class="px-3 pb-2 text-body-sm text-muted"
                  >
                    {{ effectivePauseDisabledReason }}
                  </p>
                </div>
                <button
                  v-if="showsDisabledToggleMenuItem"
                  type="button"
                  role="menuitem"
                  :aria-label="disabledToggleLabel"
                  class="flex h-9 w-full items-center gap-2 px-3 text-left text-label-md text-secondary-foreground transition hover:bg-secondary-hover focus:bg-secondary-hover focus:outline-none"
                  @click="toggleGroupDisabled"
                >
                  <CheckCircleIcon
                    v-if="group.disabled"
                    aria-hidden="true"
                    class="size-4 shrink-0"
                  />
                  <NoSymbolIcon v-else aria-hidden="true" class="size-4 shrink-0" />
                  <span>{{ disabledToggleLabel }}</span>
                </button>
                <button
                  v-if="showsDuplicateMenuItem"
                  type="button"
                  role="menuitem"
                  aria-label="Duplicate group"
                  class="flex h-9 w-full items-center gap-2 px-3 text-left text-label-md text-secondary-foreground transition hover:bg-secondary-hover focus:bg-secondary-hover focus:outline-none"
                  @click="duplicateGroup"
                >
                  <DocumentDuplicateIcon aria-hidden="true" class="size-4 shrink-0" />
                  <span>Duplicate</span>
                </button>
                <button
                  v-if="showsDeleteMenuItem"
                  type="button"
                  role="menuitem"
                  aria-label="Delete group"
                  class="flex h-9 w-full items-center gap-2 px-3 text-left text-label-md text-danger transition hover:bg-danger-subtle focus:bg-danger-subtle focus:outline-none"
                  @click="removeGroup"
                >
                  <TrashIcon aria-hidden="true" class="size-4 shrink-0" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <TimeLimitMeter
          v-if="timeLimitUsageSummary"
          :summary="timeLimitUsageSummary"
          aria-label="Remaining time today"
          class="w-full"
        />
      </div>
      <PendingFieldNote v-if="isFieldPending('disabled')">
        This group stays enforced {{ pendingUntilLabel }}.
      </PendingFieldNote>
      <AlertMessage v-if="isEditing && draftError('name')" class="mt-3">
        {{ draftError('name') }}
      </AlertMessage>
    </div>

    <fieldset :disabled="!isEditing" class="min-w-0 space-y-4 p-4 disabled:cursor-default">
      <legend class="sr-only">Group details</legend>
      <div>
        <PatternListEditor
          v-model="draft.patterns"
          :is-editing="isEditing"
          :section-error="patternsSectionError()"
          :error="patternError"
          @touch="touchField"
        />
        <PendingFieldNote v-if="isFieldPending('patterns')">
          Earlier URL patterns stay active {{ pendingUntilLabel }}.
        </PendingFieldNote>
      </div>

      <div>
        <RuleListEditor
          v-model="draftRules"
          :is-editing="isEditing"
          :global="globalSettings"
          :now="now ?? new Date()"
          :section-error="rulesSectionError()"
          :error="ruleError"
          @touch="touchField"
          @validity-change="setTextFieldValidity"
        />
        <PendingFieldNote v-if="isFieldPending('rules')">
          Earlier rules stay active {{ pendingUntilLabel }}.
        </PendingFieldNote>
      </div>
    </fieldset>

    <section v-if="isEditing || visibleOptionSummaries.length > 0" class="space-y-3 px-4 pb-4">
      <h3 v-if="!isEditing" class="flex items-center gap-1.5 text-label-md">
        <LockClosedIcon aria-hidden="true" class="size-4 text-muted" />
        Options
      </h3>

      <template v-if="isEditing">
        <button
          type="button"
          class="flex w-full items-center gap-3 bg-transparent py-2.5 text-left text-label-md text-secondary-foreground transition hover:bg-field-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          :aria-expanded="isOptionsOpen"
          :aria-controls="optionsPanelId()"
          @click="toggleOptions"
        >
          <span class="flex min-w-0 items-center gap-1.5">
            <ChevronDownIcon
              aria-hidden="true"
              class="size-4 shrink-0 text-muted transition-transform"
              :class="isOptionsOpen ? 'rotate-0' : '-rotate-90'"
            />
            <span>Options</span>
          </span>
        </button>

        <div v-if="isOptionsOpen" :id="optionsPanelId()" class="divide-y divide-border">
          <fieldset aria-label="Delay relaxed restrictions until next rule day" class="py-3">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-start gap-2 text-secondary-foreground">
                <LockClosedIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-muted" />
                <div>
                  <span class="text-label-md">Delay relaxed restrictions until next rule day</span>
                  <p class="mt-1 text-body-sm text-muted">
                    Stricter changes apply immediately. Relaxed restrictions take effect on the next
                    rule day.
                  </p>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-4 sm:justify-end">
                <label
                  class="inline-flex items-center gap-2 text-label-md text-secondary-foreground"
                >
                  <input
                    v-model="draft.lockMode"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Delay relaxed restrictions until next rule day Off"
                    :value="false"
                  />
                  <span>Off</span>
                </label>
                <label
                  class="inline-flex items-center gap-2 text-label-md text-secondary-foreground"
                >
                  <input
                    v-model="draft.lockMode"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Delay relaxed restrictions until next rule day On"
                    :value="true"
                  />
                  <span>On</span>
                </label>
              </div>
            </div>
            <PendingFieldNote v-if="isFieldPending('lockMode')">
              Still on {{ pendingUntilLabel }}.
            </PendingFieldNote>
          </fieldset>
          <fieldset aria-label="Pause settings" class="py-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-start gap-2 text-secondary-foreground">
                <ClockIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-muted" />
                <div>
                  <span class="text-label-md">Pause</span>
                  <p class="mt-1 text-body-sm text-muted">
                    Take a short break before temporarily disabling this group.
                  </p>
                </div>
              </div>
              <div class="flex flex-col gap-2 sm:items-end">
                <div class="flex flex-wrap items-center gap-4">
                  <span class="text-label-md text-secondary-foreground">Allow Pause</span>
                  <label
                    class="inline-flex items-center gap-2 text-label-md text-secondary-foreground"
                  >
                    <input
                      v-model="draft.pauseAllowed"
                      type="radio"
                      class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                      aria-label="Allow Pause On"
                      :value="true"
                    />
                    <span>On</span>
                  </label>
                  <label
                    class="inline-flex items-center gap-2 text-label-md text-secondary-foreground"
                  >
                    <input
                      v-model="draft.pauseAllowed"
                      type="radio"
                      class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                      aria-label="Allow Pause Off"
                      :value="false"
                    />
                    <span>Off</span>
                  </label>
                </div>
                <PendingFieldNote v-if="isFieldPending('pauseAllowed')" class="sm:text-right">
                  Still not allowed {{ pendingUntilLabel }}.
                </PendingFieldNote>
                <div class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 sm:justify-end">
                  <div class="min-w-0">
                    <label class="flex items-center gap-2 text-label-md text-secondary-foreground">
                      <span class="shrink-0">Wait</span>
                      <BaseInput
                        :model-value="
                          Number.isFinite(draft.pauseWaitSeconds)
                            ? String(draft.pauseWaitSeconds)
                            : ''
                        "
                        type="number"
                        min="0"
                        step="1"
                        aria-label="Wait seconds before pausing"
                        class="w-20"
                        :disabled="!draft.pauseAllowed"
                        :invalid="Boolean(draftError('pauseWaitSeconds'))"
                        @update:model-value="
                          setPauseSetting('pauseWaitSeconds', String($event ?? ''))
                        "
                      />
                      <span class="shrink-0">sec</span>
                    </label>
                    <AlertMessage v-if="draftError('pauseWaitSeconds')" class="mt-2">
                      {{ draftError('pauseWaitSeconds') }}
                    </AlertMessage>
                    <PendingFieldNote v-if="isFieldPending('pauseWaitSeconds')">
                      Still {{ effectivePauseWaitSeconds }} sec {{ pendingUntilLabel }}.
                    </PendingFieldNote>
                  </div>
                  <div class="min-w-0">
                    <label class="flex items-center gap-2 text-label-md text-secondary-foreground">
                      <span class="shrink-0">Pause for</span>
                      <BaseInput
                        :model-value="
                          Number.isFinite(draft.pauseDurationMinutes)
                            ? String(draft.pauseDurationMinutes)
                            : ''
                        "
                        type="number"
                        min="1"
                        step="1"
                        aria-label="Pause duration minutes"
                        class="w-20"
                        :disabled="!draft.pauseAllowed"
                        :invalid="Boolean(draftError('pauseDurationMinutes'))"
                        @update:model-value="
                          setPauseSetting('pauseDurationMinutes', String($event ?? ''))
                        "
                      />
                      <span class="shrink-0">min</span>
                    </label>
                    <AlertMessage v-if="draftError('pauseDurationMinutes')" class="mt-2">
                      {{ draftError('pauseDurationMinutes') }}
                    </AlertMessage>
                    <PendingFieldNote v-if="isFieldPending('pauseDurationMinutes')">
                      Still {{ effectivePauseDurationMinutes }} min {{ pendingUntilLabel }}.
                    </PendingFieldNote>
                  </div>
                </div>
              </div>
            </div>
          </fieldset>
        </div>
      </template>
      <dl v-else class="grid gap-3 text-body-sm sm:grid-cols-2">
        <div v-for="summary in visibleOptionSummaries" :key="summary.label">
          <dt class="text-label-sm text-muted">
            {{ summary.label }}
          </dt>
          <dd class="mt-1 break-all text-secondary-foreground">
            {{ summary.value }}
            <PendingFieldNote v-if="summary.pending">{{ summary.pending }}</PendingFieldNote>
          </dd>
        </div>
      </dl>
    </section>

    <div
      v-if="isEditing"
      class="flex items-center justify-end gap-2 border-t border-border bg-background p-4"
    >
      <div class="ml-auto flex items-center gap-2">
        <BaseButton type="button" aria-label="Cancel group" @click="cancelEditing">
          <XMarkIcon aria-hidden="true" class="size-4" />
          Cancel
        </BaseButton>
        <BaseButton type="button" aria-label="Save group" variant="primary" @click="saveEditing">
          <CheckIcon aria-hidden="true" class="size-4" />
          Save
        </BaseButton>
      </div>
    </div>
  </article>
</template>
