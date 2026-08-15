<script setup lang="ts">
import {
  ArrowUturnLeftIcon,
  CheckIcon,
  ClockIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import StatusChip from '@/components/ui/StatusChip.vue'
import { sortRulesByEvaluationOrder } from '@/utils/groupStatus'
import type { TimeLimitUsageSummary } from '@/utils/usageCounters'
import { getGroupPauseButtonState } from '@/utils/groupPause'
import { cloneGroup } from '@/utils/groups'
import type { GlobalSettings, Group, GroupPauseEntry } from '@/utils/types'
import { validateGroup } from '@/utils/validation'
import { useValidationFeedback } from '@/utils/useValidationFeedback'
import { useLockModePending } from '@/utils/useLockModePending'
import TimeLimitMeter from '../TimeLimitMeter.vue'
import GroupActionMenu from './GroupActionMenu.vue'
import GroupOptionsPanel from './GroupOptionsPanel.vue'
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

const draftErrors = computed(() => validateGroup(draft.value, { requireConfiguredSections: true }))
const draftRules = computed({
  get: () => draft.value.rules,
  set: (rules) => {
    draft.value.rules = rules
  },
})
/** 保留状況の比較対象。編集中は入力中のドラフト、それ以外は保存済みの値を使う。 */
const comparedGroup = computed(() => (isEditing.value ? draft.value : props.group))
const { resolvedGroup, pendingUntilLabel, isFieldPending } = useLockModePending(
  () => props.effectiveGroup,
  comparedGroup,
  () => props.appliesAfterLabel,
)
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

/** 指定フィールドのドラフト検証エラーメッセージを返す。 */
function draftError(field: string): string | undefined {
  return validationFeedback.messageFor(draftErrors.value, field)
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
  return validationFeedback.messageForPrefix(draftErrors.value, `${prefix}.`)
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
  isEditing.value = false
}

/** 一時停止要求を親へ通知し、メニューを閉じる。 */
function requestPause(): void {
  if (!canRequestPause.value) return
  emit('requestPause')
}

/** グループの永続的な無効化状態を切り替え、保存要求として親へ通知する。 */
function toggleGroupDisabled(): void {
  if (props.readOnly) return
  emit('save', {
    ...cloneGroup(props.group),
    disabled: !props.group.disabled,
  })
}

/** グループ複製要求を親へ通知し、メニューを閉じる。 */
function duplicateGroup(): void {
  if (props.readOnly || props.isNew) return
  emit('duplicate')
}

/** 保存設定への復元要求を親へ通知する。 */
function restoreGroup(): void {
  if (!props.restorable) return
  emit('restore')
}

/** 削除要求を親へ通知し、メニューを閉じる。 */
function removeGroup(): void {
  emit('remove')
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
            <StatusChip v-if="!isEditing && !isNew && group.disabled" kind="muted">
              <NoSymbolIcon aria-hidden="true" class="size-4" />
              Disabled
            </StatusChip>
            <StatusChip v-if="!isEditing && !isNew && pauseButtonState.paused" aria-live="polite">
              <ClockIcon aria-hidden="true" class="size-4" />
              {{ pauseButtonState.label }}
            </StatusChip>
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
            <GroupActionMenu
              v-if="showsActionMenu"
              :group-id="group.id"
              :disabled="group.disabled"
              :show-pause="showsPauseMenuItem"
              :show-disabled-toggle="showsDisabledToggleMenuItem"
              :show-duplicate="showsDuplicateMenuItem"
              :show-delete="showsDeleteMenuItem"
              :pause-label="pauseButtonLabel"
              :can-pause="canRequestPause"
              :pause-disabled-reason="effectivePauseDisabledReason"
              @pause="requestPause"
              @toggle-disabled="toggleGroupDisabled"
              @duplicate="duplicateGroup"
              @remove="removeGroup"
            />
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

    <GroupOptionsPanel
      v-model="draft"
      :group="group"
      :is-editing="isEditing"
      :effective-group="effectiveGroup"
      :applies-after-label="appliesAfterLabel"
      :error="draftError"
      @touch="touchField"
    />

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
