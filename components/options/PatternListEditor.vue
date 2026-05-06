<script setup lang="ts">
import { CheckCircleIcon, CodeBracketIcon, NoSymbolIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import type { GroupMode } from '@/utils/types'

/**
 * 正規表現パターン編集コンポーネントの props。
 */
interface Props {
  /** 指定パターン番号のエラーメッセージを返す関数。 */
  error: (index: number) => string | undefined
  /** 編集モードかどうか。false のとき追加・削除ボタンと未選択モードを隠す。 */
  isEditing?: boolean
}

withDefaults(defineProps<Props>(), {
  isEditing: true,
})

/**
 * グループに属する正規表現パターン配列。
 */
const patterns = defineModel<string[]>({ required: true })

/**
 * パターンの一致結果を制限対象にするか、除外対象にするかを表すモード。
 */
const mode = defineModel<GroupMode>('mode', { required: true })

const MODE_OPTIONS = [
  { value: 'blacklist', label: 'Block matches', icon: NoSymbolIcon },
  { value: 'whitelist', label: 'Allow only matches', icon: CheckCircleIcon },
]
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
        <SegmentedControl
          :model-value="mode"
          :options="MODE_OPTIONS"
          :editable="isEditing"
          show-selected-only
          @update:model-value="mode = $event as GroupMode"
        />
        <BaseButton
          v-if="isEditing"
          type="button"
          aria-label="Add URL pattern"
          size="sm"
          variant="ghost"
          @click="patterns.push('https?://')"
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
            aria-label="URL regex pattern"
            placeholder="https?://"
            class="flex-1"
            size="md"
            monospace
            :disabled="!isEditing"
            :display="isEditing ? 'editable' : 'readonly'"
            :invalid="Boolean(error(i))"
          />
          <BaseButton
            v-if="isEditing"
            type="button"
            aria-label="Delete pattern"
            title="Delete"
            size="icon-md"
            variant="danger-ghost"
            @click="patterns.splice(i, 1)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </BaseButton>
        </div>
        <AlertMessage
          v-if="error(i)"
        >
          {{ error(i) }}
        </AlertMessage>
      </div>
    </div>
  </section>
</template>
