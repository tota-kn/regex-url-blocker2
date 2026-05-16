<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Cog6ToothIcon, ExclamationCircleIcon, EyeIcon, QueueListIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { getNextEffectiveSettingsResetAt, hasPendingEffectiveSettings } from '@/utils/effectiveSettings'
import { getTimeLimitUsageSummary, type TimeLimitUsageSummary } from '@/utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '@/utils/defaults'
import { debounce } from '@/utils/debounce'
import { loadCounters, loadEffectiveSettingsState, loadSettings, parseSettingsExportJson, saveSettings, serializeSettingsExport } from '@/utils/storage'
import { validateGlobalSettings, validateGroup } from '@/utils/validation'
import type { DailyRule, Group, Settings, TimeRange, UsageCountersState } from '@/utils/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import GlobalSettingsSection from '@/components/options/GlobalSettingsSection.vue'
import GroupsSection from '@/components/options/GroupsSection.vue'

const settings = ref<Settings>({
  global: { ...DEFAULT_GLOBAL_SETTINGS },
  groups: [],
})
const effectiveSettings = ref<Settings>({
  global: { ...DEFAULT_GLOBAL_SETTINGS },
  groups: [],
})
const counters = ref<UsageCountersState>({ counters: {} })
const now = ref(new Date())
const isLoaded = ref(false)
const newGroupDrafts = ref<Group[]>([])
const importError = ref<string | undefined>(undefined)
const activeSettingsDialogRef = ref<HTMLDialogElement | null>(null)
const activeSection = ref<'groups' | 'general'>('groups')

const globalErrors = computed(() => validateGlobalSettings(settings.value.global))
const groupsErrors = computed(() =>
  new Map(settings.value.groups.map(g => [g.id, validateGroup(g)])),
)
const totalErrors = computed(() => {
  let n = globalErrors.value.length
  for (const errs of groupsErrors.value.values()) n += errs.length
  return n
})
const hasPendingSettings = computed(() =>
  isLoaded.value && hasPendingEffectiveSettings(settings.value, effectiveSettings.value),
)
const nextResetAt = computed(() =>
  getNextEffectiveSettingsResetAt(effectiveSettings.value, now.value),
)
const resetTimeLabel = computed(() => effectiveSettings.value.global.dailyResetHour)
const appliesAfterLabel = computed(() => formatDateTime(nextResetAt.value))
const groupCount = computed(() => settings.value.groups.length + newGroupDrafts.value.length)
const hasGlobalErrors = computed(() => globalErrors.value.length > 0 || Boolean(importError.value))

/** 指定フィールドのグローバル設定エラーメッセージを返す。 */
function globalError(field: string): string | undefined {
  return globalErrors.value.find(e => e.field === field)?.message
}

/** 指定グループの今日の有効上限と残り時間を返す。 */
function timeLimitUsageSummary(g: Group): TimeLimitUsageSummary | undefined {
  return getTimeLimitUsageSummary(g, counters.value.counters[g.id], now.value, settings.value.global)
}

/** storage.local のカウンタを再読み込みする。 */
async function refreshCounters(): Promise<void> {
  counters.value = await loadCounters()
  now.value = new Date()
}

/** storage.local の有効設定スナップショットを再読み込みする。 */
async function refreshEffectiveSettings(): Promise<void> {
  effectiveSettings.value = (await loadEffectiveSettingsState(settings.value)).effectiveSettings
  now.value = new Date()
}

const confirmDialogRef = ref<InstanceType<typeof ConfirmDialog> | null>(null)

function addGroup(): void {
  const n = settings.value.groups.length + newGroupDrafts.value.length + 1
  newGroupDrafts.value.push(createEmptyGroup(`Group ${n}`))
}

/** 既存グループの保存済み値を、同じ id の編集ドラフトで置き換える。 */
function saveGroup(group: Group): void {
  settings.value.groups = settings.value.groups.map(current =>
    current.id === group.id ? group : current,
  )
}

/** 新規グループドラフトを保存済みグループへ昇格する。 */
function saveNewGroup(group: Group): void {
  newGroupDrafts.value = newGroupDrafts.value.filter(current => current.id !== group.id)
  settings.value.groups.push(group)
}

/** 新規グループドラフトを破棄する。 */
function cancelNewGroup(id: string): void {
  newGroupDrafts.value = newGroupDrafts.value.filter(group => group.id !== id)
}

/** グループ削除の確認ダイアログを表示し、承認された場合にグループを削除する。 */
async function removeGroup(id: string): Promise<void> {
  if (!await confirmDialogRef.value?.open('Delete group?')) return
  settings.value.groups = settings.value.groups.filter(g => g.id !== id)
}

const debouncedSave = debounce((s: Settings) => {
  void saveSettings(s)
}, 300)

/**
 * 現在の設定を即時保存する。重大な入力エラーがある場合は既存の自動保存と同じく保存しない。
 */
