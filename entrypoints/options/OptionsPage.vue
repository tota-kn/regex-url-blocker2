<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '@/utils/defaults'
import { debounce } from '@/utils/debounce'
import { loadSettings, saveSettings } from '@/utils/storage'
import { validateGlobalSettings, validateGroup } from '@/utils/validation'
import type { DayOfWeek, Group, Schedule, Settings } from '@/utils/types'

const settings = ref<Settings>({
  global: { ...DEFAULT_GLOBAL_SETTINGS },
  groups: [],
})
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

/** 指定グループ・スケジュール番号・サブフィールドのエラーメッセージを返す。 */
function scheduleError(g: Group, i: number, sub: string): string | undefined {
  return groupError(g, `schedules[${i}].${sub}`)
}

function addGroup(): void {
  const n = settings.value.groups.length + 1
  settings.value.groups.push(createEmptyGroup(`グループ${n}`))
}

function removeGroup(id: string): void {
  if (!window.confirm('このグループを削除しますか？')) return
  settings.value.groups = settings.value.groups.filter(g => g.id !== id)
}

function addSchedule(g: Group): void {
  g.schedules.push({
    daysOfWeek: [],
    start: '00:00',
    end: '00:00',
    dailyTimeLimitMinutes: null,
  })
}

/** number input の文字列値を schedule の `dailyTimeLimitMinutes` に反映する。 */
function setScheduleLimit(s: Schedule, value: string): void {
  s.dailyTimeLimitMinutes = value === '' ? null : Number(value)
}

/** チェックボックスのトグルで `daysOfWeek` を昇順に保ったまま追加/削除する。 */
function toggleDay(s: Schedule, day: DayOfWeek): void {
  const idx = s.daysOfWeek.indexOf(day)
  if (idx >= 0) {
    s.daysOfWeek.splice(idx, 1)
  }
  else {
    s.daysOfWeek = [...s.daysOfWeek, day].sort((a, b) => a - b)
  }
}

const DAY_LABELS: { value: DayOfWeek, label: string }[] = [
  { value: 0, label: '日' },
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
]

const debouncedSave = debounce((s: Settings) => {
  void saveSettings(s)
}, 300)

watch(settings, (s) => {
  if (!isLoaded.value) return
  if (totalErrors.value > 0) return
  debouncedSave(JSON.parse(JSON.stringify(s)) as Settings)
}, { deep: true })

onMounted(async () => {
  settings.value = await loadSettings()
  isLoaded.value = true
})
</script>

