<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline'
import { computed, nextTick, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { TimeLimitUsageSummary } from '@/utils/blocking'
import type { Group } from '@/utils/types'
import GroupCard from './GroupCard.vue'

/**
 * グループ一覧セクションの props。
 */
interface Props {
  /** 保存前の新規グループドラフト配列。 */
  newGroups: Group[]
  /** 指定グループの今日の上限利用状況を返す関数。 */
  timeLimitUsageSummary: (group: Group) => TimeLimitUsageSummary | undefined
}

/**
 * グループ一覧セクションが親へ通知するイベント。
 */
interface Emits {
  /** グループ追加が要求されたときに発火する。 */
  addGroup: []
  /** 既存グループ保存が要求されたときに対象値を通知する。 */
  saveGroup: [group: Group]
  /** 新規グループ保存が要求されたときに対象値を通知する。 */
  saveNewGroup: [group: Group]
  /** 新規グループ編集キャンセルが要求されたときに対象 id を通知する。 */
  cancelNewGroup: [id: string]
  /** グループ削除が要求されたときに対象 id を通知する。 */
  removeGroup: [id: string]
}

const props = defineProps<Props>()
defineEmits<Emits>()

/**
 * Options 画面で編集するグループ配列。
 */
const groups = defineModel<Group[]>({ required: true })

const sectionRef = ref<HTMLElement | null>(null)
const groupCount = computed(() => groups.value.length + props.newGroups.length)
const groupCountLabel = computed(() => `${groupCount.value} ${groupCount.value === 1 ? 'group' : 'groups'}`)

watch(() => props.newGroups.length, async (newLength, oldLength) => {
  if (newLength <= oldLength) return
  await nextTick()
  focusLastNewGroup()
})

/** 追加直後の新規グループカードを画面内に出し、名前入力へフォーカスする。 */
function focusLastNewGroup(): void {
  const cards = sectionRef.value?.querySelectorAll<HTMLElement>('[data-new-group-card="true"]')
  const card = cards?.[cards.length - 1]
  if (!card) return

  card.scrollIntoView({ block: 'center' })
  card.querySelector<HTMLInputElement>('input[aria-label="Name"]')?.focus({ preventScroll: true })
}
</script>

<template>
  <section
    ref="sectionRef"
    class="min-w-0 space-y-3"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-baseline gap-2">
        <h2 class="text-heading-md text-foreground">
          Groups
        </h2>
        <p class="text-body-sm text-muted-foreground">
          {{ groupCountLabel }}
        </p>
      </div>
      <BaseButton
        type="button"
        aria-label="Add group"
        variant="primary"
        @click="$emit('addGroup')"
      >
        <PlusIcon
          aria-hidden="true"
          class="size-4"
        />
        Add Group
      </BaseButton>
    </div>

    <EmptyState
      v-if="groupCount === 0"
      aria-label="No groups"
      spacious
    >
      No groups yet
    </EmptyState>

    <div class="min-w-0 space-y-4">
      <GroupCard
        v-for="(_, i) in groups"
        :key="groups[i].id"
        :group="groups[i]"
        :time-limit-usage-summary="timeLimitUsageSummary(groups[i])"
        @save="$emit('saveGroup', $event)"
        @remove="$emit('removeGroup', groups[i].id)"
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
    </div>
  </section>
</template>
