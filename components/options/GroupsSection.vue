<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline'
import { computed, nextTick, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { GroupTemplateId } from '@/utils/defaults'
import type { Group } from '@/utils/types'
import GroupCard from './GroupCard.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  /** 保存設定から削除済みだが、以前の制限が有効なグループ。 */
  retainedEffectiveGroups: Group[]
}

/**
 * グループ一覧セクションが親へ通知するイベント。
 */
interface Emits {
  addGroup: [templateId: GroupTemplateId]
  saveGroup: [group: Group]
  saveNewGroup: [group: Group]
  cancelNewGroup: [id: string]
  removeGroup: [id: string]
  duplicateGroup: [id: string]
  requestGroupPause: [id: string]
  restoreGroup: [id: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/**
 * Options 画面で編集するグループ配列。
 */
const groups = defineModel<Group[]>({ required: true })

const sectionRef = ref<HTMLElement | null>(null)
const createGroupDialogRef = ref<InstanceType<typeof BaseDialog> | null>(null)
const groupCount = computed(() => groups.value.length + props.newGroups.length)
const groupCountLabel = computed(() => t('{count} group | {count} groups', groupCount.value))

const groupTemplates: GroupTemplateOption[] = [
  {
    id: 'blank',
    label: 'Blank group',
    description: 'Start with no URL patterns or blocking rules.',
    ariaLabel: 'Create blank group',
  },
  {
    id: 'core-sns-15min',
    label: 'Core social 15 min/day',
    description: 'Start with core social networks and a 15-minute daily limit.',
    ariaLabel: 'Create group from core social 15 min/day template',
  },
  {
    id: 'video-30min',
    label: 'Video 30 min/day',
    description: 'Start with video sites and a 30-minute daily limit.',
    ariaLabel: 'Create group from video 30 min/day template',
  },
  {
    id: 'work-hours-focus',
    label: 'Work hours focus',
    description: 'Block matching URLs on weekdays from 09:00 to 18:00.',
    ariaLabel: 'Create group from work hours focus template',
  },
]

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
  card.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
}

/** 新規グループ作成ダイアログを開く。 */
function openCreateGroupDialog(): void {
  createGroupDialogRef.value?.open()
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
        <h2 class="text-heading-md text-foreground">{{ t('Groups') }}</h2>
        <p class="text-body-sm text-muted-foreground">
          {{ groupCountLabel }}
        </p>
      </div>
      <BaseButton
        type="button"
        :aria-label="t('Add group')"
        variant="primary"
        @click="openCreateGroupDialog"
      >
        <PlusIcon aria-hidden="true" class="size-4" />
        {{ t('Add Group') }}
      </BaseButton>
    </div>

    <BaseDialog
      ref="createGroupDialogRef"
      aria-labelledby="create-group-title"
      class="w-[min(28rem,calc(100vw-2rem))] p-0"
      @cancel="closeCreateGroupDialog"
    >
      <div class="space-y-4 p-4">
        <h3 id="create-group-title" class="text-heading-md">{{ t('Create group') }}</h3>
        <div class="space-y-2">
          <button
            v-for="template in groupTemplates"
            :key="template.id"
            type="button"
            :aria-label="t(template.ariaLabel)"
            class="block w-full rounded-lg border border-border bg-surface p-3 text-left transition hover:bg-secondary-hover focus:outline-none focus:ring-2 focus:ring-ring"
            @click="createGroup(template.id)"
          >
            <span class="block text-label-md text-secondary-foreground">{{
              t(template.label)
            }}</span>
            <span class="mt-1 block text-body-sm text-muted">{{ t(template.description) }}</span>
          </button>
        </div>
        <div class="flex justify-end">
          <BaseButton
            type="button"
            :aria-label="t('Cancel create group')"
            @click="closeCreateGroupDialog"
          >
            {{ t('Cancel') }}
          </BaseButton>
        </div>
      </div>
    </BaseDialog>

    <EmptyState v-if="groupCount === 0" :aria-label="t('No groups')" spacious>{{
      t('No groups yet')
    }}</EmptyState>

    <div class="min-w-0 space-y-4">
      <GroupCard
        v-for="(_, i) in groups"
        :key="groups[i].id"
        :group="groups[i]"
        @save="emit('saveGroup', $event)"
        @remove="emit('removeGroup', groups[i].id)"
        @duplicate="emit('duplicateGroup', groups[i].id)"
        @request-pause="emit('requestGroupPause', groups[i].id)"
      />
      <GroupCard
        v-for="group in newGroups"
        :key="group.id"
        :group="group"
        :start-in-edit="true"
        :is-new="true"
        data-new-group-card="true"
        @save="emit('saveNewGroup', $event)"
        @cancel="emit('cancelNewGroup', group.id)"
        @remove="emit('cancelNewGroup', group.id)"
      />
      <section
        v-if="retainedEffectiveGroups.length > 0"
        :aria-label="t('Earlier active groups')"
        class="space-y-3"
      >
        <div>
          <h3 class="text-label-md text-secondary-foreground">
            {{ t('Earlier restrictions still active') }}
          </h3>
          <p class="mt-1 text-body-sm text-muted">
            {{
              t(
                'These groups were removed from saved settings, but remain active until the next rule day. Restore one to edit it again.',
              )
            }}
          </p>
        </div>
        <GroupCard
          v-for="group in retainedEffectiveGroups"
          :key="`retained-${group.id}`"
          :group="group"
          read-only
          restorable
          @request-pause="emit('requestGroupPause', group.id)"
          @restore="emit('restoreGroup', group.id)"
        />
      </section>
    </div>
  </section>
</template>
