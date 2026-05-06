<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getTimeLimitUsageSummary, type TimeLimitUsageSummary } from '@/utils/blocking'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '@/utils/defaults'
import { debounce } from '@/utils/debounce'
import { loadCounters, loadSettings, saveSettings } from '@/utils/storage'
import { validateGlobalSettings, validateGroup } from '@/utils/validation'
import type { Group, Settings, UsageCountersState } from '@/utils/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GlobalSettingsSection from '@/components/options/GlobalSettingsSection.vue'
import GroupsSection from '@/components/options/GroupsSection.vue'

const settings = ref<Settings>({
  global: { ...DEFAULT_GLOBAL_SETTINGS },
  groups: [],
})
const counters = ref<UsageCountersState>({ counters: {} })
const now = ref(new Date())
const isLoaded = ref(false)

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

/** 指定グループ・指定フィールドのエラーメッセージを返す。 */
function groupError(g: Group, field: string): string | undefined {
  return groupsErrors.value.get(g.id)?.find(e => e.field === field)?.message
}

/** 指定グループ・パターン番号のエラーメッセージを返す。 */
function patternError(g: Group, i: number): string | undefined {
  return groupError(g, `patterns[${i}]`)
}

/** 指定グループ・ブロック時間帯番号・サブフィールドのエラーメッセージを返す。 */
function blockedTimeSlotError(g: Group, i: number, sub: string): string | undefined {
  return groupError(g, `blockedTimeSlots[${i}].${sub}`)
}

/** 指定グループ・上限番号・サブフィールドのエラーメッセージを返す。 */
function timeLimitError(g: Group, i: number, sub: string): string | undefined {
  return groupError(g, `timeLimits[${i}].${sub}`)
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
  const n = settings.value.groups.length + 1
  settings.value.groups.push(createEmptyGroup(`Group ${n}`))
}

/** グループ削除の確認ダイアログを表示し、承認された場合にグループを削除する。 */
async function removeGroup(id: string): Promise<void> {
  if (!await confirmDialogRef.value?.open('Delete group?')) return
  settings.value.groups = settings.value.groups.filter(g => g.id !== id)
}

const debouncedSave = debounce((s: Settings) => {
  void saveSettings(s)
}, 300)

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
          />

          <GroupsSection
            v-model="settings.groups"
            :group-error="groupError"
            :pattern-error="patternError"
            :blocked-time-slot-error="blockedTimeSlotError"
            :time-limit-error="timeLimitError"
            :time-limit-usage-summary="timeLimitUsageSummary"
            @add-group="addGroup"
            @remove-group="removeGroup"
          />
        </div>
        <p
          v-if="totalErrors > 0"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          Errors: {{ totalErrors }}
        </p>
      </template>
    </div>
  </main>
</template>
