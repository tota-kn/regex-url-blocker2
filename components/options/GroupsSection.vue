<script setup lang="ts">
import { PlusIcon, RectangleStackIcon } from '@heroicons/vue/24/outline'
import type { TimeLimitUsageSummary } from '@/utils/blocking'
import type { Group } from '@/utils/types'
import GroupCard from './GroupCard.vue'

/**
 * グループ一覧セクションの props。
 */
interface Props {
  /** 指定グループ・指定フィールドのエラーメッセージを返す関数。 */
  groupError: (group: Group, field: string) => string | undefined
  /** 指定グループ・パターン番号のエラーメッセージを返す関数。 */
  patternError: (group: Group, index: number) => string | undefined
  /** 指定グループ・ブロック時間帯番号・サブフィールドのエラーメッセージを返す関数。 */
  blockedTimeSlotError: (group: Group, index: number, subField: string) => string | undefined
  /** 指定グループ・上限番号・サブフィールドのエラーメッセージを返す関数。 */
  timeLimitError: (group: Group, index: number, subField: string) => string | undefined
  /** 指定グループの今日の上限利用状況を返す関数。 */
  timeLimitUsageSummary: (group: Group) => TimeLimitUsageSummary | undefined
}

/**
 * グループ一覧セクションが親へ通知するイベント。
 */
interface Emits {
  /** グループ追加が要求されたときに発火する。 */
  addGroup: []
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
  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="flex items-center gap-1.5 text-lg font-semibold">
        <RectangleStackIcon
          aria-hidden="true"
          class="size-5"
        />
        Groups
      </h2>
      <button
        type="button"
        aria-label="Add group"
        class="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-1 hover:bg-primary-hover"
        @click="$emit('addGroup')"
      >
        <PlusIcon
          aria-hidden="true"
          class="size-4"
        />
        Group
      </button>
    </div>

    <p
      v-if="groups.length === 0"
      aria-label="No groups"
      class="text-muted text-sm"
    >
      Empty
    </p>

    <GroupCard
      v-for="(_, i) in groups"
      :key="groups[i].id"
      v-model="groups[i]"
      :error="field => groupError(groups[i], field)"
      :pattern-error="index => patternError(groups[i], index)"
      :blocked-time-slot-error="(index, subField) => blockedTimeSlotError(groups[i], index, subField)"
      :time-limit-error="(index, subField) => timeLimitError(groups[i], index, subField)"
      :time-limit-usage-summary="timeLimitUsageSummary(groups[i])"
      @remove="$emit('removeGroup', groups[i].id)"
    />
  </section>
</template>
