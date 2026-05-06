<script setup lang="ts">
import { CheckCircleIcon, CodeBracketIcon, NoSymbolIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { GroupMode } from '@/utils/types'

/**
 * 正規表現パターン編集コンポーネントの props。
 */
interface Props {
  /** 指定パターン番号のエラーメッセージを返す関数。 */
  error: (index: number) => string | undefined
}

defineProps<Props>()

/**
 * グループに属する正規表現パターン配列。
 */
const patterns = defineModel<string[]>({ required: true })

/**
 * パターンの一致結果を制限対象にするか、除外対象にするかを表すモード。
 */
const mode = defineModel<GroupMode>('mode', { required: true })
</script>

<template>
  <section class="rounded-md border border-border bg-background p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-semibold">
        <CodeBracketIcon
          aria-hidden="true"
          class="size-4 text-muted"
        />
        URL patterns
      </h3>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex overflow-hidden rounded-md border border-border bg-input text-sm">
          <button
            type="button"
            :aria-pressed="mode === 'blacklist'"
            :class="mode === 'blacklist'
              ? 'inline-flex h-8 items-center gap-1 bg-primary px-3 text-primary-foreground'
              : 'inline-flex h-8 items-center gap-1 px-3 text-secondary-foreground hover:bg-secondary-hover'"
            @click="mode = 'blacklist'"
          >
            <NoSymbolIcon
              aria-hidden="true"
              class="size-4"
            />
            Block matches
          </button>
          <button
            type="button"
            :aria-pressed="mode === 'whitelist'"
            :class="mode === 'whitelist'
              ? 'inline-flex h-8 items-center gap-1 bg-primary px-3 text-primary-foreground'
              : 'inline-flex h-8 items-center gap-1 px-3 text-secondary-foreground hover:bg-secondary-hover'"
            @click="mode = 'whitelist'"
          >
            <CheckCircleIcon
              aria-hidden="true"
              class="size-4"
            />
            Allow only matches
          </button>
        </div>
        <button
          type="button"
          aria-label="Add URL pattern"
          class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-primary/30 px-2.5 text-sm font-medium text-primary transition hover:bg-accent"
          @click="patterns.push('https?://')"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          URL pattern
        </button>
      </div>
    </div>

    <div class="mt-3 space-y-2">
      <p
        v-if="patterns.length === 0"
        aria-label="No URL patterns"
        class="rounded-md border border-dashed border-border bg-input/60 px-3 py-2 text-sm text-muted"
      >
        No URL patterns yet
      </p>
      <div
        v-for="(_, i) in patterns"
        :key="i"
        class="space-y-1"
      >
        <div class="flex min-w-0 gap-2">
          <input
            v-model="patterns[i]"
            aria-label="URL regex pattern"
            placeholder="https?://"
            class="h-9 min-w-0 flex-1 rounded-md border border-input-border bg-input px-3 font-mono text-sm outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-ring/50"
          >
          <button
            type="button"
            aria-label="Delete pattern"
            title="Delete"
            class="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-destructive transition hover:bg-red-50"
            @click="patterns.splice(i, 1)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </button>
        </div>
        <p
          v-if="error(i)"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {{ error(i) }}
        </p>
      </div>
    </div>
  </section>
</template>
