<script setup lang="ts">
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'
import type { BlockAction, GlobalSettings } from '@/utils/types'

/**
 * グローバル設定セクションの props。
 */
interface Props {
  /** 指定フィールドのエラーメッセージを返す関数。 */
  error: (field: string) => string | undefined
}

defineProps<Props>()

const emit = defineEmits<{
  /** 即時保存したいグローバル設定変更を親へ通知する。 */
  saveNow: []
}>()

/**
 * Options 画面で編集するグローバル設定。
 */
const globalSettings = defineModel<GlobalSettings>({ required: true })

/**
 * ブロック時動作を変更し、background がすぐ参照できるよう即時保存を要求する。
 */
function setBlockAction(action: BlockAction): void {
  globalSettings.value.blockAction = action
  emit('saveNow')
}
</script>

<template>
  <section class="space-y-3 lg:sticky lg:top-6">
    <div class="flex h-12 items-center border-b border-border">
      <h2 class="text-base font-semibold tracking-normal">
        General settings
      </h2>
    </div>

    <div class="space-y-4 rounded-lg border border-border bg-background p-4 shadow-sm">
      <div>
        <span class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-secondary-foreground">
          <DocumentTextIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
          When a page is blocked
        </span>
        <div class="grid grid-cols-2 rounded-md border border-input-border bg-input p-1">
          <button
            type="button"
            aria-label="Redirect"
            :aria-pressed="globalSettings.blockAction === 'redirect'"
            class="h-8 rounded-sm px-2 text-sm font-medium transition aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
            @click="setBlockAction('redirect')"
          >
            Redirect
          </button>
          <button
            type="button"
            aria-label="Blocked page"
            :aria-pressed="globalSettings.blockAction === 'blockedPage'"
            class="h-8 rounded-sm px-2 text-sm font-medium transition aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
            @click="setBlockAction('blockedPage')"
          >
            Blocked page
          </button>
        </div>
      </div>
      <p
        v-if="error('blockAction')"
        class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
      >
        {{ error('blockAction') }}
      </p>

      <label
        v-if="globalSettings.blockAction === 'redirect'"
        class="block"
      >
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
        v-if="globalSettings.blockAction === 'redirect' && error('redirectUrl')"
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
          Daily reset time
        </span>
        <input
          v-model="globalSettings.dailyResetHour"
          type="time"
          aria-label="Daily reset time"
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
