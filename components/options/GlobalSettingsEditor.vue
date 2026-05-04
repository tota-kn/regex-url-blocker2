<template>
  <div class="p-4 bg-gray-50 rounded-lg space-y-4">
    <h2 class="text-lg font-semibold">
      グローバル設定
    </h2>
    <div>
      <label
        for="redirect-url"
        class="block text-sm font-medium text-gray-700 mb-1"
      >リダイレクト先 URL</label>
      <input
        id="redirect-url"
        v-model="local.redirectUrl"
        type="url"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="https://example.com"
        aria-label="リダイレクト先 URL"
        @input="emit('update:settings', { ...local })"
      >
    </div>
    <div>
      <label
        for="reset-hour"
        class="block text-sm font-medium text-gray-700 mb-1"
      >1日のリセット時刻</label>
      <input
        id="reset-hour"
        v-model="local.dailyResetHour"
        type="time"
        class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="1日のリセット時刻"
        @change="emit('update:settings', { ...local })"
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { GlobalSettings } from '@/utils/types'

/**
 * GlobalSettingsEditor のプロパティ定義。
 */
const props = defineProps<{
  /** 現在のグローバル設定 */
  settings: GlobalSettings
}>()

const emit = defineEmits<{
  /** 設定変更時に発火 */
  'update:settings': [settings: GlobalSettings]
}>()

const local = reactive<GlobalSettings>({ ...props.settings })

watch(() => props.settings, (s) => {
  local.redirectUrl = s.redirectUrl
  local.dailyResetHour = s.dailyResetHour
})
</script>
