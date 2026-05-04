<template>
  <div class="w-80 p-4 space-y-3">
    <h1 class="text-base font-bold">
      URL ブロッカー
    </h1>

    <ResetCountdown
      :now="now"
      :reset-hour="settings.dailyResetHour"
    />

    <ul
      v-if="groups.length > 0"
      class="divide-y divide-gray-100"
    >
      <GroupStatusRow
        v-for="group in groups"
        :key="group.id"
        :group="group"
        :accumulator="accumulators[group.id]"
        :now="now"
      />
    </ul>

    <p
      v-else
      class="text-sm text-gray-500 italic"
    >
      グループが未登録です
    </p>

    <a
      :href="optionsUrl"
      target="_blank"
      class="block text-center text-sm text-blue-600 hover:text-blue-800 underline"
    >設定を開く</a>
  </div>
</template>

<script setup lang="ts">
import { browser } from 'wxt/browser'
import GroupStatusRow from '@/components/popup/GroupStatusRow.vue'
import ResetCountdown from '@/components/popup/ResetCountdown.vue'
import { useAccumulators, useGroups, useSettings } from '@/utils/use-storage'
import { useNow } from '@/utils/use-now'

const { groups } = useGroups()
const { settings } = useSettings()
const { accumulators, reload: reloadAccumulators } = useAccumulators()
const now = useNow(1000)

const optionsUrl = browser.runtime.getURL('/options.html')

// 1 秒ごとに累積カウンタを再読み込みして popup 表示を最新化する
setInterval(() => {
  reloadAccumulators()
}, 1000)
</script>
