<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DEFAULT_GLOBAL_SETTINGS, createEmptyGroup } from '@/utils/defaults'
import { debounce } from '@/utils/debounce'
import { loadSettings, saveSettings } from '@/utils/storage'
import { validateGlobalSettings, validateGroup } from '@/utils/validation'
import type { BlockedTimeSlot, DayOfWeek, Group, Settings, TimeLimit } from '@/utils/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

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

/** 指定グループ・ブロック時間帯番号・サブフィールドのエラーメッセージを返す。 */
function blockedTimeSlotError(g: Group, i: number, sub: string): string | undefined {
  return groupError(g, `blockedTimeSlots[${i}].${sub}`)
}

/** 指定グループ・上限番号・サブフィールドのエラーメッセージを返す。 */
function timeLimitError(g: Group, i: number, sub: string): string | undefined {
  return groupError(g, `timeLimits[${i}].${sub}`)
}

const confirmDialogRef = ref<InstanceType<typeof ConfirmDialog> | null>(null)

function addGroup(): void {
  const n = settings.value.groups.length + 1
  settings.value.groups.push(createEmptyGroup(`グループ${n}`))
}

/** グループ削除の確認ダイアログを表示し、承認された場合にグループを削除する。 */
async function removeGroup(id: string): Promise<void> {
  if (!await confirmDialogRef.value?.open('このグループを削除しますか？')) return
  settings.value.groups = settings.value.groups.filter(g => g.id !== id)
}

function addBlockedTimeSlot(g: Group): void {
  g.blockedTimeSlots.push({ daysOfWeek: [], start: '00:00', end: '00:00' })
}

function addTimeLimit(g: Group): void {
  g.timeLimits.push({ daysOfWeek: [], dailyMinutes: 30 })
}

/** number input の文字列値を timeLimit の `dailyMinutes` に反映する。 */
function setTimeLimitMinutes(limit: TimeLimit, value: string): void {
  limit.dailyMinutes = value === '' ? 0 : Number(value)
}

/** チェックボックスのトグルで `daysOfWeek` を昇順に保ったまま追加/削除する。 */
function toggleDay(entry: BlockedTimeSlot | TimeLimit, day: DayOfWeek): void {
  const idx = entry.daysOfWeek.indexOf(day)
  if (idx >= 0) {
    entry.daysOfWeek.splice(idx, 1)
  }
  else {
    entry.daysOfWeek = [...entry.daysOfWeek, day].sort((a, b) => a - b)
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
  <ConfirmDialog ref="confirmDialogRef" />
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
            {{ g.mode === 'blacklist' ? 'マッチしたURLをブロックします' : 'マッチしないURLをブロックします' }}
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

          <!-- ブロック時間帯 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">
                ブロック時間帯
              </h3>
              <button
                type="button"
                class="text-primary text-sm"
                @click="addBlockedTimeSlot(g)"
              >
                + ブロック時間帯追加
              </button>
            </div>
            <p
              v-if="g.blockedTimeSlots.length === 0"
              class="text-muted text-sm"
            >
              なし
            </p>
            <div
              v-for="(slot, i) in g.blockedTimeSlots"
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
                      :checked="slot.daysOfWeek.includes(d.value)"
                      @change="toggleDay(slot, d.value)"
                    >
                    <span>{{ d.label }}</span>
                  </label>
                </div>
              </fieldset>
              <p
                v-if="blockedTimeSlotError(g, i, 'daysOfWeek')"
                class="text-destructive text-sm"
              >
                {{ blockedTimeSlotError(g, i, 'daysOfWeek') }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1">
                  <span class="text-sm">開始時刻</span>
                  <input
                    v-model="slot.start"
                    type="time"
                    aria-label="開始時刻"
                    class="border border-input-border bg-input rounded-md px-2 py-1"
                  >
                </label>
                <span>-</span>
                <label class="flex items-center gap-1">
                  <span class="text-sm">終了時刻</span>
                  <input
                    v-model="slot.end"
                    type="time"
                    aria-label="終了時刻"
                    class="border border-input-border bg-input rounded-md px-2 py-1"
                  >
                </label>
                <button
                  type="button"
                  class="text-destructive text-sm ml-auto"
                  @click="g.blockedTimeSlots.splice(i, 1)"
                >
                  削除
                </button>
              </div>
              <p
                v-if="blockedTimeSlotError(g, i, 'start')"
                class="text-destructive text-sm"
              >
                {{ blockedTimeSlotError(g, i, 'start') }}
              </p>
              <p
                v-if="blockedTimeSlotError(g, i, 'end')"
                class="text-destructive text-sm"
              >
                {{ blockedTimeSlotError(g, i, 'end') }}
              </p>
            </div>
          </div>

          <!-- 上限 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">
                上限
              </h3>
              <button
                type="button"
                class="text-primary text-sm"
                @click="addTimeLimit(g)"
              >
                + 上限追加
              </button>
            </div>
            <p
              v-if="g.timeLimits.length === 0"
              class="text-muted text-sm"
            >
              なし
            </p>
            <div
              v-for="(limit, i) in g.timeLimits"
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
                      :checked="limit.daysOfWeek.includes(d.value)"
                      @change="toggleDay(limit, d.value)"
                    >
                    <span>{{ d.label }}</span>
                  </label>
                </div>
              </fieldset>
              <p
                v-if="timeLimitError(g, i, 'daysOfWeek')"
                class="text-destructive text-sm"
              >
                {{ timeLimitError(g, i, 'daysOfWeek') }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1">
                  <span class="text-sm">上限（分/日）</span>
                  <input
                    type="number"
                    min="0"
                    aria-label="上限分数"
                    :value="limit.dailyMinutes"
                    class="border border-input-border bg-input rounded-md px-2 py-1 w-28"
                    @input="setTimeLimitMinutes(limit, ($event.target as HTMLInputElement).value)"
                  >
                </label>
                <button
                  type="button"
                  class="text-destructive text-sm ml-auto"
                  @click="g.timeLimits.splice(i, 1)"
                >
                  削除
                </button>
              </div>
              <p
                v-if="timeLimitError(g, i, 'dailyMinutes')"
                class="text-destructive text-sm"
              >
                {{ timeLimitError(g, i, 'dailyMinutes') }}
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
