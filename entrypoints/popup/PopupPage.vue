<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Cog6ToothIcon } from '@heroicons/vue/24/outline'
import TimeLimitMeter from '@/components/TimeLimitMeter.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { getGroupBlockStatus, getRedirectUrls, getTargetGroupIds, shouldSkipUrl, type GroupBlockStatus, type TimeLimitUsageSummary } from '@/utils/blocking'
import { getGroupPauseDisplayState, type GroupPauseDisplayState } from '@/utils/groupPause'
import { loadCounters, loadEffectiveSettingsState, loadGroupPauseState, loadSettings } from '@/utils/storage'
import type { Group, GroupPauseState, Settings, UsageCountersState } from '@/utils/types'

interface DisplayGroup {
  /** 状態を表示する対象グループ。 */
  group: Group
  /** 現在時刻のブロック状態。 */
  status: GroupBlockStatus
  /** 一時停止状態の表示情報。 */
  pauseState: GroupPauseDisplayState
}

const settings = ref<Settings | undefined>()
const counters = ref<UsageCountersState>({ counters: {} })
const groupPauseState = ref<GroupPauseState>({ groupPauseState: {} })
const activeUrl = ref<string | undefined>()
const now = ref(new Date())
const counterLoadedAt = ref(new Date())
const isLoaded = ref(false)
let tickingTimer: ReturnType<typeof setInterval> | undefined

const isSkippedPage = computed(() => {
  if (!settings.value) return false
  return shouldSkipUrl(activeUrl.value, getRedirectUrls(settings.value))
})

const targetGroups = computed(() => {
  if (!settings.value) return []
  const ids = new Set(getTargetGroupIds(settings.value, activeUrl.value))
  return settings.value.groups.filter(group => ids.has(group.id))
})

const displayGroups = computed<DisplayGroup[]>(() => {
  if (!settings.value) return []
  return targetGroups.value.flatMap((group) => {
    const status = getGroupBlockStatus(group, counters.value.counters[group.id], now.value, settings.value!.global)
    const pauseState = getGroupPauseDisplayState(groupPauseState.value.groupPauseState[group.id], now.value)
    const hasBlockedTimeRule = (status.dailyRule?.blockedTimeRanges.length ?? 0) > 0
    const hasDisplayState = hasBlockedTimeRule || status.timeLimitSummary || pauseState.kind !== 'none'
    return hasDisplayState ? [{ group, status, pauseState }] : []
  })
})

/**
 * group が現在ブロック表示を出すべきなら true を返す。
 */
function isBlockedNow(status: GroupBlockStatus, pauseState: GroupPauseDisplayState): boolean {
  if (pauseState.kind === 'paused') return false
  return status.blocked
}

/**
 * 状態 badge の配色を返す。
 */
function statusBadgeClass(kind: 'danger' | 'warning' | 'muted'): string {
  if (kind === 'danger') return 'border-danger-border bg-danger-subtle text-danger'
  if (kind === 'warning') return 'border-warning/30 bg-warning/10 text-warning-text'
  return 'border-border bg-surface-subtle text-secondary-foreground'
}

/**
 * counter 読み込み後の経過秒数を反映した残り秒数を返す。
 */
function realtimeRemainingSeconds(summary: TimeLimitUsageSummary): number {
  const elapsedSec = Math.max(0, Math.floor((now.value.getTime() - counterLoadedAt.value.getTime()) / 1000))
  return Math.max(0, summary.remainingSec - elapsedSec)
}

/**
 * 拡張機能のオプション画面を開く。
 */
async function openOptionsPage(): Promise<void> {
  await browser.runtime.openOptionsPage()
}

/**
 * 現在のウィンドウで選択中の判定対象タブ URL を読み込む。
 */
async function refreshActiveUrl(currentSettings: Settings): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!shouldSkipUrl(tab?.url, getRedirectUrls(currentSettings))) {
    activeUrl.value = tab?.url
    return
  }

  if (!tab?.url?.startsWith(`chrome-extension://${browser.runtime.id}/`)) {
    activeUrl.value = tab?.url
    return
  }

  const tabs = await browser.tabs.query({ currentWindow: true })
  activeUrl.value = tabs.find(candidate => !shouldSkipUrl(candidate.url, getRedirectUrls(currentSettings)))?.url ?? tab?.url
}

/**
 * 設定とカウンタを再読み込みする。
 */
