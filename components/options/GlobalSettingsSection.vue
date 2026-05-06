<script setup lang="ts">
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
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

const BLOCK_ACTION_OPTIONS = [
  { value: 'redirect', label: 'Redirect', icon: ArrowTopRightOnSquareIcon },
  { value: 'blockedPage', label: 'Blocked page', icon: DocumentTextIcon },
]

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
        <SegmentedControl
          :model-value="globalSettings.blockAction"
          :options="BLOCK_ACTION_OPTIONS"
          class="grid w-full grid-cols-2"
          @update:model-value="setBlockAction($event as BlockAction)"
        />
      </div>
      <AlertMessage
        v-if="error('blockAction')"
      >
        {{ error('blockAction') }}
      </AlertMessage>

      <BaseField
        v-if="globalSettings.blockAction === 'redirect'"
        label="Redirect URL"
        :error="error('redirectUrl')"
      >
        <template #icon>
          <ArrowTopRightOnSquareIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
        </template>
        <BaseInput
          v-model="globalSettings.redirectUrl"
          type="url"
          aria-label="Redirect URL"
          class="w-full"
          :invalid="Boolean(error('redirectUrl'))"
        />
      </BaseField>

      <BaseField
        label="Daily reset time"
        :error="error('dailyResetHour')"
      >
        <template #icon>
          <ArrowPathIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
        </template>
        <BaseInput
          v-model="globalSettings.dailyResetHour"
          type="time"
          aria-label="Daily reset time"
          class="w-full"
          :invalid="Boolean(error('dailyResetHour'))"
        />
      </BaseField>
    </div>
  </section>
</template>
