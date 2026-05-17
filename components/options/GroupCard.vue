<script setup lang="ts">
import { CheckIcon, LockClosedIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import type { TimeLimitUsageSummary } from '@/utils/blocking'
import type { Group } from '@/utils/types'
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
  /** 今日の上限利用状況。今日有効な上限がなければ undefined。 */
  timeLimitUsageSummary?: TimeLimitUsageSummary
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
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/**
 * 編集フォームに反映するグループの作業コピー。
 */
const draft = ref<Group>(cloneGroup(props.group))

const isEditing = ref(props.startInEdit ?? false)

const draftErrors = computed(() => validateGroup(draft.value))
const canSave = computed(() => draftErrors.value.length === 0)

watch(() => props.group, (group) => {
  if (isEditing.value) return
  draft.value = cloneGroup(group)
}, { deep: true })

/** グループを JSON 互換の作業コピーとして複製する。 */
function cloneGroup(group: Group): Group {
  return JSON.parse(JSON.stringify(group)) as Group
}

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
  draft.value = cloneGroup(props.group)
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
  if (!canSave.value) return
  emit('save', cloneGroup(draft.value))
  isEditing.value = false
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
            <BaseButton
              v-if="!isEditing"
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
              v-if="!isEditing"
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
      <div class="rounded-md border border-border bg-surface p-3">
        <label class="flex items-start gap-3">
          <input
            v-model="draft.lockMode"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-field-border text-primary focus:ring-2 focus:ring-ring/50 disabled:cursor-default"
            aria-label="Lock Mode"
            :disabled="!isEditing"
          >
          <span class="min-w-0">
            <span class="flex items-center gap-1.5 text-label-md text-secondary-foreground">
              <LockClosedIcon
                aria-hidden="true"
                class="size-4 text-muted"
              />
              Lock Mode
            </span>
            <span class="mt-1 block text-body-sm text-muted">
              Changes to this group apply after the next reset.
            </span>
          </span>
        </label>
      </div>
      <PatternListEditor
        v-model="draft.patterns"
        v-model:mode="draft.mode"
        :is-editing="isEditing"
        :error="patternError"
      />
      <LimitRulesEditor
        v-model:daily-rules="draft.dailyRules"
        :is-editing="isEditing"
      />
    </fieldset>

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