<template>
  <main class="max-w-3xl mx-auto p-6 space-y-8 text-foreground">
    <h1 class="text-2xl font-bold">
      Regex URL Blocker - 設定
    </h1>

    <p v-if="!isLoaded">
      読み込み中…
    </p>

    <template v-else>
      <section class="space-y-3">
        <h2 class="text-lg font-semibold">
          グローバル設定
        </h2>

        <label class="block">
          <span class="block text-sm">リダイレクト先 URL</span>
          <input
            v-model="settings.global.redirectUrl"
            type="url"
            class="w-full border border-input-border bg-input rounded-md px-2 py-1"
          >
        </label>
        <p
          v-if="globalError('redirectUrl')"
          class="text-destructive text-sm"
        >
          {{ globalError('redirectUrl') }}
        </p>

        <label class="block">
          <span class="block text-sm">リセット時刻</span>
          <input
            v-model="settings.global.dailyResetHour"
            type="time"
            class="border border-input-border bg-input rounded-md px-2 py-1"
          >
        </label>
        <p
          v-if="globalError('dailyResetHour')"
          class="text-destructive text-sm"
        >
          {{ globalError('dailyResetHour') }}
        </p>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">
            グループ
          </h2>
          <button
            type="button"
            class="bg-primary text-primary-foreground rounded-md px-3 py-1 hover:bg-primary-hover"
            @click="addGroup"
          >
            + グループを追加
          </button>
        </div>

        <p
          v-if="settings.groups.length === 0"
          class="text-muted"
        >
          グループがありません。
        </p>

        <div
          v-for="g in settings.groups"
          :key="g.id"
          class="border border-border rounded-md p-4 space-y-4"
        >
          <div class="flex flex-wrap items-start gap-3">
            <label class="block flex-1 min-w-0">
              <span class="block text-sm">名前</span>
              <input
                v-model="g.name"
                class="w-full border border-input-border bg-input rounded-md px-2 py-1"
              >
            </label>
            <div class="flex flex-col gap-1 pt-5">
              <div class="flex rounded-md border border-border overflow-hidden text-sm">
                <button
                  type="button"
                  :aria-pressed="g.mode === 'blacklist'"
                  :class="g.mode === 'blacklist'
                    ? 'bg-primary text-primary-foreground px-3 py-1'
                    : 'bg-input text-foreground px-3 py-1 hover:bg-muted'"
                  @click="g.mode = 'blacklist'"
                >
                  ブラックリスト
                </button>
                <button
                  type="button"
                  :aria-pressed="g.mode === 'whitelist'"
                  :class="g.mode === 'whitelist'
                    ? 'bg-primary text-primary-foreground px-3 py-1'
                    : 'bg-input text-foreground px-3 py-1 hover:bg-muted'"
                  @click="g.mode = 'whitelist'"
                >
                  ホワイトリスト
                </button>
              </div>
            </div>
          </div>
          <p class="text-muted text-xs">
            {{ g.mode === 'blacklist' ? 'マッチしたURLをブロックします' : 'マッチしないURLをブロックします（スケジュール許可内のみ）' }}
          </p>
          <p
            v-if="groupError(g, 'name')"
            class="text-destructive text-sm"
          >
            {{ groupError(g, 'name') }}
          </p>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">
                正規表現パターン
              </h3>
              <button
                type="button"
                class="text-primary text-sm"
                @click="g.patterns.push('https?://')"
              >
                + パターン追加
              </button>
            </div>
            <div
              v-for="(_, i) in g.patterns"
              :key="i"
              class="space-y-1"
            >
              <div class="flex gap-2">
                <input
                  v-model="g.patterns[i]"
                  aria-label="正規表現"
                  class="flex-1 border border-input-border bg-input rounded-md px-2 py-1 font-mono text-sm"
                >
                <button
                  type="button"
                  class="text-destructive text-sm"
                  @click="g.patterns.splice(i, 1)"
                >
                  削除
                </button>
              </div>
              <p
                v-if="patternError(g, i)"
                class="text-destructive text-sm"
              >
                {{ patternError(g, i) }}
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">
                スケジュール
              </h3>
              <button
                type="button"
                class="text-primary text-sm"
                @click="addSchedule(g)"
              >
                + スケジュール追加
              </button>
            </div>
            <p
              v-if="g.schedules.length === 0"
              class="text-muted text-sm"
            >
              制限なし（24時間・上限なし）
            </p>
            <div
              v-for="(s, i) in g.schedules"
              :key="i"
              class="border border-border rounded-md p-3 space-y-2"
            >
              <fieldset class="space-y-1">
                <legend class="text-sm">
                  曜日（未選択=毎日）
                </legend>
                <div class="flex flex-wrap gap-2">
                  <label
                    v-for="d in DAY_LABELS"
                    :key="d.value"
                    class="flex items-center gap-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      :aria-label="d.label"
                      :checked="s.daysOfWeek.includes(d.value)"
                      @change="toggleDay(s, d.value)"
                    >
                    <span>{{ d.label }}</span>
                  </label>
                </div>
              </fieldset>
              <p
                v-if="scheduleError(g, i, 'daysOfWeek')"
                class="text-destructive text-sm"
              >
                {{ scheduleError(g, i, 'daysOfWeek') }}
              </p>

              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1">
                  <span class="text-sm">開始時刻</span>
                  <input
                    v-model="s.start"
                    type="time"
                    aria-label="開始時刻"
                    class="border border-input-border bg-input rounded-md px-2 py-1"
                  >
                </label>
                <span>-</span>
                <label class="flex items-center gap-1">
                  <span class="text-sm">終了時刻</span>
                  <input
                    v-model="s.end"
                    type="time"
                    aria-label="終了時刻"
                    class="border border-input-border bg-input rounded-md px-2 py-1"
                  >
                </label>
                <label class="flex items-center gap-1">
                  <span class="text-sm">上限（分）</span>
                  <input
                    type="number"
                    min="0"
                    aria-label="上限分数"
                    placeholder="上限なし"
                    :value="s.dailyTimeLimitMinutes ?? ''"
                    class="border border-input-border bg-input rounded-md px-2 py-1 w-28"
                    @input="setScheduleLimit(s, ($event.target as HTMLInputElement).value)"
                  >
                </label>
                <button
                  type="button"
                  class="text-destructive text-sm ml-auto"
                  @click="g.schedules.splice(i, 1)"
                >
                  削除
                </button>
              </div>
              <p
                v-if="scheduleError(g, i, 'start')"
                class="text-destructive text-sm"
              >
                {{ scheduleError(g, i, 'start') }}
              </p>
              <p
                v-if="scheduleError(g, i, 'end')"
                class="text-destructive text-sm"
              >
                {{ scheduleError(g, i, 'end') }}
              </p>
              <p
                v-if="scheduleError(g, i, 'dailyTimeLimitMinutes')"
                class="text-destructive text-sm"
              >
                {{ scheduleError(g, i, 'dailyTimeLimitMinutes') }}
              </p>
            </div>
          </div>

          <button
            type="button"
            class="text-destructive"
            @click="removeGroup(g.id)"
          >
            グループを削除
          </button>
        </div>
      </section>

      <p
        v-if="totalErrors > 0"
        class="text-destructive"
      >
        未保存のエラー: {{ totalErrors }}
      </p>
    </template>
  </main>
</template>
