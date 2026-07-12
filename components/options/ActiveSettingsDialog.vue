<script setup lang="ts">
import { computed, ref } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GroupCard from '@/components/options/GroupCard.vue'
import type { Settings } from '@/utils/types'

/**
 * 現在有効な設定ダイアログの props。
 */
interface Props {
  /** background 判定に現在使われている有効設定。 */
  effectiveSettings: Settings
  /** ユーザーが最後に保存した設定。 */
  preferredSettings: Settings
}

const props = defineProps<Props>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const isOpen = ref(false)
const selectedGroupId = ref<string | undefined>(undefined)

/** 通知から選択された保存済みグループ。 */
const selectedPreferredGroup = computed(() =>
  props.preferredSettings.groups.find((group) => group.id === selectedGroupId.value),
)

/** 通知から選択された、以前の有効スナップショット。 */
const selectedRetainedBaselineGroup = computed(() =>
  props.effectiveSettings.groups.find((group) => group.id === selectedGroupId.value),
)

/**
 * 現在適用中の有効設定モーダルを開く。
 */
function open(groupId: string): void {
  selectedGroupId.value = groupId
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
  selectedGroupId.value = undefined
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
        <EmptyState v-if="!selectedPreferredGroup" aria-label="No active groups" spacious>
          No active groups
        </EmptyState>
        <GroupCard
          v-else
          :key="selectedPreferredGroup.id"
          :group="selectedPreferredGroup"
          read-only
        />
      </section>

      <section v-if="selectedRetainedBaselineGroup" class="mt-6 space-y-3">
        <div>
          <h3 class="text-label-md text-secondary-foreground">Earlier restrictions still active</h3>
          <p class="mt-1 text-body-sm text-muted">
            These are evaluated alongside the saved settings until the next rule day.
          </p>
        </div>
        <GroupCard
          :key="`baseline-${selectedRetainedBaselineGroup.id}`"
          :group="selectedRetainedBaselineGroup"
          read-only
        />
      </section>
    </div>
  </dialog>
</template>
