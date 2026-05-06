<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getTargetGroupIds, getTimeLimitUsageSummary, shouldSkipUrl, type TimeLimitUsageSummary } from '@/utils/blocking'
import { loadCounters, loadSettings } from '@/utils/storage'
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
  return shouldSkipUrl(activeUrl.value, settings.value.global.redirectUrl)
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
 * 秒数を mm:ss 形式に変換する。
 */
function formatMinutesSeconds(seconds: number): string {
  const roundedSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(roundedSeconds / 60)
  const remainingSeconds = String(roundedSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}

/**
 * counter 読み込み後の経過秒数を反映した残り秒数を返す。
 */
function realtimeRemainingSeconds(summary: TimeLimitUsageSummary): number {
  const elapsedSec = Math.max(0, Math.floor((now.value.getTime() - counterLoadedAt.value.getTime()) / 1000))
  return Math.max(0, summary.remainingSec - elapsedSec)
}

/**
 * 現在のウィンドウで選択中の判定対象タブ URL を読み込む。
 */
async function refreshActiveUrl(currentSettings: Settings): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!shouldSkipUrl(tab?.url, currentSettings.global.redirectUrl)) {
    activeUrl.value = tab?.url
    return
  }

  if (!tab?.url?.startsWith(`chrome-extension://${browser.runtime.id}/`)) {
    activeUrl.value = tab?.url
    return
  }

  const tabs = await browser.tabs.query({ currentWindow: true })
  activeUrl.value = tabs.find(candidate => !shouldSkipUrl(candidate.url, currentSettings.global.redirectUrl))?.url ?? tab?.url
}

/**
 * 設定とカウンタを再読み込みする。
 */
async function refreshState(): Promise<void> {
  const [loadedSettings, loadedCounters] = await Promise.all([loadSettings(), loadCounters()])
  settings.value = loadedSettings
  counters.value = loadedCounters
  now.value = new Date()
  counterLoadedAt.value = now.value
}

const handleStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, areaName) => {
  if (areaName === 'local' && changes.counters) {
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
  <main class="w-80 p-4 space-y-4 text-foreground">
    <h1 class="text-lg font-bold">
      Regex URL Blocker
    </h1>

    <p v-if="!isLoaded">
      Loading...
    </p>

    <template v-else>
      <p
        v-if="isSkippedPage"
        class="text-sm text-muted"
      >
        This page is excluded from blocking.
      </p>

      <p
        v-else-if="targetGroups.length === 0"
        class="text-sm text-muted"
      >
        No matching groups for this page.
      </p>

      <p
        v-else-if="displaySummaries.length === 0"
        class="text-sm text-muted"
      >
        No daily limits apply to this page.
      </p>

      <ul
        v-else
        aria-label="Remaining time for this page"
        class="space-y-2"
      >
        <li
          v-for="{ group, summary } in displaySummaries"
          :key="group.id"
          class="border border-border rounded-md p-3 space-y-1"
        >
          <p class="font-medium truncate">
            {{ group.name }}
          </p>
          <p class="text-sm text-muted">
            {{ formatMinutesSeconds(realtimeRemainingSeconds(summary)) }} remaining / {{ formatMinutesSeconds(summary.limitMinutes * 60) }} daily limit
          </p>
        </li>
      </ul>
    </template>
  </main>
</template>
