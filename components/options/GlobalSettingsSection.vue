<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  BellAlertIcon,
  DocumentTextIcon,
  EyeSlashIcon,
} from '@heroicons/vue/24/outline'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import type { GlobalSettings } from '@/utils/types'
import { setLanguage } from '@/utils/i18n'
import { setTheme } from '@/utils/theme'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  /** 編集された設定フィールドを親フォームへ伝える。 */
  touch: [field: string]
}>()

/**
 * Options 画面で編集するグローバル設定。
 */
const globalSettings = defineModel<GlobalSettings>({ required: true })
const importInput = ref<HTMLInputElement | null>(null)
const incognitoAccessAllowed = ref<boolean | undefined>()

const incognitoStatusText = computed(() => {
  if (incognitoAccessAllowed.value === true) return t('Enabled')
  if (incognitoAccessAllowed.value === false) return t('Disabled')
  return t('Unable to check')
})

/** 選択された言語を即座に適用し、Lock Modeとは独立して保存を要求する。 */
function changeLanguage(): void {
  setLanguage(globalSettings.value.language)
  emit('touch', 'language')
  emit('saveNow')
}

/** 選択されたテーマを即座に適用し、Lock Modeとは独立して保存を要求する。 */
function changeTheme(): void {
  setTheme(globalSettings.value.theme)
  emit('touch', 'theme')
  emit('saveNow')
}

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
  } catch {
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
        <h2 class="text-heading-md text-foreground">{{ t('General settings') }}</h2>
      </div>
    </div>

    <div class="space-y-4 rounded-lg border border-border bg-background p-4 shadow-sm">
      <BaseField :label="t('Language')" emphasis>
        <BaseSelect
          v-model="globalSettings.language"
          :aria-label="t('Language')"
          class="w-full"
          @change="changeLanguage"
        >
          <option value="auto">{{ t('Automatic (browser language)') }}</option>
          <option value="en">{{ t('English') }}</option>
          <option value="ja">{{ t('Japanese') }}</option>
        </BaseSelect>
      </BaseField>
      <BaseField :label="t('Theme')" emphasis>
        <BaseSelect
          v-model="globalSettings.theme"
          :aria-label="t('Theme')"
          class="w-full"
          @change="changeTheme"
        >
          <option value="auto">{{ t('Automatic (browser theme)') }}</option>
          <option value="light">{{ t('Light') }}</option>
          <option value="dark">{{ t('Dark') }}</option>
        </BaseSelect>
      </BaseField>
      <BaseField
        :label="t('Start a new rule day at this time')"
        emphasis
        :error="error('dailyResetHour')"
      >
        <template #icon>
          <ArrowPathIcon aria-hidden="true" class="size-4 text-muted" />
        </template>
        <BaseInput
          v-model="globalSettings.dailyResetHour"
          type="time"
          :aria-label="t('Start a new rule day at this time')"
          :disabled="dailyResetTimeLocked"
          class="w-full"
          :invalid="Boolean(error('dailyResetHour'))"
          @input="emit('touch', 'dailyResetHour')"
        />
        <p v-if="dailyResetTimeLocked" class="mt-1.5 text-body-sm text-muted">
          {{ t('Cannot change while any group has Lock Mode enabled or pending.') }}
        </p>
      </BaseField>

      <BaseField
        as="div"
        :label="t('Notification')"
        emphasis
        class="space-y-2"
        :aria-label="t('Notification')"
      >
        <template #icon>
          <BellAlertIcon aria-hidden="true" class="size-4 text-muted" />
        </template>
        <div class="space-y-3">
          <div class="space-y-2">
            <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 pl-7">
              <input
                id="remaining-time-notifications-enabled"
                v-model="globalSettings.remainingTimeNotificationsEnabled"
                type="checkbox"
                class="-ml-7 size-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                :aria-label="t('Notify me before the daily limit is reached')"
                @change="emit('touch', 'remainingTimeNotificationsEnabled')"
              />
              <label
                for="remaining-time-notifications-enabled"
                class="text-label-md text-secondary-foreground"
              >
                {{ t('Notify me') }}
              </label>
              <BaseField class="min-w-0" :error="error('notificationThresholdMinutes')">
                <NumberInput
                  v-model="globalSettings.notificationThresholdMinutes"
                  min="1"
                  step="1"
                  :aria-label="t('Minutes before daily limit warning')"
                  class="w-24"
                  :disabled="!globalSettings.remainingTimeNotificationsEnabled"
                  :invalid="Boolean(error('notificationThresholdMinutes'))"
                  @input="emit('touch', 'notificationThresholdMinutes')"
                />
              </BaseField>
              <span class="text-label-md text-secondary-foreground">{{
                t('min before the daily limit is reached')
              }}</span>
            </div>
          </div>
        </div>
      </BaseField>

      <BaseField
        as="div"
        :label="t('Allow this extension in Incognito')"
        emphasis
        :aria-label="t('Allow this extension in Incognito')"
      >
        <template #icon>
          <EyeSlashIcon aria-hidden="true" class="size-4 text-muted" />
        </template>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <p class="text-body-sm text-secondary-foreground">
            {{ t('Incognito access:') }}
            <span class="font-medium text-foreground">{{ incognitoStatusText }}</span>
          </p>
          <BaseButton
            variant="secondary"
            :aria-label="t('Open Chrome extension settings')"
            @click="openChromeExtensionSettings"
          >
            <ArrowTopRightOnSquareIcon aria-hidden="true" class="size-4" />
            {{ t('Open Chrome extension settings') }}
          </BaseButton>
        </div>
      </BaseField>

      <BaseField as="div" :label="t('Settings file')" emphasis>
        <template #icon>
          <DocumentTextIcon aria-hidden="true" class="size-4 text-muted" />
        </template>
        <div class="flex flex-wrap gap-2">
          <BaseButton
            variant="secondary"
            :aria-label="t('Export settings')"
            @click="emit('exportSettings')"
          >
            <ArrowDownTrayIcon aria-hidden="true" class="size-4" />
            {{ t('Export settings') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            :aria-label="t('Import settings')"
            @click="openImportFilePicker"
          >
            <ArrowUpTrayIcon aria-hidden="true" class="size-4" />
            {{ t('Import settings') }}
          </BaseButton>
          <input
            ref="importInput"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            :aria-label="t('Settings JSON file')"
            @change="handleImportFile"
          />
        </div>
        <p class="mt-2 text-body-sm text-muted">
          {{ t('Import replaces all groups and general settings.') }}
        </p>
        <AlertMessage v-if="importError" class="mt-2">
          {{ importError }}
        </AlertMessage>
      </BaseField>
    </div>
  </section>
</template>
