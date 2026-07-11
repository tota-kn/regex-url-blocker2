<script setup lang="ts">
import { computed, ref } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GroupCard from '@/components/options/GroupCard.vue'
import type { Group, GroupPauseEntry, GroupPauseState, Settings } from '@/utils/types'

/**
 * 現在有効な設定ダイアログの props。
 */
interface Props {
  /** background 判定に現在使われている有効設定。 */
  effectiveSettings: Settings
  /** ユーザーが最後に保存した設定。 */
  preferredSettings: Settings
  /** group id ごとの一時停止状態。 */
  groupPauseState: GroupPauseState
  /** 一時停止表示の残り時間計算に使う現在時刻。 */
  now: Date
}

/**
 * 現在有効な設定ダイアログが親へ通知するイベント。
 */
interface Emits {
  /** グループ一時停止操作が要求されたときに対象 id を通知する。 */
  requestPause: [groupId: string]
}

const props = defineProps<Props>()
defineEmits<Emits>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const isOpen = ref(false)

/** 制限強度に関係するフィールドだけを比較可能な値として返す。 */
function restrictionFields(group: Group): unknown {
  return {
    mode: group.mode,
    disabled: group.disabled,
    lockMode: group.lockMode,
    patterns: group.patterns,
    timeWindows: group.timeWindows,
    restrictions: group.restrictions,
  }
}

/** 最新設定とは異なるため、同時に適用されている rule-day 基準グループ。 */
const retainedBaselineGroups = computed(() => {
  const preferredById = new Map(props.preferredSettings.groups.map((group) => [group.id, group]))
  return props.effectiveSettings.groups.filter((baseline) => {
    const preferred = preferredById.get(baseline.id)
    return (
      !preferred ||
      JSON.stringify(restrictionFields(baseline)) !== JSON.stringify(restrictionFields(preferred))
    )
  })
})

/**
 * 現在適用中の有効設定モーダルを開く。
 */
function open(): void {
  isOpen.value = true
  dialogRef.value?.showModal()
}

/**
 * 現在適用中の有効設定モーダルを閉じる。
 */
function close(): void {
  dialogRef.value?.close()
}

/**
 * ブラウザ操作で閉じられたときにダイアログ本文をアンマウントする。
 */
function handleClose(): void {
  isOpen.value = false
}

/** 指定グループの一時停止状態を返す。 */
function groupPauseEntry(groupId: string): GroupPauseEntry | undefined {
  return props.groupPauseState.groupPauseState[groupId]
}

defineExpose({ open, close })
</script>

<template>
  <dialog
    ref="dialogRef"
    class="dialog-centered max-h-[85vh] w-[min(64rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/30 [&[open]]:flex"
    @close="handleClose"
  >
    <div
      aria-label="Active settings header"
      class="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 py-4"
    >
      <div>
        <h2 class="text-heading-md">Currently active settings</h2>
        <p class="mt-1 text-body-sm text-muted">
          Saved restrictions and retained rule-day restrictions are evaluated independently. The
          stricter result is used for each URL and time.
        </p>
      </div>
      <BaseButton
        type="button"
        size="icon-md"
        variant="secondary"
        aria-label="Close active settings"
        @click="close"
      >
        <XMarkIcon aria-hidden="true" class="size-4" />
      </BaseButton>
    </div>

    <div
      v-if="isOpen"
      aria-label="Active settings content"
      class="min-h-0 overflow-y-auto px-5 py-4"
    >
      <section class="space-y-3">
        <h3 class="text-label-md text-secondary-foreground">Latest saved settings</h3>
        <EmptyState
          v-if="preferredSettings.groups.length === 0"
          aria-label="No active groups"
          spacious
        >
          No active groups
        </EmptyState>
        <GroupCard
          v-for="group in preferredSettings.groups"
          :key="group.id"
          :group="group"
          :pause-entry="groupPauseEntry(group.id)"
          :now="now"
          read-only
          @request-pause="$emit('requestPause', group.id)"
        />
      </section>

      <section v-if="retainedBaselineGroups.length > 0" class="mt-6 space-y-3">
        <div>
          <h3 class="text-label-md text-secondary-foreground">Earlier restrictions still active</h3>
          <p class="mt-1 text-body-sm text-muted">
            These are evaluated alongside the saved settings until the next rule day.
          </p>
        </div>
        <GroupCard
          v-for="group in retainedBaselineGroups"
          :key="`baseline-${group.id}`"
          :group="group"
          :pause-entry="groupPauseEntry(group.id)"
          :now="now"
          read-only
          @request-pause="$emit('requestPause', group.id)"
        />
      </section>
    </div>
  </dialog>
</template>
