<script setup lang="ts">
import { ArrowDownTrayIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import {
  POLICY_BROWSERS,
  buildMacProfile,
  buildWindowsCommands,
  detectPolicyEnvironment,
  type PolicyNavigator,
  type PolicyOptions,
} from '@/utils/browserPolicy'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const detected = detectPolicyEnvironment(navigator as PolicyNavigator)
const os = ref(detected.os)
const browserId = ref(detected.browser)
const options = ref<PolicyOptions>({
  forceInstall: true,
  disableIncognito: true,
  disableGuest: true,
})
const optionLabels: Record<keyof PolicyOptions, string> = {
  forceInstall: 'Prevent uninstalling and disabling this extension',
  disableIncognito: 'Disable Incognito (InPrivate) windows',
  disableGuest: 'Disable guest mode',
}

const policyPage = computed(() => POLICY_BROWSERS[browserId.value].policyPage)
const windowsCommands = computed(() =>
  buildWindowsCommands(browserId.value, browser.runtime.id, options.value),
)

/** 表示中のコマンドをクリップボードへコピーする。 */
async function copy(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/** 選択中のブラウザ用の構成プロファイルをダウンロードする。 */
function downloadProfile(): void {
  const xml = buildMacProfile(browserId.value, browser.runtime.id, options.value)
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/x-apple-aspen-config' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `regex-url-guard-${browserId.value}.mobileconfig`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex min-h-9 items-center">
      <h2 class="text-heading-md text-foreground">{{ t('Browser lockdown') }}</h2>
    </div>

    <div class="space-y-4 rounded-lg border border-border bg-background p-4 shadow-sm">
      <p class="text-body-sm text-secondary-foreground">
        {{
          t(
            'Use OS-level browser policies to keep this extension from being removed and to close common loopholes. Anyone with administrator rights can undo these settings.',
          )
        }}
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <BaseField :label="t('Operating system')" emphasis>
          <BaseSelect v-model="os" :aria-label="t('Operating system')" class="w-full">
            <option value="windows">Windows</option>
            <option value="mac">macOS</option>
          </BaseSelect>
        </BaseField>
        <BaseField :label="t('Browser')" emphasis>
          <BaseSelect v-model="browserId" :aria-label="t('Browser')" class="w-full">
            <option v-for="(info, id) in POLICY_BROWSERS" :key="id" :value="id">
              {{ info.label }}
            </option>
          </BaseSelect>
        </BaseField>
      </div>

      <fieldset class="space-y-2">
        <legend class="mb-1.5 text-label-md font-semibold text-secondary-foreground">
          {{ t('Policies to apply') }}
        </legend>
        <label
          v-for="(label, key) in optionLabels"
          :key="key"
          class="flex items-center gap-2 text-label-md text-secondary-foreground"
        >
          <input
            v-model="options[key]"
            type="checkbox"
            class="size-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
          />
          {{ t(label) }}
        </label>
      </fieldset>

      <p
        v-if="browserId === 'edge' && options.forceInstall"
        class="text-body-sm text-muted-foreground"
      >
        {{
          t(
            'Unless the device is joined to a domain or enrolled in MDM, Edge force-installs only extensions from the Edge Add-ons store, so this setting has no effect.',
          )
        }}
      </p>

      <template v-if="os === 'windows'">
        <ol class="list-decimal space-y-1 pl-5 text-body-sm text-secondary-foreground">
          <li>{{ t('Open Command Prompt as administrator.') }}</li>
          <li>{{ t('Paste and run the commands below.') }}</li>
          <li>{{ t('Restart the browser and check {page}.', { page: policyPage }) }}</li>
        </ol>
        <BaseField as="div" :label="t('Commands to apply')" emphasis>
          <pre
            :aria-label="t('Commands to apply')"
            class="overflow-x-auto rounded-lg border border-border bg-surface-muted p-3 font-mono text-body-sm"
            >{{ windowsCommands.apply }}</pre>
          <BaseButton
            variant="secondary"
            class="mt-2"
            :disabled="!windowsCommands.apply"
            @click="copy(windowsCommands.apply)"
          >
            <ClipboardDocumentIcon aria-hidden="true" class="size-4" />
            {{ t('Copy') }}
          </BaseButton>
          <p v-if="options.forceInstall" class="mt-2 text-body-sm text-muted-foreground">
            {{
              t(
                'If ExtensionInstallForcelist already has entries, change /v 1 to the same unused number in both the apply and undo commands so they are not overwritten.',
              )
            }}
          </p>
        </BaseField>
        <BaseField as="div" :label="t('Commands to undo')" emphasis>
          <pre
            :aria-label="t('Commands to undo')"
            class="overflow-x-auto rounded-lg border border-border bg-surface-muted p-3 font-mono text-body-sm"
            >{{ windowsCommands.undo }}</pre>
        </BaseField>
      </template>

      <template v-else>
        <ol class="list-decimal space-y-1 pl-5 text-body-sm text-secondary-foreground">
          <li>{{ t('Download the configuration profile and open it.') }}</li>
          <li>
            {{
              t(
                'In System Settings, go to General > Device Management (or Privacy & Security > Profiles) and install it.',
              )
            }}
          </li>
          <li>{{ t('Restart the browser and check {page}.', { page: policyPage }) }}</li>
        </ol>
        <BaseButton variant="secondary" @click="downloadProfile">
          <ArrowDownTrayIcon aria-hidden="true" class="size-4" />
          {{ t('Download profile') }}
        </BaseButton>
        <p class="text-body-sm text-muted-foreground">
          {{ t('To undo, remove the profile in the same System Settings screen.') }}
        </p>
      </template>
    </div>
  </section>
</template>
