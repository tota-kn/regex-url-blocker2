<script setup lang="ts">
import { CheckIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
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

/** 指定ブロック時間帯番号・サブフィールドのドラフト検証エラーメッセージを返す。 */
function blockedTimeSlotError(index: number, subField: string): string | undefined {
  return draftError(`blockedTimeSlots[${index}].${subField}`)
}

/** 指定上限番号・サブフィールドのドラフト検証エラーメッセージを返す。 */
function timeLimitError(index: number, subField: string): string | undefined {
  return draftError(`timeLimits[${index}].${subField}`)
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
  <article class="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
    <div class="border-b border-border bg-background p-4">
      <div class="space-y-2.5">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label class="group/name block min-w-0 flex-1">
            <span class="sr-only">Name</span>
            <span
              class="flex min-w-0 items-center rounded-md border px-2 py-1 transition"
              :class="isEditing ? 'border-input-border bg-input focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/50 hover:border-border-hover' : 'border-transparent bg-transparent px-0'"
            >
              <input
                v-model="draft.name"
                aria-label="Name"
                :disabled="!isEditing"
                class="min-w-0 flex-1 bg-transparent text-base font-semibold tracking-normal outline-none disabled:cursor-default disabled:text-foreground"
              >
            </span>
          </label>

          <div class="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            <button
              v-if="!isEditing"
              type="button"
              aria-label="Delete group"
              class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-background px-3 text-sm font-medium text-destructive transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-destructive/30"
              @click="$emit('remove')"
            >
              <TrashIcon
                aria-hidden="true"
                class="size-4"
              />
              Delete
            </button>
            <button
              v-if="!isEditing"
              type="button"
              aria-label="Edit group"
              class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-background px-3 text-sm font-medium text-primary transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              @click="startEditing"
            >
              <PencilSquareIcon
                aria-hidden="true"
                class="size-4"
              />
              Edit
            </button>
          </div>
        </div>

        <TimeLimitMeter
          v-if="timeLimitUsageSummary"
          :summary="timeLimitUsageSummary"
          aria-label="Remaining time today"
          class="w-full"
        />
      </div>
      <p
        v-if="isEditing && draftError('name')"
        class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
      >
        {{ draftError('name') }}
      </p>
    </div>

    <fieldset
      :disabled="!isEditing"
      class="space-y-4 p-4 disabled:cursor-default"
    >
      <legend class="sr-only">
        Group details
      </legend>
      <PatternListEditor
        v-model="draft.patterns"
        v-model:mode="draft.mode"
        :is-editing="isEditing"
        :error="patternError"
      />
      <LimitRulesEditor
        v-model:blocked-time-slots="draft.blockedTimeSlots"
        v-model:time-limits="draft.timeLimits"
        :is-editing="isEditing"
        :blocked-time-slot-error="blockedTimeSlotError"
        :time-limit-error="timeLimitError"
      />
    </fieldset>

    <div
      v-if="isEditing"
      class="flex items-center justify-end gap-2 border-t border-border bg-background p-4"
    >
      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-label="Cancel group"
          class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-secondary-foreground transition hover:bg-secondary-hover focus:outline-none focus:ring-2 focus:ring-ring"
          @click="cancelEditing"
        >
          <XMarkIcon
            aria-hidden="true"
            class="size-4"
          />
          Cancel
        </button>
        <button
          type="button"
          aria-label="Save group"
          :disabled="!canSave"
          class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          @click="saveEditing"
        >
          <CheckIcon
            aria-hidden="true"
            class="size-4"
          />
          Save
        </button>
      </div>
    </div>
  </article>
</template>
