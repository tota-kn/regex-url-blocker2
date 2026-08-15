<script setup lang="ts">
import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ShieldExclamationIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseTooltip from '@/components/ui/BaseTooltip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { createDefaultRule } from '@/utils/defaults'
import {
  describeRuleConflicts,
  EVALUATION_ORDER_NOTE,
  EVALUATION_ORDER_STEPS,
  formatRule,
} from '@/utils/rules'
import type { GlobalSettings, Rule } from '@/utils/types'
import RuleRowEditor from './RuleRowEditor.vue'
import RuleSectionHeader from './RuleSectionHeader.vue'

/**
 * Rule 一覧を編集するコンポーネントの props。
 */
interface Props {
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
  /** 重なり判定に使うグローバル設定。 */
  global: GlobalSettings
  /** 重なり判定の基準時刻。 */
  now: Date
  /** ルール一覧全体のバリデーションエラー。 */
  sectionError?: string
  /** 指定ルールのバリデーションエラーメッセージを返す関数。 */
  error?: (index: number) => string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
  error: () => undefined,
})

const emit = defineEmits<{
  /** 編集したフィールドを親フォームへ伝える。 */ touch: [field: string]
  /** テキスト入力が保存可能かどうかを親フォームへ伝える。 */
  'validity-change': [field: string, valid: boolean]
}>()

const rules = defineModel<Rule[]>({ required: true })

const conflicts = computed(() => describeRuleConflicts(rules.value, props.now, props.global))

/** 新しいルールを追加する。並べ替えは保存時に行うため、ここでは末尾に足す。 */
function addRule(): void {
  emit('touch', 'rules')
  rules.value = [...rules.value, createDefaultRule('block')]
}

/** 指定位置のルールを削除する。 */
function removeRule(index: number): void {
  emit('touch', 'rules')
  rules.value = rules.value.filter((_, i) => i !== index)
}
</script>

<template>
  <section class="min-w-0 space-y-3">
    <RuleSectionHeader title="Rules">
      <template #icon>
        <ShieldExclamationIcon aria-hidden="true" class="size-4 text-muted" />
      </template>
      <BaseTooltip label="How overlapping rules are applied">
        <span class="block text-label-sm text-muted-foreground">
          WHEN SEVERAL RULES ARE ACTIVE AT ONCE
        </span>
        <ol class="mt-1.5 space-y-1">
          <li v-for="(step, index) in EVALUATION_ORDER_STEPS" :key="step.kind">
            <span class="text-label-md text-secondary-foreground">
              {{ index + 1 }}. {{ step.label }}
            </span>
            <span class="text-muted-foreground"> — {{ step.detail }}</span>
          </li>
        </ol>
        <span class="mt-2 block text-muted-foreground">{{ EVALUATION_ORDER_NOTE }}</span>
      </BaseTooltip>
    </RuleSectionHeader>

    <EmptyState v-if="rules.length === 0">
      No rules yet. This group does nothing until you add one.
    </EmptyState>

    <ol v-else class="space-y-2" aria-label="Rules">
      <li
        v-for="(rule, index) in rules"
        :key="rule.id"
        class="min-w-0 rounded-lg border border-border bg-surface p-3"
      >
        <div v-if="isEditing" class="flex min-w-0 items-start gap-2">
          <RuleRowEditor
            v-model="rules[index]"
            :index="index"
            :error="props.error(index)"
            class="min-w-0 flex-1"
            @touch="(field) => emit('touch', `rules[${index}].${field}`)"
            @validity-change="
              (field, valid) => emit('validity-change', `rules[${index}].${field}`, valid)
            "
          />
          <BaseButton
            type="button"
            variant="danger-ghost"
            size="icon-sm"
            :aria-label="`Remove rule ${index + 1}`"
            @click="removeRule(index)"
          >
            <TrashIcon aria-hidden="true" class="size-4" />
          </BaseButton>
        </div>

        <p
          v-else
          :aria-label="`Rule ${index + 1}`"
          class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body-md text-input-foreground"
        >
          <span class="font-mono text-secondary-foreground">{{ formatRule(rule).when }}</span>
          <ArrowRightIcon aria-hidden="true" class="size-4 shrink-0 text-muted" />
          <span>{{ formatRule(rule).what }}</span>
          <span v-if="formatRule(rule).destination" class="text-body-sm text-muted-foreground">
            → {{ formatRule(rule).destination }}
          </span>
        </p>
      </li>
    </ol>

    <BaseButton
      v-if="isEditing"
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Add rule"
      @click="addRule"
    >
      <PlusIcon aria-hidden="true" class="size-4" />
      Rule
    </BaseButton>

    <AlertMessage v-if="sectionError">{{ sectionError }}</AlertMessage>

    <div
      v-for="message in conflicts"
      :key="message"
      class="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning-text"
      role="status"
    >
      <ExclamationTriangleIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
      <span>{{ message }}</span>
    </div>
  </section>
</template>
