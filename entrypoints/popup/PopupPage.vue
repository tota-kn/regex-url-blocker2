<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Cog6ToothIcon } from '@heroicons/vue/24/outline'
import TimeLimitMeter from '@/components/TimeLimitMeter.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import {
  getEffectiveGroupBlockStatus,
  getRedirectUrls,
  getTargetGroupIds,
  restrictionMatchesToday,
  shouldSkipUrl,
  type GroupBlockStatus,
  type TimeLimitUsageSummary,
} from '@/utils/blocking'
import { getGroupPauseDisplayState, type GroupPauseDisplayState } from '@/utils/groupPause'
import { loadGroupPauseState, loadPageState } from '@/utils/storage'
import { useNowTimer } from '@/utils/useNowTimer'
import { useStorageListener } from '@/utils/useStorageListener'
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
const baselineSettings = ref<Settings | undefined>()
const counters = ref<UsageCountersState>({ counters: {} })
const groupPauseState = ref<GroupPauseState>({ groupPauseState: {} })
const activeUrl = ref<string | undefined>()
const { now, start: startNowTimer } = useNowTimer()
const counterLoadedAt = ref(new Date())
const isLoaded = ref(false)

const isSkippedPage = computed(() => {
  if (!settings.value) return false
  return (
    shouldSkipUrl(activeUrl.value, getRedirectUrls(settings.value)) ||
    (baselineSettings.value
      ? shouldSkipUrl(activeUrl.value, getRedirectUrls(baselineSettings.value))
      : false)
  )
})

const targetGroups = computed(() => {
  if (!settings.value || !baselineSettings.value) return []
  const ids = new Set([
    ...getTargetGroupIds(settings.value, activeUrl.value),
    ...getTargetGroupIds(baselineSettings.value, activeUrl.value),
  ])
  const groups = [...baselineSettings.value.groups, ...settings.value.groups]
  return [
    ...new Map(
      groups.filter((group) => ids.has(group.id)).map((group) => [group.id, group]),
    ).values(),
  ]
})

const displayGroups = computed<DisplayGroup[]>(() => {
  if (!settings.value || !baselineSettings.value) return []
  return targetGroups.value.flatMap((group) => {
    const effective = getEffectiveGroupBlockStatus(
      group.id,
      baselineSettings.value!,
      settings.value!,
      counters.value.counters[group.id],
      activeUrl.value,
      now.value,
    )
    if (!effective) return []
    const { group: displayGroup, status } = effective
    const pauseState = getGroupPauseDisplayState(
      groupPauseState.value.groupPauseState[group.id],
      now.value,
    )
    const hasDisplayState = status.restrictions.length > 0 || pauseState.kind !== 'none'
    return hasDisplayState ? [{ group: displayGroup, status, pauseState }] : []
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
 * counter 読み込み後の経過秒数を反映した残り秒数を返す。
 */
function realtimeRemainingSeconds(summary: TimeLimitUsageSummary): number {
  const elapsedSec = Math.max(
    0,
    Math.floor((now.value.getTime() - counterLoadedAt.value.getTime()) / 1000),
  )
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
  activeUrl.value =
    tabs.find((candidate) => !shouldSkipUrl(candidate.url, getRedirectUrls(currentSettings)))
      ?.url ?? tab?.url
}

/**
 * 設定とカウンタを再読み込みする。
 */
async function refreshState(): Promise<void> {
  const { settings: preferred, counters: loadedCounters, effectiveSettings } = await loadPageState()
  const loadedGroupPauseState = await loadGroupPauseState(
    effectiveSettings.groups.map((group) => group.id),
    Date.now(),
  )
  settings.value = preferred
  baselineSettings.value = effectiveSettings
  counters.value = loadedCounters
  groupPauseState.value = loadedGroupPauseState
  now.value = new Date()
  counterLoadedAt.value = now.value
}

const handleStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
  changes,
  areaName,
) => {
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

useStorageListener(handleStorageChanged)

onMounted(async () => {
  await refreshState()
  if (settings.value) await refreshActiveUrl(settings.value)
  isLoaded.value = true
  startNowTimer()
})
</script>

<template>
  <main class="w-80 space-y-4 bg-background p-4 text-foreground">
    <header class="flex items-center justify-between gap-3">
      <h1 class="min-w-0 truncate text-heading-lg">Regex URL Guard</h1>
      <BaseButton size="sm" aria-label="Open options" @click="openOptionsPage">
        <Cog6ToothIcon class="size-4" aria-hidden="true" />
        Options
      </BaseButton>
    </header>

    <p v-if="!isLoaded" class="text-body-md text-muted-foreground">Loading...</p>

    <template v-else>
      <EmptyState v-if="isSkippedPage"> This page is excluded from blocking. </EmptyState>

      <EmptyState v-else-if="targetGroups.length === 0">
        No matching groups for this page.
      </EmptyState>

      <EmptyState v-else-if="displayGroups.length === 0">
        No active limits apply to this page.
      </EmptyState>

      <ul v-else aria-label="Active limits for this page" class="space-y-2">
        <li
          v-for="{ group, status, pauseState } in displayGroups"
          :key="group.id"
          class="space-y-2 rounded-lg border border-border bg-surface p-3"
        >
          <div class="flex min-w-0 items-start justify-between gap-2">
            <p class="truncate text-label-md">
              {{ group.name }}
            </p>
            <StatusBadge v-if="isBlockedNow(status, pauseState)" kind="danger" class="shrink-0">
              Blocked now
            </StatusBadge>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <StatusBadge v-if="status.blockedByTimeRange" kind="danger">
              Blocked hours active
            </StatusBadge>
            <StatusBadge
              v-else-if="
                getRestrictions(group).some((restriction) => restriction.type === 'block') &&
                restrictionMatchesToday(group, now, settings!.global)
              "
              kind="muted"
            >
              Blocked hours scheduled
            </StatusBadge>
            <StatusBadge v-if="status.blockedByDailyLimit" kind="danger">
              Daily limit reached
            </StatusBadge>
            <StatusBadge
              v-if="pauseState.kind !== 'none'"
              :kind="pauseState.kind === 'paused' ? 'warning' : 'muted'"
            >
              {{ pauseState.label }}
            </StatusBadge>
            <StatusBadge v-if="status.waitSeconds !== undefined" kind="muted">
              Wait {{ status.waitSeconds }}s before access
            </StatusBadge>
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
