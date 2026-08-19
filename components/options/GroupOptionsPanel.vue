<script setup lang="ts">
import { ChevronDownIcon, ClockIcon, LockClosedIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import BooleanRadioGroup from '@/components/ui/BooleanRadioGroup.vue'
import type { Group } from '@/utils/types'
import { useLockModePending } from '@/utils/useLockModePending'
import PendingFieldNote from './PendingFieldNote.vue'
import PauseDurationField from './PauseDurationField.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** グループOptionsパネルのprops。 */
interface Props {
  /** 保存済みgroup。 */
  group: Group
  /** 編集中ならtrue。 */
  isEditing: boolean
  /** Lock Modeの基準group。 */
  effectiveGroup?: Group
  /** 保留値が適用される日時。 */
  appliesAfterLabel?: string
  /** 指定フィールドの検証エラー。 */
  error: (field: string) => string | undefined
}

/** Optionsパネルが通知するイベント。 */
interface Emits {
  /** 編集したフィールドを親へ通知する。 */
  touch: [field: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const draft = defineModel<Group>({ required: true })
const isOpen = ref(false)
const comparedGroup = computed(() => (props.isEditing ? draft.value : props.group))
const { resolvedGroup, pendingUntilLabel, isFieldPending } = useLockModePending(
  () => props.effectiveGroup,
  comparedGroup,
  () => props.appliesAfterLabel,
)

/** 現在有効なPause待機秒数。 */
const effectivePauseWaitSeconds = computed(() => resolvedGroup.value.pauseWaitSeconds)
/** 現在有効なPause継続分数。 */
const effectivePauseDurationMinutes = computed(() => resolvedGroup.value.pauseDurationMinutes)
/** Pause設定の保留内容。 */
const pendingPauseNote = computed(() => {
  const parts: string[] = []
  if (isFieldPending('pauseAllowed')) parts.push('not allowed')
  if (isFieldPending('pauseWaitSeconds')) {
    parts.push(`wait ${effectivePauseWaitSeconds.value} sec`)
  }
  if (isFieldPending('pauseDurationMinutes')) {
    parts.push(`pause for ${effectivePauseDurationMinutes.value} min`)
  }
  return parts.length > 0 ? `Still ${parts.join(', ')} ${pendingUntilLabel.value}.` : undefined
})
/** View Modeで常に読み取り表示するOptions設定。 */
const summaries = computed(() => {
  const result: Array<{ label: string; value: string; pending?: string }> = []
  const lockLabel = t('Delay relaxed restrictions until next rule day')
  result.push({
    label: lockLabel,
    value: props.group.lockMode ? t('On') : t('Off'),
    pending: isFieldPending('lockMode')
      ? t('Still on {until}.', { until: pendingUntilLabel.value })
      : undefined,
  })
  if (props.group.pauseAllowed === false) {
    result.push({ label: t('Pause'), value: t('Not allowed'), pending: pendingPauseNote.value })
  } else {
    result.push({
      label: t('Pause'),
      value: t('Wait {seconds} sec, pause for {minutes} min', {
        seconds: props.group.pauseWaitSeconds,
        minutes: props.group.pauseDurationMinutes,
      }),
      pending: pendingPauseNote.value,
    })
  }
  return result
})

/** disclosure panelのDOM id。 */
function panelId(): string {
  return `options-panel-${props.group.id}`
}
</script>

<template>
  <section class="space-y-3 px-4 pb-4">
    <h3 v-if="!isEditing" class="flex items-center gap-1.5 text-label-md">
      <LockClosedIcon aria-hidden="true" class="size-4 text-muted" />
      {{ t('Options') }}
    </h3>

    <template v-if="isEditing">
      <button
        type="button"
        class="flex w-full items-center gap-3 bg-transparent py-2.5 text-left text-label-md text-secondary-foreground transition hover:bg-field-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-expanded="isOpen"
        :aria-controls="panelId()"
        @click="isOpen = !isOpen"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <ChevronDownIcon
            aria-hidden="true"
            class="size-4 shrink-0 text-muted transition-transform"
            :class="isOpen ? 'rotate-0' : '-rotate-90'"
          />
          <span>{{ t('Options') }}</span>
        </span>
      </button>

      <div v-if="isOpen" :id="panelId()" class="divide-y divide-border">
        <fieldset :aria-label="t('Delay relaxed restrictions until next rule day')" class="py-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 items-start gap-2 text-secondary-foreground">
              <LockClosedIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <span class="text-label-md">{{
                  t('Delay relaxed restrictions until next rule day')
                }}</span>
                <p class="mt-1 text-body-sm text-muted">
                  {{
                    t(
                      'Stricter changes apply immediately. Relaxed restrictions take effect on the next rule day.',
                    )
                  }}
                </p>
              </div>
            </div>
            <BooleanRadioGroup
              v-model="draft.lockMode"
              :label="t('Delay relaxed restrictions until next rule day')"
            />
          </div>
          <PendingFieldNote v-if="isFieldPending('lockMode')">
            {{ t('Still on {until}.', { until: pendingUntilLabel }) }}
          </PendingFieldNote>
        </fieldset>

        <fieldset :aria-label="t('Pause settings')" class="py-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 items-start gap-2 text-secondary-foreground">
              <ClockIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <span class="text-label-md">{{ t('Pause') }}</span>
                <p class="mt-1 text-body-sm text-muted">
                  {{ t('Take a short break before temporarily disabling this group.') }}
                </p>
              </div>
            </div>
            <div class="flex flex-col gap-2 sm:items-end">
              <div class="flex flex-wrap items-center gap-4">
                <span class="text-label-md text-secondary-foreground">{{ t('Allow Pause') }}</span>
                <BooleanRadioGroup
                  v-model="draft.pauseAllowed"
                  :label="t('Allow Pause')"
                  on-first
                />
              </div>
              <PendingFieldNote v-if="isFieldPending('pauseAllowed')" class="sm:text-right">
                {{ t('Still not allowed {until}.', { until: pendingUntilLabel }) }}
              </PendingFieldNote>
              <div class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 sm:justify-end">
                <PauseDurationField
                  v-model="draft.pauseWaitSeconds"
                  :label="t('Wait')"
                  :unit="t('sec')"
                  :input-aria-label="t('Wait seconds before pausing')"
                  :min="0"
                  :disabled="!draft.pauseAllowed"
                  :error="error('pauseWaitSeconds')"
                  :pending="
                    isFieldPending('pauseWaitSeconds')
                      ? t('Still {value} sec {until}.', {
                          value: effectivePauseWaitSeconds,
                          until: pendingUntilLabel,
                        })
                      : undefined
                  "
                  @touch="emit('touch', 'pauseWaitSeconds')"
                />
                <PauseDurationField
                  v-model="draft.pauseDurationMinutes"
                  :label="t('Pause for')"
                  :unit="t('min')"
                  :input-aria-label="t('Pause duration minutes')"
                  :min="1"
                  :disabled="!draft.pauseAllowed"
                  :error="error('pauseDurationMinutes')"
                  :pending="
                    isFieldPending('pauseDurationMinutes')
                      ? t('Still {value} min {until}.', {
                          value: effectivePauseDurationMinutes,
                          until: pendingUntilLabel,
                        })
                      : undefined
                  "
                  @touch="emit('touch', 'pauseDurationMinutes')"
                />
              </div>
            </div>
          </div>
        </fieldset>
      </div>
    </template>

    <dl v-else class="grid gap-3 text-body-sm">
      <div v-for="summary in summaries" :key="summary.label">
        <dt class="text-label-sm text-muted">{{ summary.label }}</dt>
        <dd class="mt-1 break-all text-secondary-foreground">
          {{ summary.value }}
          <PendingFieldNote v-if="summary.pending">{{ summary.pending }}</PendingFieldNote>
        </dd>
      </div>
    </dl>
  </section>
</template>
