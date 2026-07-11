<script setup lang="ts">
import { PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { createDefaultRestriction } from '@/utils/defaults'
import { formatRestriction } from '@/utils/groups'
import type { RestrictionRule } from '@/utils/types'
import RestrictionEditor from './RestrictionEditor.vue'
import ScheduleWindowEditor from './ScheduleWindowEditor.vue'

/**
 * 複数の制限ルールを編集するコンポーネントの props。
 */
interface Props {
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
  /** 指定フィールドのバリデーションエラーメッセージを返す関数。 */
  error?: (index: number, field: 'graceMinutes' | 'waitSeconds' | 'condition' | 'timeRanges') => string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
  error: () => undefined,
})

const restrictionRules = defineModel<RestrictionRule[]>({ required: true })

/** 新しい制限ルールを追加する。 */
function addRule(): void {
  restrictionRules.value = [
    ...restrictionRules.value,
    createDefaultRestriction('block'),
  ]
}

/** 指定位置の制限ルールを削除する。 */
function removeRule(index: number): void {
  restrictionRules.value = restrictionRules.value.filter((_, i) => i !== index)
}
</script>

<template>
  <section class="min-w-0 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-label-md">
        Restriction rules
      </h3>
      <BaseButton
        v-if="isEditing"
        type="button"
        size="sm"
        aria-label="Add restriction rule"
        @click="addRule"
      >
        <PlusIcon
          aria-hidden="true"
          class="size-4"
        />
        Add rule
      </BaseButton>
    </div>

    <EmptyState
      v-if="restrictionRules.length === 0"
      aria-label="No restriction rules"
    >
      No restriction rules.
    </EmptyState>

    <ol
      v-else
      class="space-y-3"
      aria-label="Restriction rules"
    >
      <li
        v-for="(rule, index) in restrictionRules"
        :key="index"
        class="space-y-3 rounded-lg border border-border bg-surface p-3"
      >
        <div class="flex min-w-0 items-center justify-between gap-2">
          <h4 class="text-label-md">
            Rule {{ index + 1 }}
          </h4>
          <BaseButton
            v-if="isEditing"
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="`Remove restriction rule ${index + 1}`"
            @click="removeRule(index)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </BaseButton>
        </div>

        <template v-if="isEditing">
          <ScheduleWindowEditor
            :condition="rule.condition"
            :time-ranges="rule.timeRanges"
            :is-editing="isEditing"
            @update:condition="rule.condition = $event"
            @update:time-ranges="rule.timeRanges = $event"
          />

          <RestrictionEditor
            v-model="restrictionRules[index]"
            :is-editing="isEditing"
            :error="field => props.error(index, field)"
          />
        </template>

        <output
          v-else
          :aria-label="`Restriction rule ${index + 1}`"
          class="block text-body-md text-input-foreground"
        >
          {{ formatRestriction(rule) }}
        </output>
      </li>
    </ol>
  </section>
</template>
