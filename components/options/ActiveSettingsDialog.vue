<script setup lang="ts">
import { ref } from 'vue'
import { ClockIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import { dayLabel } from '@/utils/datetime'
import { getGroupPauseButtonState } from '@/utils/groupPause'
import { formatBlockDestination, formatDailyRule, formatGroupMode } from '@/utils/groups'
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

/**
 * 現在適用中の有効設定モーダルを開く。
 */
function open(): void {
  dialogRef.value?.showModal()
}

/**
 * 現在適用中の有効設定モーダルを閉じる。
 */
function close(): void {
  dialogRef.value?.close()
}

/** 指定グループの一時停止状態を返す。 */
function groupPauseEntry(groupId: string): GroupPauseEntry | undefined {
  return props.groupPauseState.groupPauseState[groupId]
}

/** 指定グループの一時停止ボタンラベルを返す。 */
function pauseButtonLabel(groupId: string): string {
  return getGroupPauseButtonState(groupPauseEntry(groupId), props.now).label
}

/** 指定グループの一時停止ボタンがクリック可能なら true を返す。 */
function canRequestPause(groupId: string): boolean {
  return getGroupPauseButtonState(groupPauseEntry(groupId), props.now).clickable
}

defineExpose({ open, close })
</script>

<template>
  <dialog
    ref="dialogRef"
    class="dialog-centered max-h-[85vh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-background p-0 text-foreground shadow-lg"
  >
    <div class="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
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

    <div class="px-5 py-4">
      <section class="space-y-3">
        <h3 class="text-label-md text-secondary-foreground">
          Groups
        </h3>
        <p
          v-if="effectiveSettings.groups.length === 0"
          aria-label="No active groups"
          class="rounded-md border border-border bg-surface p-3 text-body-sm text-muted"
        >
          No active groups
        </p>
        <article
          v-for="group in effectiveSettings.groups"
          :key="group.id"
          class="space-y-3 rounded-md border border-border bg-surface p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-label-md">
              {{ group.name }}
            </h4>
            <BaseButton
              type="button"
              :aria-label="pauseButtonLabel(group.id)"
              variant="secondary"
              :disabled="!canRequestPause(group.id)"
              @click="$emit('requestPause', group.id)"
            >
              <ClockIcon
                aria-hidden="true"
                class="size-4"
              />
              {{ pauseButtonLabel(group.id) }}
            </BaseButton>
          </div>
          <div>
            <p class="text-label-sm text-muted">
              URL patterns
            </p>
            <ul class="mt-2 space-y-1 text-body-sm">
              <li
                v-for="pattern in group.patterns"
                :key="pattern"
                class="break-all rounded border border-border bg-background px-2 py-1 font-mono text-xs"
              >
                {{ pattern }}
              </li>
              <li
                v-if="group.patterns.length === 0"
                class="rounded border border-border bg-background px-2 py-1 text-muted"
              >
                No URL patterns yet
              </li>
            </ul>
          </div>
          <div>
            <p class="text-label-sm text-muted">
              Blocking rules
            </p>
            <dl class="mt-1 grid gap-1 text-body-sm">
              <div
                v-for="rule in group.dailyRules"
                :key="rule.dayOfWeek"
                class="grid gap-1 rounded border border-border bg-background px-2 py-1 sm:grid-cols-[4rem_minmax(0,1fr)]"
              >
                <dt class="font-medium">
                  {{ dayLabel(rule.dayOfWeek) }}
                </dt>
                <dd class="text-muted">
                  {{ formatDailyRule(rule) }}
                </dd>
              </div>
            </dl>
          </div>
          <div>
            <p class="text-label-sm text-muted">
              Options
            </p>
            <dl class="mt-1 grid gap-2 text-body-sm sm:grid-cols-2">
              <div class="rounded border border-border bg-background px-2 py-1">
                <dt class="text-muted">
                  URL pattern match behavior
                </dt>
                <dd class="mt-1 font-medium">
                  {{ formatGroupMode(group) }}
                </dd>
              </div>
              <div class="rounded border border-border bg-background px-2 py-1">
                <dt class="text-muted">
                  Lock changes until next rule day
                </dt>
                <dd class="mt-1 font-medium">
                  {{ group.lockMode ? 'On' : 'Off' }}
                </dd>
              </div>
              <div class="rounded border border-border bg-background px-2 py-1">
                <dt class="text-muted">
                  Page shown when blocked
                </dt>
                <dd class="mt-1 break-all font-medium">
                  {{ formatBlockDestination(group) }}
                </dd>
              </div>
            </dl>
          </div>
        </article>
      </section>
    </div>
  </dialog>
</template>
