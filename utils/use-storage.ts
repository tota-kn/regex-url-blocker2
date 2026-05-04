import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { getAccumulators, getGroups, getSettings, onSyncChange } from '@/utils/storage'
import type { AccumulatorMap, GlobalSettings, Group } from '@/utils/types'

/**
 * `storage.sync` のグループ一覧をリアクティブに提供する。
 * storage 変更時に自動で再読み込みする。
 * `ready` は初回ロード完了後に `true` になる。
 */
export function useGroups(): { groups: Ref<Group[]>, reload: () => Promise<void>, ready: Ref<boolean> } {
  const groups = ref<Group[]>([])
  const ready = ref(false)

  const reload = async () => {
    groups.value = await getGroups()
    ready.value = true
  }

  onMounted(async () => {
    await reload()
    onSyncChange(() => {
      reload()
    })
  })

  return { groups, reload, ready }
}

/**
 * `storage.sync` のグローバル設定をリアクティブに提供する。
 */
export function useSettings(): { settings: Ref<GlobalSettings>, reload: () => Promise<void> } {
  const settings = ref<GlobalSettings>({ redirectUrl: 'https://example.com', dailyResetHour: '00:00' })

  const reload = async () => {
    settings.value = await getSettings()
  }

  onMounted(async () => {
    await reload()
    onSyncChange(() => {
      reload()
    })
  })

  return { settings, reload }
}

/**
 * `storage.local` の累積カウンタマップをリアクティブに提供する。
 */
export function useAccumulators(): { accumulators: Ref<AccumulatorMap>, reload: () => Promise<void> } {
  const accumulators = ref<AccumulatorMap>({})

  const reload = async () => {
    accumulators.value = await getAccumulators()
  }

  onMounted(reload)

  return { accumulators, reload }
}