async function refreshState(): Promise<void> {
  const [preferredSettings, loadedCounters] = await Promise.all([loadSettings(), loadCounters()])
  const loadedEffectiveState = await loadEffectiveSettingsState(preferredSettings)
  const loadedGroupPauseState = await loadGroupPauseState(
    loadedEffectiveState.effectiveSettings.groups.map(group => group.id),
    Date.now(),
  )
  settings.value = loadedEffectiveState.effectiveSettings
  counters.value = loadedCounters
  groupPauseState.value = loadedGroupPauseState
  now.value = new Date()
  counterLoadedAt.value = now.value
}

const handleStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, areaName) => {
  if (areaName === 'local' && (changes.counters || changes.groupPauseState)) {
    void refreshState()
  }
  if (areaName === 'local' && (changes.effectiveSettings || changes.effectiveSettingsLogicalDate)) {
    void refreshState()
  }
  if (areaName === 'sync' && (changes.global || changes.groups)) {
    void refreshState()
  }
}

onMounted(async () => {
  await refreshState()
  if (settings.value) await refreshActiveUrl(settings.value)
  isLoaded.value = true
  browser.storage.onChanged.addListener(handleStorageChanged)
  tickingTimer = setInterval(() => {
    now.value = new Date()
  }, 1_000)
})

onUnmounted(() => {
  browser.storage.onChanged.removeListener(handleStorageChanged)
  if (tickingTimer) clearInterval(tickingTimer)
})
</script>

<template>
  <main class="w-80 space-y-4 bg-background p-4 text-foreground">
    <header class="flex items-center justify-between gap-3">
      <h1 class="min-w-0 truncate text-heading-lg">
        Regex URL Guard
      </h1>
      <BaseButton
        size="sm"
        aria-label="Open options"
        @click="openOptionsPage"
      >
        <Cog6ToothIcon
          class="size-4"
          aria-hidden="true"
        />
        Options
      </BaseButton>
    </header>

    <p
      v-if="!isLoaded"
      class="text-sm text-muted-foreground"
    >
      Loading...
    </p>

    <template v-else>
      <EmptyState
        v-if="isSkippedPage"
      >
        This page is excluded from blocking.
      </EmptyState>

      <EmptyState
        v-else-if="targetGroups.length === 0"
      >
        No matching groups for this page.
      </EmptyState>

      <EmptyState
        v-else-if="displayGroups.length === 0"
      >
        No active limits apply to this page.
      </EmptyState>

      <ul
        v-else
        aria-label="Active limits for this page"
        class="space-y-2"
      >
        <li
          v-for="{ group, status, pauseState } in displayGroups"
          :key="group.id"
          class="space-y-2 rounded-lg border border-border bg-surface p-3"
        >
          <div class="flex min-w-0 items-start justify-between gap-2">
            <p class="truncate text-label-md">
              {{ group.name }}
            </p>
            <span
              v-if="isBlockedNow(status, pauseState)"
              :class="['shrink-0 rounded-sm border px-1.5 py-1 text-label-sm', statusBadgeClass('danger')]"
            >
              Blocked now
            </span>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <span
              v-if="status.blockedByTimeRange"
              :class="['rounded-sm border px-1.5 py-1 text-label-sm', statusBadgeClass('danger')]"
            >
              Blocked hours active
            </span>
            <span
              v-else-if="(status.dailyRule?.blockedTimeRanges.length ?? 0) > 0"
              :class="['rounded-sm border px-1.5 py-1 text-label-sm', statusBadgeClass('muted')]"
            >
              Blocked hours scheduled
            </span>
            <span
              v-if="status.blockedByDailyLimit"
              :class="['rounded-sm border px-1.5 py-1 text-label-sm', statusBadgeClass('danger')]"
            >
              Daily limit reached
            </span>
            <span
              v-if="pauseState.kind !== 'none'"
              :class="[
                'rounded-sm border px-1.5 py-1 text-label-sm',
                statusBadgeClass(pauseState.kind === 'paused' ? 'warning' : 'muted'),
              ]"
            >
              {{ pauseState.label }}
            </span>
          </div>

          <TimeLimitMeter
            v-if="status.timeLimitSummary"
            :summary="status.timeLimitSummary"
            :remaining-sec="realtimeRemainingSeconds(status.timeLimitSummary)"
            :aria-label="`Remaining time for ${group.name}`"
            :show-label="false"
            compact
          />
        </li>
      </ul>
    </template>
  </main>
</template>
