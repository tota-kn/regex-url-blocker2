import { browser } from 'wxt/browser'
import { compilePatterns } from '@/utils/regex-match'
import { getAccumulators, getGroups, getSettings, setAccumulators } from '@/utils/storage'
import type { AccumulatorMap, GlobalSettings, Group } from '@/utils/types'

/** ハイドレーション完了を待つ Promise */
export let ready: Promise<void>

let _groups: Group[] = []
let _settings: GlobalSettings = { redirectUrl: 'https://example.com', dailyResetHour: '00:00' }
let _accumulators: AccumulatorMap = {}
let _compiled: Map<string, RegExp[]> = new Map()
const _dirty: Set<string> = new Set()

/** ストレージからデータをロードしてメモリキャッシュを初期化する。 */
export function hydrate(): Promise<void> {
  ready = (async () => {
    const [groups, settings, accumulators] = await Promise.all([
      getGroups(),
      getSettings(),
      getAccumulators(),
    ])
    _groups = groups
    _settings = settings
    _accumulators = accumulators
    _recompile()
  })()
  return ready
}

/** メモリキャッシュ内のグループを更新し、正規表現を再コンパイルする。 */
export function updateGroups(groups: Group[]): void {
  _groups = groups
  _recompile()
}

/** メモリキャッシュ内の設定を更新する。 */
export function updateSettings(settings: GlobalSettings): void {
  _settings = settings
}

/** 現在のグループ一覧を返す。 */
export function getGroupsCache(): Group[] {
  return _groups
}

/** 現在のグローバル設定を返す。 */
export function getSettingsCache(): GlobalSettings {
  return _settings
}

/** 現在の累積カウンタマップを返す。 */
export function getAccumulatorsCache(): AccumulatorMap {
  return _accumulators
}

/** 指定グループの累積カウンタを更新し、dirty 登録する。 */
export function setAccumulator(groupId: string, consumedSec: number, logicalDate: string): void {
  _accumulators[groupId] = { logicalDate, consumedSec }
  _dirty.add(groupId)
}

/** 指定グループのコンパイル済み正規表現を返す。 */
export function getCompiled(groupId: string): RegExp[] {
  return _compiled.get(groupId) ?? []
}

/** dirty なグループのカウンタを storage.local にフラッシュする。 */
export async function flushIfDirty(): Promise<void> {
  if (_dirty.size === 0) return
  _dirty.clear()
  await setAccumulators({ ..._accumulators })
}

/** background を起動するたびに onSuspend でフラッシュを登録する。 */
export function registerSuspendFlush(): void {
  browser.runtime.onSuspend.addListener(() => {
    flushIfDirty()
  })
}

function _recompile(): void {
  _compiled = new Map()
  for (const g of _groups) {
    _compiled.set(g.id, compilePatterns(g.patterns))
  }
}
