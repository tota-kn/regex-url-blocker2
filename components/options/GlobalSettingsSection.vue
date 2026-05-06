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
  <section class="rounded-lg border border-border bg-background p-4 shadow-sm lg:sticky lg:top-6">
    <div class="border-b border-border pb-3">
      <h2 class="text-base font-semibold tracking-normal">
        Global
      </h2>
    </div>

    <div class="mt-4 space-y-4">
      <label class="block">
        <span class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
          <ArrowTopRightOnSquareIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
          Redirect URL
        </span>
        <input
          v-model="globalSettings.redirectUrl"
          type="url"
          aria-label="Redirect URL"
          class="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-ring/50"
        >
      </label>
      <p
        v-if="error('redirectUrl')"
        class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
      >
        {{ error('redirectUrl') }}
      </p>

      <label class="block">
        <span class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
          <ArrowPathIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
          Reset
        </span>
        <input
          v-model="globalSettings.dailyResetHour"
          type="time"
          aria-label="Reset time"
          class="h-10 w-full rounded-md border border-input-border bg-input px-3 text-sm outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-ring/50"
        >
      </label>
      <p
        v-if="error('dailyResetHour')"
        class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
      >
        {{ error('dailyResetHour') }}
      </p>
    </div>
  </section>
</template>
