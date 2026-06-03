<script setup lang="ts">
import { ArrowTopRightOnSquareIcon, CheckIcon, ChevronDownIcon, ClockIcon, DocumentTextIcon, LockClosedIcon, PencilSquareIcon, ShieldExclamationIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import type { TimeLimitUsageSummary } from '@/utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS } from '@/utils/defaults'
import { getGroupPauseButtonState } from '@/utils/groupPause'
import { cloneGroup, formatBlockDestination, formatGroupMode } from '@/utils/groups'
import type { Group, GroupPauseEntry } from '@/utils/types'
import { validateGroup } from '@/utils/validation'
import TimeLimitMeter from '../TimeLimitMeter.vue'
import LimitRulesEditor from './LimitRulesEditor.vue'
import PatternListEditor from './PatternListEditor.vue'

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
  /** このグループの一時停止状態。 */
  pauseEntry?: GroupPauseEntry
  /** 一時停止表示の残り時間計算に使う現在時刻。 */
  now?: Date
  /** 一時停止操作を無効化するときに表示するラベル。 */
  pauseDisabledLabel?: string
  /** 今日の上限利用状況。今日有効な上限がなければ undefined。 */
  timeLimitUsageSummary?: TimeLimitUsageSummary
  /** 読み取り専用表示にして編集・削除・保存を無効化するかどうか。 */
  readOnly?: boolean
}

/**
 * グループカードが親へ通知するイベント。
 */
interface Emits {
  /** グループ保存が要求されたときに保存対象の値を通知する。 */
  save: [group: Group]
  /** 未保存グループ作成のキャンセルが要求されたときに発火する。 */
  cancel: []
  /** グループ削除が要求されたときに発火する。 */
  remove: []
  /** グループ一時停止操作が要求されたときに発火する。 */
  requestPause: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/**
 * 編集フォームに反映するグループの作業コピー。
 */
const draft = ref<Group>(cloneGroup(props.group))

const isEditing = ref(props.readOnly ? false : (props.startInEdit ?? false))
const isOptionsOpen = ref(false)

const draftErrors = computed(() => validateGroup(draft.value))
const canSave = computed(() => draftErrors.value.length === 0)
const visibleOptionSummaries = computed(() => {
  const summaries: Array<{ label: string, value: string }> = []
  if (props.group.mode === 'whitelist') {
    summaries.push({ label: 'URL pattern match behavior', value: formatGroupMode(props.group) })
  }
  if (props.group.lockMode) {
    summaries.push({ label: 'Lock changes until next rule day', value: 'On' })
  }
  if (props.group.blockAction !== DEFAULT_GLOBAL_SETTINGS.blockAction) {
    summaries.push({ label: 'Page shown when blocked', value: formatBlockDestination(props.group) })
  }
  return summaries
})
const pauseButtonState = computed(() => getGroupPauseButtonState(props.pauseEntry, props.now ?? new Date()))
const pauseButtonLabel = computed(() => props.pauseDisabledLabel ?? pauseButtonState.value.label)
const canRequestPause = computed(() => {
  if (props.pauseDisabledLabel) return false
  return !pauseButtonState.value.paused
})

watch(() => props.group, (group) => {
  if (isEditing.value) return
  draft.value = cloneGroup(group)
}, { deep: true })

/** 指定フィールドのドラフト検証エラーメッセージを返す。 */
function draftError(field: string): string | undefined {
  return draftErrors.value.find(e => e.field === field)?.message
}

/** 指定パターン番号のドラフト検証エラーメッセージを返す。 */
function patternError(index: number): string | undefined {
  return draftError(`patterns[${index}]`)
}

/** 編集モードを開始し、現在の保存済み値からドラフトを作り直す。 */
function startEditing(): void {
  if (props.readOnly) return
  draft.value = cloneGroup(props.group)
  isOptionsOpen.value = false
  isEditing.value = true
}

/** 編集内容を破棄する。新規グループの場合はカード自体を閉じる。 */
function cancelEditing(): void {
  if (props.isNew) {
    emit('cancel')
    return
  }
  draft.value = cloneGroup(props.group)
  isEditing.value = false
}

/** エラーがない場合だけドラフトを保存値として親へ通知する。 */
function saveEditing(): void {
  if (props.readOnly) return
  if (!canSave.value) return
  emit('save', cloneGroup(draft.value))
  isOptionsOpen.value = false
  isEditing.value = false
}

/** Options 全体の disclosure panel 表示を切り替える。 */
function toggleOptions(): void {
  isOptionsOpen.value = !isOptionsOpen.value
}

/** Options 全体の disclosure panel に紐づく一意な DOM id を返す。 */
function optionsPanelId(): string {
  return `options-panel-${props.group.id}`
}
</script>

<template>
  <article
    class="min-w-0 overflow-hidden rounded-lg border bg-background shadow-sm"
    :class="isNew ? 'border-primary/40' : 'border-border'"
  >
    <div
      v-if="isNew"
      class="border-b border-primary/20 bg-accent px-4 py-2"
    >
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
            />
          </label>

