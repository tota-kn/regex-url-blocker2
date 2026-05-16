<script setup lang="ts">
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, ArrowUpTrayIcon, BellAlertIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
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
  /** インポートに失敗したときのエラーメッセージ。 */
  importError?: string
}

defineProps<Props>()

const emit = defineEmits<{
  /** 即時保存したいグローバル設定変更を親へ通知する。 */
  saveNow: []
  /** 現在の設定をエクスポートしたいことを親へ通知する。 */
  exportSettings: []
  /** 選択された設定ファイルをインポートしたいことを親へ通知する。 */
  importSettings: [file: File]
}>()

/**
 * Options 画面で編集するグローバル設定。
 */
const globalSettings = defineModel<GlobalSettings>({ required: true })
const importInput = ref<HTMLInputElement | null>(null)

const notificationThresholdInput = computed({
  get: () => Number.isFinite(globalSettings.value.notificationThresholdMinutes) ? String(globalSettings.value.notificationThresholdMinutes) : '',
  set: (value: string | number | undefined) => {
    const text = String(value ?? '')
    globalSettings.value.notificationThresholdMinutes = text === '' ? Number.NaN : Number(text)
  },
})

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

/**
 * 設定ファイル選択ダイアログを開く。
 */
function openImportFilePicker(): void {
  importInput.value?.click()
}

/**
 * 選択された JSON ファイルを親へ渡す。
 */
function handleImportFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('importSettings', file)
  input.value = ''
}
</script>

<template>
  <section class="space-y-3 lg:sticky lg:top-6">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-heading-md text-foreground">
        General settings
      </h2>
    </div>

    <div class="space-y-4 rounded-lg border border-border bg-background p-4 shadow-sm">
      <div>
        <span class="mb-1.5 flex items-center gap-1.5 text-label-md text-secondary-foreground">
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

      <BaseField
        label="Remaining time notification"
        :error="error('notificationThresholdMinutes')"
      >
        <template #icon>
          <BellAlertIcon
            aria-hidden="true"
            class="size-4 text-muted"
          />
        </template>
        <BaseInput
          v-model="notificationThresholdInput"
          type="number"
          min="0"
          step="1"
          aria-label="Remaining time notification"
          class="w-full"
          :invalid="Boolean(error('notificationThresholdMinutes'))"
        />
        <p class="mt-1.5 text-body-sm text-muted">
          Notify when the remaining daily browsing time reaches this many minutes. 0 disables notifications.
        </p>
      </BaseField>

      <div class="border-t border-border pt-4">
        <p class="mb-2 text-label-md text-secondary-foreground">
          Settings file
        </p>
        <div class="flex flex-wrap gap-2">
          <BaseButton
            variant="secondary"
            aria-label="Export settings"
            @click="emit('exportSettings')"
          >
            <ArrowDownTrayIcon
              aria-hidden="true"
              class="size-4"
            />
            Export settings
          </BaseButton>
          <BaseButton
            variant="secondary"
            aria-label="Import settings"
            @click="openImportFilePicker"
          >
            <ArrowUpTrayIcon
              aria-hidden="true"
              class="size-4"
            />
            Import settings
          </BaseButton>
          <input
            ref="importInput"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            aria-label="Settings JSON file"
            @change="handleImportFile"
          >
        </div>
        <p class="mt-2 text-body-sm text-muted">
          Import replaces all groups and general settings.
        </p>
        <AlertMessage
          v-if="importError"
          class="mt-2"
        >
          {{ importError }}
        </AlertMessage>
      </div>
    </div>
  </section>
</template>
