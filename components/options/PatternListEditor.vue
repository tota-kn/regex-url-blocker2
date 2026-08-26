<script setup lang="ts">
import { BeakerIcon, CodeBracketIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { ref } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import PatternTesterDialog from './PatternTesterDialog.vue'
import RuleSectionHeader from './RuleSectionHeader.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
const testerDialogRef = ref<InstanceType<typeof PatternTesterDialog> | null>(null)

function markPatternTouched(index: number): void {
  emit('touch', `patterns[${index}]`)
}

/**
 * 指定 index の URL pattern エラーを表示すべきならメッセージを返す。
 */
function visibleError(index: number): string | undefined {
  return props.error(index)
}

/** 指定パターンを tester で開き、適用された値を編集行へ反映する。 */
async function testPattern(index: number): Promise<void> {
  const nextPattern = await testerDialogRef.value?.open(patterns.value[index] ?? '')
  if (nextPattern === undefined) return
  patterns.value[index] = nextPattern
  markPatternTouched(index)
}

/**
 * URL pattern を削除する。
 */
function deletePattern(index: number): void {
  emit('touch', 'patterns')
  patterns.value.splice(index, 1)
}
</script>

<template>
  <section class="space-y-3">
    <PatternTesterDialog v-if="isEditing" ref="testerDialogRef" />
    <RuleSectionHeader :title="t('URL patterns')">
      <template #icon>
        <CodeBracketIcon aria-hidden="true" class="size-4 text-muted" />
      </template>
    </RuleSectionHeader>

    <div :class="isEditing ? 'space-y-2' : 'space-y-1'">
      <div v-for="(_, i) in patterns" :key="i" class="space-y-1">
        <div v-if="isEditing" class="flex min-w-0 gap-2">
          <BaseInput
            v-model="patterns[i]"
            :aria-label="t('URL pattern')"
            placeholder="example.com or ^https?://(www\.)?example\.com/private"
            class="flex-1"
            size="md"
            monospace
            :invalid="Boolean(visibleError(i))"
            @input="markPatternTouched(i)"
          />
          <BaseButton
            type="button"
            :aria-label="t('Test pattern {number}', { number: i + 1 })"
            :title="t('Test pattern')"
            size="icon-md"
            variant="ghost"
            @click="testPattern(i)"
          >
            <BeakerIcon aria-hidden="true" class="size-4" />
          </BaseButton>
          <BaseButton
            type="button"
            :aria-label="t('Delete pattern')"
            :title="t('Delete')"
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
        :aria-label="t('Add URL pattern')"
        size="sm"
        variant="ghost"
        @click="() => patterns.push('')"
      >
        <PlusIcon aria-hidden="true" class="size-4" />
        {{ t('URL pattern') }}
      </BaseButton>
      <AlertMessage v-if="sectionError">
        {{ sectionError }}
      </AlertMessage>
    </div>
  </section>
</template>
