<script setup lang="ts">
import { CodeBracketIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { ref } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { GroupMode } from '@/utils/types'

/**
 * URL pattern 編集コンポーネントの props。
 */
interface Props {
  /** 指定パターン番号のエラーメッセージを返す関数。 */
  error: (index: number) => string | undefined
  /** 編集モードかどうか。false のとき追加・削除ボタンと未選択モードを隠す。 */
  isEditing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
})

/**
 * グループに属する URL pattern 配列。
 */
const patterns = defineModel<string[]>({ required: true })

/**
 * パターンの一致結果を制限対象にするか、除外対象にするかを表すモード。
 */
const mode = defineModel<GroupMode>('mode', { required: true })

/**
 * ユーザーが編集した URL pattern 入力欄の index。
 */
const touchedPatternIndexes = ref<Set<number>>(new Set())

/**
 * 指定 index の URL pattern を touched として記録する。
 */
function markPatternTouched(index: number): void {
  touchedPatternIndexes.value = new Set(touchedPatternIndexes.value).add(index)
}

/**
 * 指定 index の URL pattern エラーを表示すべきならメッセージを返す。
 */
function visibleError(index: number): string | undefined {
  if (!touchedPatternIndexes.value.has(index)) return undefined
  return props.error(index)
}

/**
 * URL pattern を削除し、touched index を現在の配列に合わせて詰め直す。
 */
function deletePattern(index: number): void {
  patterns.value.splice(index, 1)
  const next = new Set<number>()
  for (const touchedIndex of touchedPatternIndexes.value) {
    if (touchedIndex < index) next.add(touchedIndex)
    if (touchedIndex > index) next.add(touchedIndex - 1)
  }
  touchedPatternIndexes.value = next
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-semibold">
        <CodeBracketIcon
          aria-hidden="true"
          class="size-4 text-muted"
        />
        URL patterns
      </h3>
      <div class="flex flex-wrap items-center gap-2">
        <fieldset
          aria-label="URL pattern mode"
          class="flex flex-wrap items-center gap-4"
        >
          <label
            v-if="isEditing || mode === 'blacklist'"
            class="inline-flex items-center gap-2 text-label-md text-secondary-foreground"
          >
            <input
              v-model="mode"
              type="radio"
              class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
              value="blacklist"
              :disabled="!isEditing"
            >
            <span>Block matches</span>
          </label>
          <label
            v-if="isEditing || mode === 'whitelist'"
            class="inline-flex items-center gap-2 text-label-md text-secondary-foreground"
          >
            <input
              v-model="mode"
              type="radio"
              class="size-4 border-border text-primary focus:ring-2 focus:ring-primary/30"
              value="whitelist"
              :disabled="!isEditing"
            >
            <span>Allow only matches</span>
          </label>
        </fieldset>
        <BaseButton
          v-if="isEditing"
          type="button"
          aria-label="Add URL pattern"
          size="sm"
          variant="ghost"
          @click="patterns.push('')"
        >
          <PlusIcon
            aria-hidden="true"
            class="size-4"
          />
          URL pattern
        </BaseButton>
      </div>
    </div>

    <div class="space-y-2">
      <EmptyState
        v-if="patterns.length === 0"
        aria-label="No URL patterns"
      >
        No URL patterns yet
      </EmptyState>
      <div
        v-for="(_, i) in patterns"
        :key="i"
        class="space-y-1"
      >
        <div class="flex min-w-0 gap-2">
          <BaseInput
            v-model="patterns[i]"
            aria-label="URL pattern"
            placeholder="example.com or ^https?://"
            class="flex-1"
            size="md"
            monospace
            :disabled="!isEditing"
            :display="isEditing ? 'editable' : 'readonly'"
            :invalid="Boolean(visibleError(i))"
            @input="markPatternTouched(i)"
          />
          <BaseButton
            v-if="isEditing"
            type="button"
            aria-label="Delete pattern"
            title="Delete"
            size="icon-md"
            variant="danger-ghost"
            @click="deletePattern(i)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </BaseButton>
        </div>
        <AlertMessage
          v-if="visibleError(i)"
        >
          {{ visibleError(i) }}
        </AlertMessage>
      </div>
    </div>
  </section>
</template>
