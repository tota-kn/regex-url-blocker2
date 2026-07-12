<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline'
import { computed, nextTick, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { TimeLimitUsageSummary } from '@/utils/blocking'
import type { GroupTemplateId } from '@/utils/defaults'
import type { Group, GroupPauseEntry, GroupPauseState } from '@/utils/types'
import GroupCard from './GroupCard.vue'

/**
 * 新規グループ作成テンプレートの表示メタデータ。
 */
interface GroupTemplateOption {
  /** テンプレート識別子。 */
  id: GroupTemplateId
  /** ボタン表示ラベル。 */
  label: string
  /** 説明文。 */
  description: string
  /** 作成ボタンの aria-label。 */
  ariaLabel: string
}

/**
 * グループ一覧セクションの props。
 */
interface Props {
  /** 保存前の新規グループドラフト配列。 */
  newGroups: Group[]
  /** group id ごとの一時停止状態。 */
  groupPauseState: GroupPauseState
  /** 一時停止表示の残り時間計算に使う現在時刻。 */
  now: Date
  /** 次の rule day まで以前の制限が有効な group id。 */
  pendingEffectiveGroupIds: string[]
  /** 保存設定から削除済みだが、以前の制限が有効なグループ。 */
  retainedEffectiveGroups: Group[]
  /** 保留中の制限が反映される日時。 */
  appliesAfterLabel: string
  /** rule day の開始時刻。 */
  resetTimeLabel: string
  /** 指定グループの今日の上限利用状況を返す関数。 */
  timeLimitUsageSummary: (group: Group) => TimeLimitUsageSummary | undefined
}

/**
 * グループ一覧セクションが親へ通知するイベント。
 */
interface Emits {
  /** グループ追加が要求されたときに発火する。 */
  addGroup: [templateId: GroupTemplateId]
  /** 既存グループ保存が要求されたときに対象値を通知する。 */
  saveGroup: [group: Group]
  /** 新規グループ保存が要求されたときに対象値を通知する。 */
  saveNewGroup: [group: Group]
  /** 新規グループ編集キャンセルが要求されたときに対象 id を通知する。 */
  cancelNewGroup: [id: string]
  /** グループ削除が要求されたときに対象 id を通知する。 */
  removeGroup: [id: string]
  /** グループ複製が要求されたときに対象 id を通知する。 */
  duplicateGroup: [id: string]
  /** グループ一時停止操作が要求されたときに対象 id を通知する。 */
  requestGroupPause: [id: string]
  /** 指定グループの現在有効な設定の確認が要求されたときに対象 id を通知する。 */
  viewActiveSettings: [id: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/**
 * Options 画面で編集するグループ配列。
 */
const groups = defineModel<Group[]>({ required: true })

const sectionRef = ref<HTMLElement | null>(null)
const createGroupDialogRef = ref<HTMLDialogElement | null>(null)
const groupCount = computed(() => groups.value.length + props.newGroups.length)
const groupCountLabel = computed(
  () => `${groupCount.value} ${groupCount.value === 1 ? 'group' : 'groups'}`,
)

const groupTemplates: GroupTemplateOption[] = [
  {
    id: 'blank',
    label: 'Blank group',
    description: 'Start with no URL patterns or blocking rules.',
    ariaLabel: 'Create blank group',
  },
  {
    id: 'core-sns-15min',
    label: 'Core SNS 15 min/day',
    description: 'Start with core social networks and a 15 minute daily limit.',
    ariaLabel: 'Create group from core SNS 15 min/day template',
  },
  {
    id: 'video-30min',
    label: 'Video 30 min/day',
    description: 'Start with video sites and a 30 minute daily limit.',
    ariaLabel: 'Create group from video 30 min/day template',
  },
  {
    id: 'work-hours-focus',
    label: 'Work hours focus',
    description: 'Block matching URLs on weekdays from 09:00 to 18:00.',
    ariaLabel: 'Create group from work hours focus template',
  },
]

/** 指定グループの一時停止状態を返す。 */
function groupPauseEntry(groupId: string): GroupPauseEntry | undefined {
  return props.groupPauseState.groupPauseState[groupId]
}

watch(
  () => props.newGroups.length,
  async (newLength, oldLength) => {
    if (newLength <= oldLength) return
    await nextTick()
    focusLastNewGroup()
  },
)

/** 追加直後の新規グループカードを画面内に出し、名前入力へフォーカスする。 */
function focusLastNewGroup(): void {
  const cards = sectionRef.value?.querySelectorAll<HTMLElement>('[data-new-group-card="true"]')
  const card = cards?.[cards.length - 1]
  if (!card) return

  card.scrollIntoView({ block: 'center' })
  card.querySelector<HTMLInputElement>('input[aria-label="Name"]')?.focus({ preventScroll: true })
}

/** 新規グループ作成ダイアログを開く。 */
function openCreateGroupDialog(): void {
  createGroupDialogRef.value?.showModal()
}

/** 新規グループ作成ダイアログを閉じる。 */
function closeCreateGroupDialog(): void {
  createGroupDialogRef.value?.close()
}

/** テンプレートを選択して新規グループ作成を親へ通知する。 */
function createGroup(templateId: GroupTemplateId): void {
  closeCreateGroupDialog()
  emit('addGroup', templateId)
}
</script>

<template>
  <section ref="sectionRef" class="min-w-0 space-y-3">
    <div class="flex min-h-9 items-center justify-between gap-3">
      <div class="flex min-w-0 items-baseline gap-2">
        <h2 class="text-heading-md text-foreground">Groups</h2>
        <p class="text-body-sm text-muted-foreground">
          {{ groupCountLabel }}
        </p>
      </div>
      <BaseButton
        type="button"
        aria-label="Add group"
        variant="primary"
        @click="openCreateGroupDialog"
      >
        <PlusIcon aria-hidden="true" class="size-4" />
        Add Group
      </BaseButton>
    </div>

    <dialog
      ref="createGroupDialogRef"
      aria-labelledby="create-group-title"
      class="dialog-centered w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/30"
      @cancel.prevent="closeCreateGroupDialog"
    >
      <div class="space-y-4 p-4">
        <h3 id="create-group-title" class="text-heading-md">Create group</h3>
        <div class="space-y-2">
          <button
            v-for="template in groupTemplates"
            :key="template.id"
            type="button"
            :aria-label="template.ariaLabel"
            class="block w-full rounded-lg border border-border bg-surface p-3 text-left transition hover:bg-secondary-hover focus:outline-none focus:ring-2 focus:ring-ring"
            @click="createGroup(template.id)"
          >
            <span class="block text-label-md text-secondary-foreground">{{ template.label }}</span>
            <span class="mt-1 block text-body-sm text-muted">{{ template.description }}</span>
          </button>
        </div>
        <div class="flex justify-end">
          <BaseButton
            type="button"
            aria-label="Cancel create group"
            @click="closeCreateGroupDialog"
          >
            Cancel
          </BaseButton>
        </div>
      </div>
    </dialog>

    <EmptyState v-if="groupCount === 0" aria-label="No groups" spacious> No groups yet </EmptyState>

    <div class="min-w-0 space-y-4">
      <GroupCard
        v-for="(_, i) in groups"
        :key="groups[i].id"
        :group="groups[i]"
        :pause-entry="groupPauseEntry(groups[i].id)"
        :now="now"
        :has-earlier-restrictions-active="pendingEffectiveGroupIds.includes(groups[i].id)"
        :applies-after-label="appliesAfterLabel"
        :reset-time-label="resetTimeLabel"
        :time-limit-usage-summary="timeLimitUsageSummary(groups[i])"
        @save="$emit('saveGroup', $event)"
        @remove="$emit('removeGroup', groups[i].id)"
        @duplicate="$emit('duplicateGroup', groups[i].id)"
        @request-pause="$emit('requestGroupPause', groups[i].id)"
        @view-active-settings="$emit('viewActiveSettings', groups[i].id)"
      />
      <GroupCard
        v-for="group in newGroups"
        :key="group.id"
        :group="group"
        :start-in-edit="true"
        :is-new="true"
        data-new-group-card="true"
        @save="$emit('saveNewGroup', $event)"
        @cancel="$emit('cancelNewGroup', group.id)"
        @remove="$emit('cancelNewGroup', group.id)"
      />
      <section
        v-if="retainedEffectiveGroups.length > 0"
        aria-label="Earlier active groups"
        class="space-y-3"
      >
        <div>
          <h3 class="text-label-md text-secondary-foreground">Earlier restrictions still active</h3>
          <p class="mt-1 text-body-sm text-muted">
            These groups were removed from saved settings, but remain active until the next rule
            day.
          </p>
        </div>
        <GroupCard
          v-for="group in retainedEffectiveGroups"
          :key="`retained-${group.id}`"
          :group="group"
          :pause-entry="groupPauseEntry(group.id)"
          :now="now"
          :has-earlier-restrictions-active="true"
          :applies-after-label="appliesAfterLabel"
          :reset-time-label="resetTimeLabel"
          read-only
          @request-pause="$emit('requestGroupPause', group.id)"
          @view-active-settings="$emit('viewActiveSettings', group.id)"
        />
      </section>
    </div>
  </section>
</template>
