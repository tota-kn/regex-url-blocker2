<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Cog6ToothIcon } from '@heroicons/vue/24/outline'
import TimeLimitMeter from '@/components/TimeLimitMeter.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { getRedirectUrls, getTargetGroupIds, getTimeLimitUsageSummary, shouldSkipUrl, type TimeLimitUsageSummary } from '@/utils/blocking'
import { loadCounters, loadEffectiveSettingsState, loadSettings } from '@/utils/storage'
import type { Group, Settings, UsageCountersState } from '@/utils/types'

interface DisplaySummary {
  /** 残り時間を表示する対象グループ。 */
  group: Group
  /** 今日の上限利用状況。 */
  summary: TimeLimitUsageSummary
}

const settings = ref<Settings | undefined>()
const counters = ref<UsageCountersState>({ counters: {} })
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

const displaySummaries = computed<DisplaySummary[]>(() => {
  if (!settings.value) return []
  return targetGroups.value.flatMap((group) => {
    const summary = getTimeLimitUsageSummary(group, counters.value.counters[group.id], now.value, settings.value!.global)
    return summary ? [{ group, summary }] : []
  })
})

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
  settings.value = loadedEffectiveState.effectiveSettings
  counters.value = loadedCounters
  now.value = new Date()
  counterLoadedAt.value = now.value
}

const handleStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, areaName) => {
  if (areaName === 'local' && changes.counters) {
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
        v-else-if="displaySummaries.length === 0"
      >
        No daily limits apply to this page.
      </EmptyState>

      <ul
        v-else
        aria-label="Remaining time for this page"
        class="space-y-2"
      >
        <li
          v-for="{ group, summary } in displaySummaries"
          :key="group.id"
          class="space-y-2 rounded-lg border border-border bg-surface p-3"
        >
          <p class="text-label-md truncate">
            {{ group.name }}
          </p>
          <TimeLimitMeter
            :summary="summary"
            :remaining-sec="realtimeRemainingSeconds(summary)"
            :aria-label="`Remaining time for ${group.name}`"
            :show-label="false"
            compact
          />
        </li>
      </ul>
    </template>
  </main>
</template>