          <div class="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            <span
              v-if="!isEditing && !isNew && pauseButtonState.paused"
              class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-label-md text-secondary-foreground"
              role="status"
              aria-live="polite"
            >
              <ClockIcon
                aria-hidden="true"
                class="size-4"
              />
              {{ pauseButtonState.label }}
            </span>
            <BaseButton
              v-else-if="!isEditing && !isNew"
              type="button"
              :aria-label="pauseButtonLabel"
              variant="secondary"
              :disabled="!canRequestPause"
              @click="$emit('requestPause')"
            >
              <ClockIcon
                aria-hidden="true"
                class="size-4"
              />
              {{ pauseButtonLabel }}
            </BaseButton>
            <BaseButton
              v-if="!isEditing && !readOnly"
              type="button"
              aria-label="Delete group"
              variant="danger-ghost"
              @click="$emit('remove')"
            >
              <TrashIcon
                aria-hidden="true"
                class="size-4"
              />
              Delete
            </BaseButton>
            <BaseButton
              v-if="!isEditing && !readOnly"
              type="button"
              aria-label="Edit group"
              variant="ghost"
              @click="startEditing"
            >
              <PencilSquareIcon
                aria-hidden="true"
                class="size-4"
              />
              Edit
            </BaseButton>
          </div>
        </div>

        <TimeLimitMeter
          v-if="timeLimitUsageSummary"
          :summary="timeLimitUsageSummary"
          aria-label="Remaining time today"
          class="w-full"
        />
      </div>
      <AlertMessage
        v-if="isEditing && draftError('name')"
        class="mt-3"
      >
        {{ draftError('name') }}
      </AlertMessage>
    </div>

    <fieldset
      :disabled="!isEditing"
      class="min-w-0 space-y-4 p-4 disabled:cursor-default"
    >
      <legend class="sr-only">
        Group details
      </legend>
      <PatternListEditor
        v-model="draft.patterns"
        :is-editing="isEditing"
        :error="patternError"
      />
      <LimitRulesEditor
        v-model:daily-rules="draft.dailyRules"
        :is-editing="isEditing"
      />
    </fieldset>

    <section
      v-if="isEditing || visibleOptionSummaries.length > 0"
      class="space-y-3 px-4 pb-4"
    >
      <h3
        v-if="!isEditing"
        class="flex items-center gap-1.5 text-sm font-semibold"
      >
        <LockClosedIcon
          aria-hidden="true"
          class="size-4 text-muted"
        />
        Options
      </h3>

      <template v-if="isEditing">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm font-semibold text-secondary-foreground"
          :aria-expanded="isOptionsOpen"
          :aria-controls="optionsPanelId()"
          @click="toggleOptions"
        >
          <span class="flex min-w-0 items-center gap-1.5">
            <LockClosedIcon
              aria-hidden="true"
              class="size-4 shrink-0 text-muted"
            />
            <span>Options</span>
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            class="size-4 shrink-0 text-muted transition-transform"
            :class="isOptionsOpen ? 'rotate-180' : ''"
          />
        </button>

        <div
          v-if="isOptionsOpen"
          :id="optionsPanelId()"
          class="space-y-2 rounded-md border border-border bg-surface p-3"
        >
          <fieldset
            aria-label="URL pattern match behavior"
            class="space-y-2"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-2 text-label-md text-secondary-foreground">
                <ShieldExclamationIcon
                  aria-hidden="true"
                  class="size-4 shrink-0 text-muted"
                />
                <span>URL pattern match behavior</span>
              </div>
              <div class="flex flex-wrap items-center gap-4 sm:justify-end">
                <label class="inline-flex items-center gap-2 text-label-md text-secondary-foreground">
                  <input
                    v-model="draft.mode"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="URL pattern match behavior Block matches"
                    value="blacklist"
                  >
                  <span>Block matches</span>
                </label>
                <label class="inline-flex items-center gap-2 text-label-md text-secondary-foreground">
                  <input
                    v-model="draft.mode"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="URL pattern match behavior Allow only matches"
                    value="whitelist"
                  >
                  <span>Allow only matches</span>
                </label>
              </div>
            </div>
          </fieldset>

