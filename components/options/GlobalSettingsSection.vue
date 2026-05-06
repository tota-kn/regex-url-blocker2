<script setup lang="ts">
import { ArrowTopRightOnSquareIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
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
    <h2 class="text-lg font-semibold tracking-normal">
      Global
    </h2>

    <label class="block">
      <span class="mb-1 flex items-center gap-1.5 text-sm">
        <ArrowTopRightOnSquareIcon
          aria-hidden="true"
          class="size-4"
        />
        Redirect URL
      </span>
      <input
        v-model="globalSettings.redirectUrl"
        type="url"
        aria-label="Redirect URL"
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
      <span class="mb-1 flex items-center gap-1.5 text-sm">
        <ArrowPathIcon
          aria-hidden="true"
          class="size-4"
        />
        Reset
      </span>
      <input
        v-model="globalSettings.dailyResetHour"
        type="time"
        aria-label="Reset time"
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
