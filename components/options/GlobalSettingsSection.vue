<script setup lang="ts">
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, ArrowUpTrayIcon, BellAlertIcon, DocumentTextIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import GlobalSettingsItemTitle from '@/components/options/GlobalSettingsItemTitle.vue'
import type { GlobalSettings } from '@/utils/types'

/**
 * グローバル設定セクションの props。
 */
interface Props {
  /** 指定フィールドのエラーメッセージを返す関数。 */
  error: (field: string) => string | undefined
  /** インポートに失敗したときのエラーメッセージ。 */
  importError?: string
  /** Lock Mode group により rule day の開始時刻を変更できないかどうか。 */
  dailyResetTimeLocked?: boolean
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
const incognitoAccessAllowed = ref<boolean | undefined>()

const notificationThresholdInput = computed({
  get: () => Number.isFinite(globalSettings.value.notificationThresholdMinutes) ? String(globalSettings.value.notificationThresholdMinutes) : '',
  set: (value: string | number | undefined) => {
    const text = String(value ?? '')
    globalSettings.value.notificationThresholdMinutes = text === '' ? Number.NaN : Number(text)
  },
})

const incognitoStatusText = computed(() => {
  if (incognitoAccessAllowed.value === true) return 'Enabled'
  if (incognitoAccessAllowed.value === false) return 'Disabled'
  return 'Unable to check'
})

/**
 * Chrome の拡張機能詳細ページ URL を生成する。
 */
function getChromeExtensionSettingsUrl(): string {
  return `chrome://extensions/?id=${browser.runtime.id}`
}

/**
 * Chrome のシークレットモード許可状態を再取得する。
 */
async function refreshIncognitoAccess(): Promise<void> {
  try {
    incognitoAccessAllowed.value = await browser.extension.isAllowedIncognitoAccess()
  }
  catch {
    incognitoAccessAllowed.value = undefined
  }
}

/**
 * Options 画面が再表示されたときにシークレットモード許可状態を再取得する。
 */
function refreshIncognitoAccessWhenVisible(): void {
  if (document.visibilityState === 'visible') {
    void refreshIncognitoAccess()
  }
}

/**
 * Chrome の拡張機能詳細ページを新しいタブで開く。
 */
async function openChromeExtensionSettings(): Promise<void> {
  await browser.tabs.create({ url: getChromeExtensionSettingsUrl() })
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

onMounted(() => {
  void refreshIncognitoAccess()
  document.addEventListener('visibilitychange', refreshIncognitoAccessWhenVisible)
  window.addEventListener('focus', refreshIncognitoAccess)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshIncognitoAccessWhenVisible)
  window.removeEventListener('focus', refreshIncognitoAccess)
})
</script>

<template>
  <section class="space-y-3 lg:sticky lg:top-6">
    <div class="flex min-h-9 items-center justify-between gap-3">
      <div class="flex min-w-0 items-baseline gap-2">
        <h2 class="text-heading-md text-foreground">
          General settings
        </h2>
      </div>
    </div>

    <div class="space-y-4 rounded-lg border border-border bg-background p-4 shadow-sm">
      <BaseField
        :error="error('dailyResetHour')"
      >
        <GlobalSettingsItemTitle label="Start a new rule day at this time">
          <template #icon>
            <ArrowPathIcon
              aria-hidden="true"
              class="size-4 text-muted"
            />
          </template>
        </GlobalSettingsItemTitle>
        <BaseInput
          v-model="globalSettings.dailyResetHour"
          type="time"
          aria-label="Start a new rule day at this time"
          :disabled="dailyResetTimeLocked"
          class="w-full"
          :invalid="Boolean(error('dailyResetHour'))"
        />
        <p
          v-if="dailyResetTimeLocked"
          class="mt-1.5 text-body-sm text-muted"
        >
          Cannot change while any group has Lock Mode enabled or pending.
        </p>
      </BaseField>

      <div
        class="space-y-2"
        aria-label="Notification"
      >
        <GlobalSettingsItemTitle label="Notification">
          <template #icon>
            <BellAlertIcon
              aria-hidden="true"
              class="size-4 text-muted"
            />
          </template>
        </GlobalSettingsItemTitle>
        <div class="space-y-3">
          <label class="flex items-start gap-3">
            <input
              v-model="globalSettings.remainingTimeNotificationsEnabled"
              type="checkbox"
              class="mt-0.5 size-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
              aria-label="Notify me when daily limit time is almost used up"
            >
            <span class="min-w-0">
              <span class="block text-label-md text-secondary-foreground">Notify me when daily limit time is almost used up</span>
            </span>
          </label>
          <BaseField
            label="Minutes left before warning"
            :error="error('notificationThresholdMinutes')"
          >
            <BaseInput
              v-model="notificationThresholdInput"
              type="number"
              min="1"
              step="1"
              aria-label="Minutes left before warning"
              class="w-full"
              :disabled="!globalSettings.remainingTimeNotificationsEnabled"
              :invalid="Boolean(error('notificationThresholdMinutes'))"
            />
          </BaseField>
        </div>
        <label class="flex items-start gap-3">
          <input
            v-model="globalSettings.pageOpenNotificationsEnabled"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
            aria-label="Notify me when I open a page with a daily limit"
          >
          <span class="min-w-0">
            <span class="block text-label-md text-secondary-foreground">Notify me when I open a page with a daily limit</span>
          </span>
        </label>
        <label class="flex items-start gap-3">
          <input
            v-model="globalSettings.blockNotificationsEnabled"
            type="checkbox"
            class="mt-0.5 size-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
            aria-label="Notify me when a redirect block happens"
          >
          <span class="min-w-0">
            <span class="block text-label-md text-secondary-foreground">Notify me when a redirect block happens</span>
          </span>
        </label>
      </div>

      <div aria-label="Allow this extension in Incognito">
        <GlobalSettingsItemTitle label="Allow this extension in Incognito">
          <template #icon>
            <EyeSlashIcon
              aria-hidden="true"
              class="size-4 text-muted"
            />
          </template>
        </GlobalSettingsItemTitle>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <p class="text-body-sm text-secondary-foreground">
            Incognito access:
            <span class="font-medium text-foreground">{{ incognitoStatusText }}</span>
          </p>
          <BaseButton
            variant="secondary"
            aria-label="Open Chrome extension settings"
            @click="openChromeExtensionSettings"
          >
            <ArrowTopRightOnSquareIcon
              aria-hidden="true"
              class="size-4"
            />
            Open Chrome extension settings
          </BaseButton>
        </div>
      </div>

      <div>
        <GlobalSettingsItemTitle label="Settings file">
          <template #icon>
            <DocumentTextIcon
              aria-hidden="true"
              class="size-4 text-muted"
            />
          </template>
        </GlobalSettingsItemTitle>
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
