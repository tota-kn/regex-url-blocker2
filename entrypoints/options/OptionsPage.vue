<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Cog6ToothIcon, ExclamationCircleIcon, EyeIcon, QueueListIcon } from '@heroicons/vue/24/outline'
import { getNextEffectiveSettingsResetAt, hasLockModeGroup, hasPendingEffectiveSettings } from '@/utils/effectiveSettings'
import { getTimeLimitUsageSummary, type TimeLimitUsageSummary } from '@/utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS, createGroupFromTemplate, type GroupTemplateId } from '@/utils/defaults'
import { debounce } from '@/utils/debounce'
import { formatDateTime } from '@/utils/datetime'
import { cloneSettings } from '@/utils/groups'
import { loadCounters, loadEffectiveSettingsState, loadSettings, parseSettingsExportJson, saveSettings, serializeSettingsExport } from '@/utils/storage'
import { validateGlobalSettings, validateGroup } from '@/utils/validation'
import type { Group, Settings, UsageCountersState } from '@/utils/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ActiveSettingsDialog from '@/components/options/ActiveSettingsDialog.vue'
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
const activeSettingsDialogRef = ref<InstanceType<typeof ActiveSettingsDialog> | null>(null)
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
const isDailyResetTimeLocked = computed(() =>
  hasLockModeGroup(settings.value) || hasLockModeGroup(effectiveSettings.value),
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

/** 指定テンプレートの新規グループドラフトを追加する。 */
function addGroup(templateId: GroupTemplateId): void {
  const n = settings.value.groups.length + newGroupDrafts.value.length + 1
  newGroupDrafts.value.push(createGroupFromTemplate(templateId, `Group ${n}`))
}

/** 既存グループの保存済み値を、同じ id の編集ドラフトで置き換える。 */
function saveGroup(group: Group): void {
  settings.value.groups = settings.value.groups.map(current =>
    current.id === group.id ? group : current,
  )
}

/** Lock Mode group がある間は保存値の daily reset time を現在有効な値に固定する。 */
function protectDailyResetTime(s: Settings): Settings {
  const next = cloneSettings(s)
  if (hasLockModeGroup(next) || hasLockModeGroup(effectiveSettings.value)) {
    next.global.dailyResetHour = effectiveSettings.value.global.dailyResetHour
  }
  return next
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
  const next = protectDailyResetTime(settings.value)
  settings.value.global.dailyResetHour = next.global.dailyResetHour
  void saveSettings(next)
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
  a.download = 'regex-url-guard-settings.json'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 現在適用中の有効設定モーダルを開く。
 */
function openActiveSettings(): void {
  activeSettingsDialogRef.value?.open()
}

/**
 * JSON ファイルから設定を読み込み、既存設定を全置換して即時保存する。
 */
async function importSettings(file: File): Promise<void> {
  importError.value = undefined
  try {
    const importedSettings = parseSettingsExportJson(await file.text())
    const next = protectDailyResetTime(importedSettings)
    settings.value = next
    newGroupDrafts.value = []
    await saveSettings(next)
  }
  catch (error) {
    importError.value = error instanceof Error ? error.message : 'Failed to import settings'
  }
}

watch(settings, (s) => {
  if (!isLoaded.value) return
  if (totalErrors.value > 0) return
  const next = protectDailyResetTime(s)
  if (next.global.dailyResetHour !== settings.value.global.dailyResetHour) {
    settings.value.global.dailyResetHour = next.global.dailyResetHour
  }
  debouncedSave(next)
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
  effectiveSettings.value = loadedEffectiveState.effectiveSettings
  settings.value = protectDailyResetTime(loadedSettings)
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
  <ActiveSettingsDialog
    ref="activeSettingsDialogRef"
    :effective-settings="effectiveSettings"
  />
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
            <h1 class="mb-4 flex items-center gap-2 text-heading-md text-foreground">
              <img
                src="/icon/32.png"
                alt=""
                aria-hidden="true"
                class="size-6 shrink-0"
              >
              Regex URL Guard
            </h1>
            <nav class="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              <button
                type="button"
                aria-label="Groups"
                class="flex min-w-max items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-label-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:w-full"
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
                class="flex min-w-max items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-label-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:w-full"
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
              :daily-reset-time-locked="isDailyResetTimeLocked"
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