function saveNow(): void {
  if (!isLoaded.value) return
  if (totalErrors.value > 0) return
  void saveSettings(JSON.parse(JSON.stringify(settings.value)) as Settings)
}

/**
 * 現在の設定を JSON ファイルとしてダウンロードする。
 */
function exportSettings(): void {
  importError.value = undefined
  const blob = new Blob([serializeSettingsExport(settings.value)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'regex-url-blocker-settings.json'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 分単位の時刻を HH:MM 文字列に変換する。
 */
function formatMinute(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

/**
 * ブロック時間帯を読み取り表示用の文字列に変換する。
 */
function formatTimeRange(range: TimeRange): string {
  if (range.startMinute === range.endMinute) return 'All day'
  return `${formatMinute(range.startMinute)}-${formatMinute(range.endMinute)}`
}

/**
 * 日時を YYYY-MM-DD HH:MM で表示する。
 */
function formatDateTime(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

/**
 * 読み取り専用表示用に曜日別ルールを要約する。
 */
function formatDailyRule(rule: DailyRule): string {
  const ranges = rule.blockedTimeRanges.length > 0
    ? rule.blockedTimeRanges.map(formatTimeRange).join(', ')
    : 'none'
  const limit = rule.dailyLimitMinutes === undefined ? 'none' : `${rule.dailyLimitMinutes} min`
  return `Blocked: ${ranges}; limit: ${limit}`
}

/**
 * 現在適用中の有効設定モーダルを開く。
 */
function openActiveSettings(): void {
  activeSettingsDialogRef.value?.showModal()
}

/**
 * 現在適用中の有効設定モーダルを閉じる。
 */
function closeActiveSettings(): void {
  activeSettingsDialogRef.value?.close()
}

/**
 * JSON ファイルから設定を読み込み、既存設定を全置換して即時保存する。
 */
async function importSettings(file: File): Promise<void> {
  importError.value = undefined
  try {
    const importedSettings = parseSettingsExportJson(await file.text())
    settings.value = importedSettings
    newGroupDrafts.value = []
    await saveSettings(JSON.parse(JSON.stringify(importedSettings)) as Settings)
  }
  catch (error) {
    importError.value = error instanceof Error ? error.message : 'Failed to import settings'
  }
}

watch(settings, (s) => {
  if (!isLoaded.value) return
  if (totalErrors.value > 0) return
  debouncedSave(JSON.parse(JSON.stringify(s)) as Settings)
}, { deep: true })

const handleStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, areaName) => {
  if (areaName === 'local' && changes.counters) {
    void refreshCounters()
  }
  if (areaName === 'local' && (changes.effectiveSettings || changes.effectiveSettingsLogicalDate)) {
    void refreshEffectiveSettings()
  }
}

onMounted(async () => {
  const [loadedSettings, loadedCounters] = await Promise.all([loadSettings(), loadCounters()])
  const loadedEffectiveState = await loadEffectiveSettingsState(loadedSettings)
  settings.value = loadedSettings
  effectiveSettings.value = loadedEffectiveState.effectiveSettings
  counters.value = loadedCounters
  isLoaded.value = true
  browser.storage.onChanged.addListener(handleStorageChanged)
})

onUnmounted(() => {
  browser.storage.onChanged.removeListener(handleStorageChanged)
})
</script>

<template>
  <ConfirmDialog ref="confirmDialogRef" />
  <dialog
    ref="activeSettingsDialogRef"
    class="max-h-[85vh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-background p-0 text-foreground shadow-lg"
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
        @click="closeActiveSettings"
      >
        <XMarkIcon
          aria-hidden="true"
          class="size-4"
        />
      </BaseButton>
    </div>

    <div class="space-y-5 px-5 py-4">
      <section class="space-y-2">
        <h3 class="text-label-md text-secondary-foreground">
          General settings
        </h3>
        <dl class="grid gap-2 text-body-sm sm:grid-cols-2">
          <div class="rounded-md border border-border bg-surface p-3">
            <dt class="text-muted">
              Block action
            </dt>
            <dd class="mt-1 font-medium">
              {{ effectiveSettings.global.blockAction }}
            </dd>
          </div>
          <div class="rounded-md border border-border bg-surface p-3">
            <dt class="text-muted">
              Daily reset time
            </dt>
            <dd class="mt-1 font-medium">
              {{ effectiveSettings.global.dailyResetHour }}
            </dd>
          </div>
          <div class="rounded-md border border-border bg-surface p-3 sm:col-span-2">
            <dt class="text-muted">
              Redirect URL
            </dt>
            <dd class="mt-1 break-all font-medium">
              {{ effectiveSettings.global.redirectUrl }}
            </dd>
          </div>
        </dl>
      </section>

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
            <span class="rounded-md border border-border px-2 py-1 text-label-sm text-muted">
              {{ group.mode }}
            </span>
          </div>
          <div>
            <p class="text-label-sm text-muted">
              Patterns
            </p>
            <ul class="mt-1 space-y-1 text-body-sm">
              <li
                v-for="pattern in group.patterns"
                :key="pattern"
                class="break-all rounded border border-border bg-background px-2 py-1 font-mono text-xs"
              >
                {{ pattern }}
              </li>
              <li
                v-if="group.patterns.length === 0"
                class="text-muted"
              >
                none
              </li>
            </ul>
          </div>
          <div>
            <p class="text-label-sm text-muted">
              Daily rules
            </p>
            <dl class="mt-1 grid gap-1 text-body-sm">
              <div
                v-for="rule in group.dailyRules"
                :key="rule.dayOfWeek"
                class="grid gap-1 rounded border border-border bg-background px-2 py-1 sm:grid-cols-[4rem_minmax(0,1fr)]"
              >
                <dt class="font-medium">
                  {{ ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][rule.dayOfWeek] }}
                </dt>
                <dd class="text-muted">
                  {{ formatDailyRule(rule) }}
                </dd>
              </div>
            </dl>
          </div>
        </article>
      </section>
    </div>
  </dialog>
  <main class="min-h-screen overflow-x-hidden bg-secondary/40 text-foreground">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <p
        v-if="!isLoaded"
        class="rounded-lg border border-border bg-background p-5 text-sm text-muted shadow-sm"
      >
        Loading...
      </p>

      <template v-else>
        <div
          v-if="hasPendingSettings"
          class="flex flex-col gap-3 rounded-lg border border-warning bg-warning/10 p-4 text-warning-text sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="text-label-md">
              Some saved changes are not active yet.
            </p>
            <p class="mt-1 text-body-sm">
              Active until reset: {{ resetTimeLabel }}
            </p>
            <p class="text-body-sm">
              Applies after: {{ appliesAfterLabel }}
            </p>
          </div>
          <BaseButton
            type="button"
            variant="secondary"
            aria-label="View active settings"
            @click="openActiveSettings"
          >
            <EyeIcon
              aria-hidden="true"
              class="size-4"
            />
            View active settings
          </BaseButton>
        </div>
        <div class="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
          <aside
            aria-label="Options sections"
            class="border-b border-border pb-3 lg:sticky lg:top-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
          >
            <h1 class="mb-4 text-heading-lg text-foreground">
              Regex URL Blocker
            </h1>
            <nav class="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              <button
                type="button"
                aria-label="Groups"
                class="flex min-w-max items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-label-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:w-full"
                :class="activeSection === 'groups'
                  ? 'border-primary bg-accent text-primary'
                  : 'border-transparent text-secondary-foreground hover:border-border-hover hover:bg-background'"
                :aria-current="activeSection === 'groups' ? 'page' : undefined"
                @click="activeSection = 'groups'"
              >
                <span class="flex items-center gap-2">
                  <QueueListIcon
                    aria-hidden="true"
                    class="size-4"
                  />
                  Groups
                </span>
                <span class="rounded-sm border border-border bg-background px-1.5 py-0.5 text-label-sm text-muted">
                  {{ groupCount }}
                </span>
              </button>

              <button
                type="button"
                aria-label="General settings"
                class="flex min-w-max items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-label-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:w-full"
                :class="activeSection === 'general'
                  ? 'border-primary bg-accent text-primary'
                  : 'border-transparent text-secondary-foreground hover:border-border-hover hover:bg-background'"
                :aria-current="activeSection === 'general' ? 'page' : undefined"
                @click="activeSection = 'general'"
              >
                <span class="flex items-center gap-2">
                  <Cog6ToothIcon
                    aria-hidden="true"
                    class="size-4"
                  />
                  General settings
                </span>
                <ExclamationCircleIcon
                  v-if="hasGlobalErrors"
                  aria-label="General settings has errors"
                  class="size-4 text-danger"
                />
              </button>
            </nav>
          </aside>

          <div class="min-w-0">
            <GroupsSection
              v-if="activeSection === 'groups'"
              v-model="settings.groups"
              :new-groups="newGroupDrafts"
              :time-limit-usage-summary="timeLimitUsageSummary"
              @add-group="addGroup"
              @save-group="saveGroup"
              @save-new-group="saveNewGroup"
              @cancel-new-group="cancelNewGroup"
              @remove-group="removeGroup"
            />

            <GlobalSettingsSection
              v-else
              v-model="settings.global"
              :error="globalError"
              :import-error="importError"
              @export-settings="exportSettings"
              @import-settings="importSettings"
              @save-now="saveNow"
            />
          </div>
        </div>
        <AlertMessage
          v-if="totalErrors > 0"
        >
          Errors: {{ totalErrors }}
        </AlertMessage>
      </template>
    </div>
  </main>
</template>
