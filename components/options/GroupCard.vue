<script setup lang="ts">
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, CheckIcon, ChevronDownIcon, ClockIcon, DocumentTextIcon, EllipsisVerticalIcon, LockClosedIcon, NoSymbolIcon, PauseIcon, PencilSquareIcon, ShieldExclamationIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
import PatternListEditor from './PatternListEditor.vue'
import RestrictionRulesEditor from './RestrictionRulesEditor.vue'

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
  /** 一時停止操作を無効化するときに表示する理由。 */
  pauseDisabledReason?: string
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
const isActionMenuOpen = ref(false)
const actionMenuRoot = ref<HTMLElement | null>(null)

const draftErrors = computed(() => validateGroup(draft.value))
const draftTimeWindows = computed({
  get: () => draft.value.timeWindows ?? [],
  set: (timeWindows) => { draft.value.timeWindows = timeWindows },
})
const draftRestrictions = computed({
  get: () => draft.value.restrictions ?? [],
  set: (restrictions) => { draft.value.restrictions = restrictions },
})
const canSave = computed(() => draftErrors.value.length === 0)
const visibleOptionSummaries = computed(() => {
  const summaries: Array<{ label: string, value: string }> = []
  if (props.group.disabled) {
    summaries.push({ label: 'Group status', value: 'Disabled' })
  }
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
const pauseButtonLabel = computed(() => pauseButtonState.value.label)
const effectivePauseDisabledReason = computed(() => props.pauseDisabledReason ?? (props.group.disabled ? 'Enable group to pause.' : undefined))
const canRequestPause = computed(() => {
  if (effectivePauseDisabledReason.value) return false
  return !pauseButtonState.value.paused
})
const disabledToggleLabel = computed(() => props.group.disabled ? 'Enable' : 'Disable')
const showsPauseMenuItem = computed(() => !props.isNew && !pauseButtonState.value.paused)
const showsDisabledToggleMenuItem = computed(() => !props.isNew && !props.readOnly)
const showsDeleteMenuItem = computed(() => !props.readOnly)
const showsActionMenu = computed(() => {
  if (isEditing.value || props.isNew) return false
  return showsPauseMenuItem.value || showsDisabledToggleMenuItem.value || showsDeleteMenuItem.value
})

watch(() => props.group, (group) => {
  if (isEditing.value) return
  draft.value = cloneGroup(group)
}, { deep: true })

watch(showsActionMenu, (visible) => {
  if (visible) return
  closeActionMenu()
})

/** 指定フィールドのドラフト検証エラーメッセージを返す。 */
function draftError(field: string): string | undefined {
  return draftErrors.value.find(e => e.field === field)?.message
}

/** 指定パターン番号のドラフト検証エラーメッセージを返す。 */
function patternError(index: number): string | undefined {
  return draftError(`patterns[${index}]`)
}

/** 指定 restriction rule フィールドのドラフト検証エラーメッセージを返す。 */
function restrictionError(index: number, field: string): string | undefined {
  const prefix = `restrictions[${index}].${field}`
  return draftErrors.value.find(e => e.field === prefix || e.field.startsWith(`${prefix}.`))?.message
}

/** 指定 time window フィールドのドラフト検証エラーを返す。 */
function timeWindowError(index: number, field: string): string | undefined {
  const prefix = `timeWindows[${index}].${field}`
  return draftErrors.value.find(e => e.field === prefix || e.field.startsWith(`${prefix}.`))?.message
}

/** 編集モードを開始し、現在の保存済み値からドラフトを作り直す。 */
function startEditing(): void {
  if (props.readOnly) return
  draft.value = cloneGroup(props.group)
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
  isEditing.value = false
}

/** エラーがない場合だけドラフトを保存値として親へ通知する。 */
function saveEditing(): void {
  if (props.readOnly) return
  if (!canSave.value) return
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

/** 削除要求を親へ通知し、メニューを閉じる。 */
function removeGroup(): void {
  closeActionMenu()
  emit('remove')
}

/** グループアクションメニュー外のクリックでメニューを閉じる。 */
function closeActionMenuFromOutside(event: PointerEvent): void {
  if (!isActionMenuOpen.value) return
  const target = event.target
  if (target instanceof Node && actionMenuRoot.value?.contains(target)) return
  closeActionMenu()
}

/** グループアクションメニューに紐づく一意な DOM id を返す。 */
function actionMenuId(): string {
  return `group-actions-menu-${props.group.id}`
}

/** 一時停止操作の無効理由に紐づく一意な DOM id を返す。 */
function pauseDisabledReasonId(): string {
  return `group-pause-disabled-reason-${props.group.id}`
}

/** Options 全体の disclosure panel に紐づく一意な DOM id を返す。 */
function optionsPanelId(): string {
  return `options-panel-${props.group.id}`
}

watch(isActionMenuOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', closeActionMenuFromOutside, true)
    return
  }
  document.removeEventListener('pointerdown', closeActionMenuFromOutside, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeActionMenuFromOutside, true)
})
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
              v-if="!isEditing && !isNew && group.disabled"
              class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-label-md text-muted"
              role="status"
            >
              <NoSymbolIcon
                aria-hidden="true"
                class="size-4"
              />
              Disabled
            </span>
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
                <EllipsisVerticalIcon
                  aria-hidden="true"
                  class="size-5"
                />
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
                    :aria-describedby="effectivePauseDisabledReason ? pauseDisabledReasonId() : undefined"
                    :disabled="!canRequestPause"
                    class="flex h-9 w-full items-center gap-2 px-3 text-left text-label-md text-secondary-foreground transition hover:bg-secondary-hover focus:bg-secondary-hover focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                    @click="requestPause"
                  >
                    <PauseIcon
                      aria-hidden="true"
                      class="size-4 shrink-0"
                    />
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
                  <NoSymbolIcon
                    v-else
                    aria-hidden="true"
                    class="size-4 shrink-0"
                  />
                  <span>{{ disabledToggleLabel }}</span>
                </button>
                <button
                  v-if="showsDeleteMenuItem"
                  type="button"
                  role="menuitem"
                  aria-label="Delete group"
                  class="flex h-9 w-full items-center gap-2 px-3 text-left text-label-md text-danger transition hover:bg-danger-subtle focus:bg-danger-subtle focus:outline-none"
                  @click="removeGroup"
                >
                  <TrashIcon
                    aria-hidden="true"
                    class="size-4 shrink-0"
                  />
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

      <RestrictionRulesEditor
        v-model:time-windows="draftTimeWindows"
        v-model:restrictions="draftRestrictions"
        :is-editing="isEditing"
        :time-window-error="timeWindowError"
        :restriction-error="restrictionError"
      />
    </fieldset>

    <section
      v-if="isEditing || visibleOptionSummaries.length > 0"
      class="space-y-3 px-4 pb-4"
    >
      <h3
        v-if="!isEditing"
        class="flex items-center gap-1.5 text-label-md"
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

        <div
          v-if="isOptionsOpen"
          :id="optionsPanelId()"
          class="divide-y divide-border"
        >
          <fieldset
            aria-label="URL pattern match behavior"
            class="py-3"
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
            class="py-3"
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
            class="space-y-3 py-3"
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
              class="block min-w-0 space-y-1.5 pl-6"
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
              <AlertMessage
                v-if="draftError('redirectUrl')"
                class="mt-2"
              >
                {{ draftError('redirectUrl') }}
              </AlertMessage>
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
