<script setup lang="ts">
import { CodeBracketIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { ref } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import RuleSectionHeader from './RuleSectionHeader.vue'

/**
 * URL pattern 編集コンポーネントの props。
 */
interface Props {
  /** URL pattern 一覧全体のエラーメッセージ。 */
  sectionError?: string
  /** 指定パターン番号のエラーメッセージを返す関数。 */
  error: (index: number) => string | undefined
  /** 編集モードかどうか。false のとき追加・削除ボタンと未選択モードを隠す。 */
  isEditing?: boolean
}

const emit = defineEmits<{
  /** 入力されたフィールドを親フォームへ伝える。 */ touch: [field: string]
}>()

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
})

/**
 * グループに属する URL pattern 配列。
 */
const patterns = defineModel<string[]>({ required: true })

/**
 * ユーザーが編集した URL pattern 入力欄の index。
 */
const touchedPatternIndexes = ref<Set<number>>(new Set())

/**
 * 指定 index の URL pattern を touched として記録する。
 */
function markPatternTouched(index: number): void {
  touchedPatternIndexes.value = new Set(touchedPatternIndexes.value).add(index)
  emit('touch', `patterns[${index}]`)
}

/**
 * 指定 index の URL pattern エラーを表示すべきならメッセージを返す。
 */
function visibleError(index: number): string | undefined {
  return props.error(index)
}

/**
 * URL pattern を削除し、touched index を現在の配列に合わせて詰め直す。
 */
function deletePattern(index: number): void {
  emit('touch', 'patterns')
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
    <RuleSectionHeader title="URL patterns">
      <template #icon>
        <CodeBracketIcon aria-hidden="true" class="size-4 text-muted" />
      </template>
    </RuleSectionHeader>

    <div :class="isEditing ? 'space-y-2' : 'space-y-1'">
      <div v-for="(_, i) in patterns" :key="i" class="space-y-1">
        <div v-if="isEditing" class="flex min-w-0 gap-2">
          <BaseInput
            v-model="patterns[i]"
            aria-label="URL pattern"
            placeholder="example.com or ^https?://(www\.)?example\.com/private"
            class="flex-1"
            size="md"
            monospace
            :invalid="Boolean(visibleError(i))"
            @input="markPatternTouched(i)"
          />
          <BaseButton
            type="button"
            aria-label="Delete pattern"
            title="Delete"
            size="icon-md"
            variant="danger-ghost"
            @click="deletePattern(i)"
          >
            <TrashIcon aria-hidden="true" class="size-4" />
          </BaseButton>
        </div>
        <p v-else class="text-mono-md break-all text-input-foreground">
          {{ patterns[i] }}
        </p>
        <AlertMessage v-if="visibleError(i)">
          {{ visibleError(i) }}
        </AlertMessage>
      </div>
      <BaseButton
        v-if="isEditing"
        type="button"
        aria-label="Add URL pattern"
        size="sm"
        variant="ghost"
        @click="
          () => {
            patterns.push('')
            emit('touch', 'patterns')
          }
        "
      >
        <PlusIcon aria-hidden="true" class="size-4" />
        URL pattern
      </BaseButton>
      <AlertMessage v-if="sectionError">
        {{ sectionError }}
      </AlertMessage>
    </div>
  </section>
</template>
