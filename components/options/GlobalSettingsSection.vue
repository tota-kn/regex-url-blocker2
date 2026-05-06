<script setup lang="ts">
import type { GlobalSettings } from '@/utils/types'

/**
 * グローバル設定セクションの props。
 */
interface Props {
  /** 指定フィールドのエラーメッセージを返す関数。 */
  error: (field: string) => string | undefined
}

defineProps<Props>()

/**
 * Options 画面で編集するグローバル設定。
 */
const globalSettings = defineModel<GlobalSettings>({ required: true })
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-semibold">
      グローバル設定
    </h2>

    <label class="block">
      <span class="block text-sm">リダイレクト先 URL</span>
      <input
        v-model="globalSettings.redirectUrl"
        type="url"
        class="w-full border border-input-border bg-input rounded-md px-2 py-1"
      >
    </label>
    <p
      v-if="error('redirectUrl')"
      class="text-destructive text-sm"
    >
      {{ error('redirectUrl') }}
    </p>

    <label class="block">
      <span class="block text-sm">リセット時刻</span>
      <input
        v-model="globalSettings.dailyResetHour"
        type="time"
        class="border border-input-border bg-input rounded-md px-2 py-1"
      >
    </label>
    <p
      v-if="error('dailyResetHour')"
      class="text-destructive text-sm"
    >
      {{ error('dailyResetHour') }}
    </p>
  </section>
</template>
