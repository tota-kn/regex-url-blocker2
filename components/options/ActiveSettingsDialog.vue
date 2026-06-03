<script setup lang="ts">
import { ref } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GroupCard from '@/components/options/GroupCard.vue'
import type { GroupPauseEntry, GroupPauseState, Settings } from '@/utils/types'

/**
 * 現在有効な設定ダイアログの props。
 */
interface Props {
  /** background 判定に現在使われている有効設定。 */
  effectiveSettings: Settings
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
    class="dialog-centered max-h-[85vh] w-[min(64rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-lg [&[open]]:flex"
    @close="handleClose"
  >
    <div
      aria-label="Active settings header"
      class="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 py-4"
    >
      <div>
        <h2 class="text-heading-md">
          Currently active settings
        </h2>
        <p class="mt-1 text-body-sm text-muted">
          Read-only settings used by blocking right now.
        </p>
      </div>
      <BaseButton
        type="button"
        size="icon-md"
        variant="secondary"
        aria-label="Close active settings"
        @click="close"
      >
        <XMarkIcon
          aria-hidden="true"
          class="size-4"
        />
      </BaseButton>
    </div>

    <div
      v-if="isOpen"
      aria-label="Active settings content"
      class="min-h-0 overflow-y-auto px-5 py-4"
    >
      <section class="space-y-3">
        <h3 class="text-label-md text-secondary-foreground">
          Groups
        </h3>
        <EmptyState
          v-if="effectiveSettings.groups.length === 0"
          aria-label="No active groups"
          spacious
        >
          No active groups
        </EmptyState>
        <GroupCard
          v-for="group in effectiveSettings.groups"
          :key="group.id"
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
