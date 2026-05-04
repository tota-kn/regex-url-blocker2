<template>
  <div
    class="max-w-2xl mx-auto p-6 space-y-6"
    :data-loaded="ready || undefined"
  >
    <h1 class="text-2xl font-bold">
      URL ブロッカー設定
    </h1>

    <GlobalSettingsEditor
      :settings="settings"
      @update:settings="onSettingsChange"
    />

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          グループ
        </h2>
        <button
          class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="グループを追加"
          @click="addGroup"
        >
          ＋ グループ追加
        </button>
      </div>

      <GroupList
        :groups="groups"
        @update="onGroupUpdate"
        @remove="onGroupRemove"
        @reorder="onGroupReorder"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import GlobalSettingsEditor from '@/components/options/GlobalSettingsEditor.vue'
import GroupList from '@/components/options/GroupList.vue'
import { useGroups, useSettings } from '@/utils/use-storage'
import { setGroups, setSettings } from '@/utils/storage'
import { newId } from '@/utils/uuid'
import type { GlobalSettings, Group } from '@/utils/types'

const { groups, reload: reloadGroups, ready } = useGroups()
const { settings, reload: reloadSettings } = useSettings()

let saveGroupsTimer: ReturnType<typeof setTimeout> | null = null

/**
 * グループ一覧を debounce して保存する。
 */
const scheduleSaveGroups = () => {
  if (saveGroupsTimer) clearTimeout(saveGroupsTimer)
  saveGroupsTimer = setTimeout(async () => {
    await setGroups(groups.value)
    await reloadGroups()
  }, 300)
}

let saveSettingsTimer: ReturnType<typeof setTimeout> | null = null

/**
 * グローバル設定を debounce して保存する。
 */
const scheduleSaveSettings = (s: GlobalSettings) => {
  if (saveSettingsTimer) clearTimeout(saveSettingsTimer)
  saveSettingsTimer = setTimeout(async () => {
    await setSettings(s)
    await reloadSettings()
  }, 300)
}

/**
 * 新規グループを追加する。
 */
const addGroup = () => {
  const newGroup: Group = {
    id: newId(),
    name: '新しいグループ',
    patterns: [],
    dailyTimeLimitMinutes: null,
    allowedHours: [],
  }
  groups.value = [...groups.value, newGroup]
  scheduleSaveGroups()
}

/**
 * 指定インデックスのグループ内容を更新する。
 */
const onGroupUpdate = (index: number, group: Group) => {
  groups.value = groups.value.map((g, i) => (i === index ? group : g))
  scheduleSaveGroups()
}

/**
 * 指定 ID のグループを削除する。
 */
const onGroupRemove = (id: string) => {
  groups.value = groups.value.filter(g => g.id !== id)
  scheduleSaveGroups()
}

/**
 * ドラッグ&ドロップで並び替えを行う。
 */
const onGroupReorder = (fromIndex: number, toIndex: number) => {
  const arr = [...groups.value]
  const [moved] = arr.splice(fromIndex, 1)
  arr.splice(toIndex, 0, moved)
  groups.value = arr
  scheduleSaveGroups()
}

/**
 * グローバル設定変更時のハンドラ。
 */
const onSettingsChange = (s: GlobalSettings) => {
  settings.value = s
  scheduleSaveSettings(s)
}

watch(groups, () => {}, { deep: true })
</script>