          <fieldset
            aria-label="Lock changes until next rule day"
            class="space-y-2 border-t border-border pt-3"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-2 text-label-md text-secondary-foreground">
                <LockClosedIcon
                  aria-hidden="true"
                  class="size-4 shrink-0 text-muted"
                />
                <span>Lock changes until next rule day</span>
              </div>
              <div class="flex flex-wrap items-center gap-4 sm:justify-end">
                <label class="inline-flex items-center gap-2 text-label-md text-secondary-foreground">
                  <input
                    v-model="draft.lockMode"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Lock changes until next rule day Off"
                    :value="false"
                  >
                  <span>Off</span>
                </label>
                <label class="inline-flex items-center gap-2 text-label-md text-secondary-foreground">
                  <input
                    v-model="draft.lockMode"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Lock changes until next rule day On"
                    :value="true"
                  >
                  <span>On</span>
                </label>
              </div>
            </div>
          </fieldset>

          <fieldset
            aria-label="Page shown when blocked"
            class="space-y-2 border-t border-border pt-3"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-2 text-label-md text-secondary-foreground">
                <DocumentTextIcon
                  aria-hidden="true"
                  class="size-4 shrink-0 text-muted"
                />
                <span>Page shown when blocked</span>
              </div>
              <div class="flex flex-wrap items-center gap-4 sm:justify-end">
                <label class="inline-flex items-center gap-2 text-label-md text-secondary-foreground">
                  <input
                    v-model="draft.blockAction"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Page shown when blocked Blocked page"
                    value="blockedPage"
                  >
                  <span>Blocked page</span>
                </label>
                <label class="inline-flex items-center gap-2 text-label-md text-secondary-foreground">
                  <input
                    v-model="draft.blockAction"
                    type="radio"
                    class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
                    aria-label="Page shown when blocked Redirect"
                    value="redirect"
                  >
                  <span>Redirect</span>
                </label>
              </div>
            </div>
            <AlertMessage
              v-if="draftError('blockAction')"
            >
              {{ draftError('blockAction') }}
            </AlertMessage>
            <label
              v-if="draft.blockAction === 'redirect'"
              class="block min-w-0 space-y-1.5"
            >
              <span class="flex min-w-0 items-center gap-2 text-label-md text-secondary-foreground">
                <ArrowTopRightOnSquareIcon
                  aria-hidden="true"
                  class="size-4 shrink-0 text-muted"
                />
                <span>Redirect URL</span>
              </span>
              <BaseInput
                v-model="draft.redirectUrl"
                type="url"
                aria-label="Redirect URL"
                class="w-full"
                :invalid="Boolean(draftError('redirectUrl'))"
              />
              <span
                v-if="draftError('redirectUrl')"
                class="mt-2 block rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {{ draftError('redirectUrl') }}
              </span>
            </label>
          </fieldset>
        </div>
      </template>
      <dl
        v-else
        class="grid gap-3 text-body-sm sm:grid-cols-2"
      >
        <div
          v-for="summary in visibleOptionSummaries"
          :key="summary.label"
        >
          <dt class="text-label-sm text-muted">
            {{ summary.label }}
          </dt>
          <dd class="mt-1 break-all text-secondary-foreground">
            {{ summary.value }}
          </dd>
        </div>
      </dl>
    </section>

    <div
      v-if="isEditing"
      class="flex items-center justify-end gap-2 border-t border-border bg-background p-4"
    >
      <div class="ml-auto flex items-center gap-2">
        <BaseButton
          type="button"
          aria-label="Cancel group"
          @click="cancelEditing"
        >
          <XMarkIcon
            aria-hidden="true"
            class="size-4"
          />
          Cancel
        </BaseButton>
        <BaseButton
          type="button"
          aria-label="Save group"
          :disabled="!canSave"
          variant="primary"
          @click="saveEditing"
        >
          <CheckIcon
            aria-hidden="true"
            class="size-4"
          />
          Save
        </BaseButton>
      </div>
    </div>
  </article>
</template>
