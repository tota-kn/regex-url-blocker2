import { DEFAULT_GLOBAL_SETTINGS } from './defaults'
import type { BlockAction, BlockedTimeSlot, GlobalSettings, Group, GroupMode, Settings, TimeLimit, UsageCountersState } from './types'

/**
 * 保存済み値を有効なブロック時動作へ正規化する。
 */
function normalizeBlockAction(value: unknown): BlockAction {
  return value === 'redirect' || value === 'blockedPage' ? value : DEFAULT_GLOBAL_SETTINGS.blockAction
}

/**
 * browser.storage.sync から `Settings` 全体を読み込む。
 * 未設定キーや欠損フィールドは `DEFAULT_GLOBAL_SETTINGS` で穴埋めする。
 * 旧フォーマット（`schedules`）は破棄し `blockedTimeSlots` / `timeLimits` で初期化する。
 */
export async function loadSettings(): Promise<Settings> {
  const raw = await browser.storage.sync.get(['global', 'groups']) as {
    global?: Partial<GlobalSettings>
    groups?: unknown
  }
  const groups: Group[] = Array.isArray(raw.groups)
    ? (raw.groups as Record<string, unknown>[]).map(g => ({
        id: typeof g.id === 'string' ? g.id : crypto.randomUUID(),
        name: typeof g.name === 'string' ? g.name : '',
        mode: (g.mode === 'blacklist' || g.mode === 'whitelist' ? g.mode : 'blacklist') as GroupMode,
        patterns: Array.isArray(g.patterns) ? (g.patterns as string[]) : [],
        blockedTimeSlots: Array.isArray(g.blockedTimeSlots) ? (g.blockedTimeSlots as BlockedTimeSlot[]) : [],
        timeLimits: Array.isArray(g.timeLimits) ? (g.timeLimits as TimeLimit[]) : [],
      }))
    : []
  const rawGlobal = raw.global ?? {}
  return {
    global: {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...rawGlobal,
      blockAction: normalizeBlockAction(rawGlobal.blockAction),
    },
    groups,
  }
}

/**
 * browser.storage.sync に `Settings` 全体を書き込む。
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.sync.set({
    global: settings.global,
    groups: settings.groups,
  })
}

/**
 * browser.storage.local から閲覧秒数カウンタを読み込む。
 * 不正な保存値は空のカウンタにフォールバックする。
 */
export async function loadCounters(): Promise<UsageCountersState> {
  const raw = await browser.storage.local.get(['counters']) as {
    counters?: unknown
  }
  if (!raw.counters || typeof raw.counters !== 'object' || Array.isArray(raw.counters)) {
    return { counters: {} }
  }

  const counters: UsageCountersState['counters'] = {}
  for (const [groupId, value] of Object.entries(raw.counters as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const counter = value as Record<string, unknown>
    if (typeof counter.logicalDate !== 'string') continue
    if (!Number.isFinite(counter.consumedSec)) continue
    counters[groupId] = {
      logicalDate: counter.logicalDate,
      consumedSec: Math.max(0, Math.floor(counter.consumedSec as number)),
    }
  }
  return { counters }
}

/**
 * browser.storage.local に閲覧秒数カウンタを書き込む。
 */
export async function saveCounters(state: UsageCountersState): Promise<void> {
  await browser.storage.local.set({
    counters: state.counters,
  })
}
