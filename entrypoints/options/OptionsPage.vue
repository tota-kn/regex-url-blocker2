<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getTimeLimitUsageSummary, type TimeLimitUsageSummary } from '@/utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '@/utils/defaults'
import { debounce } from '@/utils/debounce'
import { loadCounters, loadSettings, parseSettingsExportJson, saveSettings, serializeSettingsExport } from '@/utils/storage'
import { validateGlobalSettings, validateGroup } from '@/utils/validation'
import type { Group, Settings, UsageCountersState } from '@/utils/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import GlobalSettingsSection from '@/components/options/GlobalSettingsSection.vue'
import GroupsSection from '@/components/options/GroupsSection.vue'

const settings = ref<Settings>({
  global: { ...DEFAULT_GLOBAL_SETTINGS },
  groups: [],
})
const counters = ref<UsageCountersState>({ counters: {} })
const now = ref(new Date())
const isLoaded = ref(false)
const newGroupDrafts = ref<Group[]>([])
const importError = ref<string | undefined>(undefined)

const globalErrors = computed(() => validateGlobalSettings(settings.value.global))
const groupsErrors = computed(() =>
  new Map(settings.value.groups.map(g => [g.id, validateGroup(g)])),
)
const totalErrors = computed(() => {
  let n = globalErrors.value.length
  for (const errs of groupsErrors.value.values()) n += errs.length
  return n
})

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
  if (areaName !== 'local') return
  if (!changes.counters) return
  void refreshCounters()
}

onMounted(async () => {
  const [loadedSettings, loadedCounters] = await Promise.all([loadSettings(), loadCounters()])
  settings.value = loadedSettings
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
  <main class="min-h-screen bg-secondary/40 text-foreground">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <h1 class="text-2xl font-semibold tracking-normal text-foreground">
        Regex URL Blocker
      </h1>

      <p
        v-if="!isLoaded"
        class="rounded-lg border border-border bg-background p-5 text-sm text-muted shadow-sm"
      >
        Loading...
      </p>

      <template v-else>
        <div class="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <GlobalSettingsSection
            v-model="settings.global"
            :error="globalError"
            :import-error="importError"
            @export-settings="exportSettings"
            @import-settings="importSettings"
            @save-now="saveNow"
          />

          <GroupsSection
            v-model="settings.groups"
            :new-groups="newGroupDrafts"
            :time-limit-usage-summary="timeLimitUsageSummary"
            @add-group="addGroup"
            @save-group="saveGroup"
            @save-new-group="saveNewGroup"
            @cancel-new-group="cancelNewGroup"
            @remove-group="removeGroup"
          />
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
