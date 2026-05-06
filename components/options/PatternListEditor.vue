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
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-medium">
        <CodeBracketIcon
          aria-hidden="true"
          class="size-4"
        />
        Patterns
      </h3>
      <div class="flex items-center gap-2">
        <div class="flex rounded-md border border-border overflow-hidden text-sm">
          <button
            type="button"
            :aria-pressed="mode === 'blacklist'"
            :class="mode === 'blacklist'
              ? 'inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1'
              : 'inline-flex items-center gap-1 bg-input text-foreground px-3 py-1 hover:bg-muted'"
            @click="mode = 'blacklist'"
          >
            <NoSymbolIcon
              aria-hidden="true"
              class="size-4"
            />
            Block
          </button>
          <button
            type="button"
            :aria-pressed="mode === 'whitelist'"
            :class="mode === 'whitelist'
              ? 'inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1'
              : 'inline-flex items-center gap-1 bg-input text-foreground px-3 py-1 hover:bg-muted'"
            @click="mode = 'whitelist'"
          >
            <CheckCircleIcon
              aria-hidden="true"
              class="size-4"
            />
            Allow
          </button>
        </div>
        <button
          type="button"
          aria-label="Add pattern"
          class="inline-flex items-center gap-1 text-primary text-sm"
          @click="patterns.push('https?://')"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          Pattern
        </button>
      </div>
    </div>
    <div
      v-for="(_, i) in patterns"
      :key="i"
      class="space-y-1"
    >
      <div class="flex gap-2">
        <input
          v-model="patterns[i]"
          aria-label="Regex"
          placeholder="https?://"
          class="flex-1 border border-input-border bg-input rounded-md px-2 py-1 font-mono text-sm"
        >
        <button
          type="button"
          aria-label="Delete pattern"
          title="Delete"
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-muted"
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
        class="text-destructive text-sm"
      >
        {{ error(i) }}
      </p>
    </div>
  </div>
</template>
