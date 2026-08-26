<script setup lang="ts">
import { CheckCircleIcon, CheckIcon, XCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, nextTick, ref, useId } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import {
  isDomainPattern,
  isValidRegex,
  isValidUrlPattern,
  urlPatternMatches,
} from '@/utils/urlPatterns'
import { VALIDATION_MESSAGES } from '@/utils/validation'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const titleId = useId()
const dialogRef = ref<InstanceType<typeof BaseDialog> | null>(null)
const patternInputRef = ref<InstanceType<typeof BaseInput> | null>(null)
const urlInputRef = ref<InstanceType<typeof BaseInput> | null>(null)
const draftPattern = ref('')
const testUrl = ref('')
let resolve: ((pattern: string | undefined) => void) | undefined

/** 入力済みの URL pattern に構文エラーがあるかどうか。 */
const hasPatternError = computed(
  () => draftPattern.value.length > 0 && !isValidUrlPattern(draftPattern.value),
)

/** 現在のパターンを元の編集行へ適用できるかどうか。 */
const canApply = computed(() => isValidUrlPattern(draftPattern.value))

/** 一致判定に必要な入力が揃っているかどうか。 */
const isReady = computed(() => canApply.value && testUrl.value.length > 0)

/** 実際のブロック対象判定と同じ仕様で pattern と URL が一致するかどうか。 */
const matches = computed(() =>
  isReady.value ? urlPatternMatches(draftPattern.value, testUrl.value) : false,
)

/** 入力中の値が実際にどの URL pattern 種別として扱われるかを返す。 */
const patternKind = computed<'empty' | 'domain' | 'regex' | 'invalid'>(() => {
  if (draftPattern.value.length === 0) return 'empty'
  if (isDomainPattern(draftPattern.value)) return 'domain'
  if (isValidRegex(draftPattern.value)) return 'regex'
  return 'invalid'
})

/**
 * 指定パターンを作業コピーとして tester を開く。
 * 適用時は修正後のパターン、キャンセル時は undefined を返す。
 */
function open(pattern: string): Promise<string | undefined> {
  draftPattern.value = pattern
  testUrl.value = ''
  dialogRef.value?.open()
  void nextTick(() => {
    if (canApply.value) urlInputRef.value?.focus()
    else patternInputRef.value?.focus()
  })
  return new Promise((res) => {
    resolve = res
  })
}

/** モーダル内の作業コピーを破棄して閉じる。 */
function cancel(): void {
  dialogRef.value?.close()
  resolve?.(undefined)
  resolve = undefined
}

/** 有効な作業コピーを呼び出し元へ返して閉じる。 */
function apply(): void {
  if (!canApply.value) return
  dialogRef.value?.close()
  resolve?.(draftPattern.value)
  resolve = undefined
}

defineExpose({ open })
</script>

<template>
  <BaseDialog
    ref="dialogRef"
    :aria-labelledby="titleId"
    class="w-[min(42rem,calc(100vw-2rem))] p-0"
    @cancel="cancel"
  >
    <div class="space-y-4 p-5">
      <div>
        <h2 :id="titleId" class="text-heading-md">
          {{ t('Test a URL pattern') }}
        </h2>
      </div>

      <div class="min-w-0 space-y-3">
        <BaseField
          :label="t('URL pattern')"
          emphasis
          :error="hasPatternError ? VALIDATION_MESSAGES.urlPattern : undefined"
        >
          <BaseInput
            ref="patternInputRef"
            v-model="draftPattern"
            :aria-label="t('Test URL pattern')"
            placeholder="example.com"
            class="w-full"
            monospace
            :invalid="hasPatternError"
          />
          <span
            v-if="patternKind === 'domain' || patternKind === 'regex'"
            class="mt-1.5 inline-flex rounded-sm border border-border bg-surface-subtle px-1.5 py-1 text-label-sm text-secondary-foreground"
          >
            {{ patternKind === 'domain' ? t('Domain') : t('Regular expression') }}
          </span>
        </BaseField>

        <BaseField :label="t('URL')" emphasis>
          <BaseInput
            ref="urlInputRef"
            v-model="testUrl"
            :aria-label="t('Test URL')"
            placeholder="https://example.com/"
            class="w-full"
            monospace
          />
        </BaseField>
      </div>

      <p
        v-if="draftPattern.length === 0 || testUrl.length === 0"
        class="rounded-lg border border-border bg-surface-muted p-3 text-body-md text-muted-foreground"
      >
        {{ t('Enter a URL pattern and URL to see whether they match.') }}
      </p>
      <div
        v-else-if="isReady"
        role="status"
        aria-live="polite"
        class="flex items-center gap-2 rounded-lg border p-3 text-label-md"
        :class="
          matches
            ? 'border-primary/30 bg-accent text-primary'
            : 'border-border bg-surface-subtle text-secondary-foreground'
        "
      >
        <CheckCircleIcon v-if="matches" aria-hidden="true" class="size-5 shrink-0" />
        <XCircleIcon v-else aria-hidden="true" class="size-5 shrink-0" />
        {{ matches ? t('Match') : t('No match') }}
      </div>

      <details class="rounded-lg border border-border bg-background">
        <summary
          class="cursor-pointer px-3 py-2 text-label-md text-secondary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {{ t('Regular expression quick reference') }}
        </summary>
        <div class="border-t border-border p-3">
          <dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-body-sm">
            <dt class="font-mono text-input-foreground">^</dt>
            <dd class="text-muted-foreground">{{ t('Start of the URL') }}</dd>
            <dt class="font-mono text-input-foreground">$</dt>
            <dd class="text-muted-foreground">{{ t('End of the URL') }}</dd>
            <dt class="font-mono text-input-foreground">\.</dt>
            <dd class="text-muted-foreground">{{ t('A literal period') }}</dd>
            <dt class="font-mono text-input-foreground">.*</dt>
            <dd class="text-muted-foreground">{{ t('Any sequence of characters') }}</dd>
            <dt class="font-mono text-input-foreground">(a|b)</dt>
            <dd class="text-muted-foreground">{{ t('Either a or b') }}</dd>
            <dt class="font-mono text-input-foreground">?</dt>
            <dd class="text-muted-foreground">{{ t('The previous item is optional') }}</dd>
          </dl>
          <div class="mt-3 space-y-1 border-t border-border pt-3 text-body-sm">
            <p class="text-muted-foreground">{{ t('Example: only a specific path') }}</p>
            <code class="block break-all font-mono text-input-foreground"
              >^https?://(www\.)?example\.com/private</code
            >
          </div>
        </div>
      </details>

      <div class="flex flex-wrap justify-end gap-2 pt-1">
        <BaseButton type="button" :aria-label="t('Cancel pattern test')" @click="cancel">
          <XMarkIcon aria-hidden="true" class="size-4" />
          {{ t('Cancel') }}
        </BaseButton>
        <BaseButton
          type="button"
          variant="primary"
          :aria-label="t('Apply pattern')"
          :disabled="!canApply"
          @click="apply"
        >
          <CheckIcon aria-hidden="true" class="size-4" />
          {{ t('Apply pattern') }}
        </BaseButton>
      </div>
    </div>
  </BaseDialog>
</template>
