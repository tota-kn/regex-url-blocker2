<script setup lang="ts">
import {
  ArrowRightIcon,
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
import { getGroupPauseButtonState } from '@/utils/groupPause'
import { useGroupContext } from '@/utils/groupContext'
import { cloneGroup } from '@/utils/groups'
import { formatRule } from '@/utils/rules'
import type { Group } from '@/utils/types'
import { validateGroup } from '@/utils/validation'
import { useValidationFeedback } from '@/utils/useValidationFeedback'
import { useLockModePending } from '@/utils/useLockModePending'
import TimeLimitMeter from '../TimeLimitMeter.vue'
import GroupActionMenu from './GroupActionMenu.vue'
import GroupOptionsPanel from './GroupOptionsPanel.vue'
import PatternListEditor from './PatternListEditor.vue'
import PendingFieldNote from './PendingFieldNote.vue'
import RuleListEditor from './RuleListEditor.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  /** 読み取り専用表示にして編集・削除・Pause を含む操作を無効化するかどうか。 */
  readOnly?: boolean
  /** 保存設定へ戻す Restore 操作を表示するかどうか。 */
  restorable?: boolean
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
const groupContext = useGroupContext()

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
const effectiveGroup = computed(() => groupContext.effectiveGroup(props.group.id))
const pauseEntry = computed(() => groupContext.pauseEntry(props.group.id))
const pauseDisabledReason = computed(() => groupContext.pauseDisabledReason(props.group.id))
const timeLimitUsageSummary = computed(() => groupContext.timeLimitUsageSummary(props.group))
const globalSettings = computed(() => groupContext.globalSettings.value)
const now = computed(() => groupContext.now.value)
const appliesAfterLabel = computed(() => groupContext.appliesAfterLabel.value)
const { resolvedGroup, pendingUntilLabel, isFieldPending } = useLockModePending(
  () => effectiveGroup.value,
  comparedGroup,
  () => appliesAfterLabel.value,
)
const pauseButtonState = computed(() => getGroupPauseButtonState(pauseEntry.value, now.value))
const pauseButtonLabel = computed(() => pauseButtonState.value.label)
const effectivePauseDisabledReason = computed(() => {
  if (pauseDisabledReason.value) return pauseDisabledReason.value
  if (props.group.pauseAllowed === false) return t('Pause is turned off for this group.')
  return props.group.disabled ? t('Enable this group to use Pause.') : undefined
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
        {{ t('New group') }}
      </span>
    </div>

    <div class="border-b border-border bg-background p-4">
      <div class="space-y-2.5">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label class="block min-w-0 flex-1">
            <span class="sr-only">{{ t('Name') }}</span>
            <BaseInput
              v-model="draft.name"
              :aria-label="t('Name')"
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
              {{ t('Disabled') }}
            </StatusChip>
            <StatusChip v-if="!isEditing && !isNew && pauseButtonState.paused" aria-live="polite">
              <ClockIcon aria-hidden="true" class="size-4" />
              {{ pauseButtonState.label }}
            </StatusChip>
            <BaseButton
              v-if="restorable"
              type="button"
              :aria-label="t('Restore group')"
              variant="primary"
              @click="restoreGroup"
            >
              <ArrowUturnLeftIcon aria-hidden="true" class="size-4" />
              {{ t('Restore') }}
            </BaseButton>
            <BaseButton
              v-if="!isEditing && !readOnly"
              type="button"
              :aria-label="t('Edit group')"
              variant="ghost"
              @click="startEditing"
            >
              <PencilSquareIcon aria-hidden="true" class="size-4" />
              {{ t('Edit') }}
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
          :aria-label="t('Remaining time today')"
          class="w-full"
        />
      </div>
      <PendingFieldNote v-if="isFieldPending('disabled')">
        {{ t('This group stays enforced {until}.', { until: pendingUntilLabel }) }}
      </PendingFieldNote>
      <AlertMessage v-if="isEditing && draftError('name')" class="mt-3">
        {{ draftError('name') }}
      </AlertMessage>
    </div>

    <fieldset :disabled="!isEditing" class="min-w-0 space-y-4 p-4 disabled:cursor-default">
      <legend class="sr-only">{{ t('Group details') }}</legend>
      <div>
        <PatternListEditor
          v-model="draft.patterns"
          :is-editing="isEditing"
          :section-error="patternsSectionError()"
          :error="patternError"
          @touch="touchField"
        />
        <PendingFieldNote v-if="isFieldPending('patterns')">
          {{ t('Earlier URL patterns stay active {until}.', { until: pendingUntilLabel }) }}
        </PendingFieldNote>
        <section
          v-if="isFieldPending('patterns') && effectiveGroup"
          :aria-label="t('Earlier URL patterns currently active')"
          class="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-3"
        >
          <h4 class="text-label-sm text-warning-text">
            {{ t('Earlier URL patterns currently active') }}
          </h4>
          <div v-if="effectiveGroup.patterns.length > 0" class="mt-2 space-y-1">
            <p
              v-for="(pattern, index) in effectiveGroup.patterns"
              :key="`${index}-${pattern}`"
              class="text-mono-md break-all text-input-foreground"
            >
              {{ pattern }}
            </p>
          </div>
          <p v-else class="mt-2 text-body-sm text-muted">
            {{ t('No earlier URL patterns.') }}
          </p>
        </section>
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
          {{ t('Earlier rules stay active {until}.', { until: pendingUntilLabel }) }}
        </PendingFieldNote>
        <section
          v-if="isFieldPending('rules') && effectiveGroup"
          :aria-label="t('Earlier rules currently active')"
          class="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-3"
        >
          <h4 class="text-label-sm text-warning-text">
            {{ t('Earlier rules currently active') }}
          </h4>
          <ol v-if="effectiveGroup.rules.length > 0" class="mt-2 space-y-2">
            <li
              v-for="(rule, index) in effectiveGroup.rules"
              :key="rule.id"
              :aria-label="t('Earlier rule {number}', { number: index + 1 })"
              class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface p-3 text-body-md text-input-foreground"
            >
              <span class="font-mono text-secondary-foreground">
                {{ formatRule(rule).when }}
              </span>
              <ArrowRightIcon aria-hidden="true" class="size-4 shrink-0 text-muted" />
              <span>{{ formatRule(rule).what }}</span>
              <span v-if="formatRule(rule).destination" class="text-body-sm text-muted-foreground">
                → {{ formatRule(rule).destination }}
              </span>
            </li>
          </ol>
          <p v-else class="mt-2 text-body-sm text-muted">
            {{ t('No earlier rules.') }}
          </p>
        </section>
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
        <BaseButton type="button" :aria-label="t('Cancel group')" @click="cancelEditing">
          <XMarkIcon aria-hidden="true" class="size-4" />
          {{ t('Cancel') }}
        </BaseButton>
        <BaseButton
          type="button"
          :aria-label="t('Save group')"
          variant="primary"
          @click="saveEditing"
        >
          <CheckIcon aria-hidden="true" class="size-4" />
          {{ t('Save') }}
        </BaseButton>
      </div>
    </div>
  </article>
</template>
