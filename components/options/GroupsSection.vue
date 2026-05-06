<script setup lang="ts">
import { PlusIcon, RectangleStackIcon } from '@heroicons/vue/24/outline'
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

defineProps<Props>()
defineEmits<Emits>()

/**
 * Options 画面で編集するグループ配列。
 */
const groups = defineModel<Group[]>({ required: true })
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-lg border border-border bg-background p-4 shadow-sm">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 text-base font-semibold">
            <RectangleStackIcon
              aria-hidden="true"
              class="size-5 text-muted"
            />
            Groups
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ groups.length }} configured
          </p>
        </div>
        <button
          type="button"
          aria-label="Add group"
          class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring"
          @click="$emit('addGroup')"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          Group
        </button>
      </div>
    </div>

    <p
      v-if="groups.length === 0"
      aria-label="No groups"
      class="rounded-lg border border-dashed border-border bg-background p-8 text-center text-sm text-muted"
    >
      No groups yet
    </p>

    <div class="space-y-4">
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
        @save="$emit('saveNewGroup', $event)"
        @cancel="$emit('cancelNewGroup', group.id)"
        @remove="$emit('cancelNewGroup', group.id)"
      />
    </div>
  </section>
</template>
