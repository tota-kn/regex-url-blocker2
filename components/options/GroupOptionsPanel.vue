<script setup lang="ts">
import { ChevronDownIcon, ClockIcon, LockClosedIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import AlertMessage from '@/components/ui/AlertMessage.vue'
import BooleanRadioGroup from '@/components/ui/BooleanRadioGroup.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import { DEFAULT_PAUSE_DURATION_MINUTES, DEFAULT_PAUSE_WAIT_SECONDS } from '@/utils/defaults'
import type { Group } from '@/utils/types'
import { useLockModePending } from '@/utils/useLockModePending'
import PendingFieldNote from './PendingFieldNote.vue'

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
/** 読み取り表示する既定値以外のOptions要約。 */
const summaries = computed(() => {
  const result: Array<{ label: string; value: string; pending?: string }> = []
  const lockLabel = 'Delay relaxed restrictions until next rule day'
  if (props.group.lockMode) result.push({ label: lockLabel, value: 'On' })
  else if (isFieldPending('lockMode')) {
    result.push({ label: lockLabel, value: 'Off', pending: `Still on ${pendingUntilLabel.value}.` })
  }
  if (props.group.pauseAllowed === false) {
    result.push({ label: 'Pause', value: 'Not allowed', pending: pendingPauseNote.value })
  } else if (
    props.group.pauseWaitSeconds !== DEFAULT_PAUSE_WAIT_SECONDS ||
    props.group.pauseDurationMinutes !== DEFAULT_PAUSE_DURATION_MINUTES ||
    pendingPauseNote.value
  ) {
    result.push({
      label: 'Pause',
      value: `Wait ${props.group.pauseWaitSeconds} sec, pause for ${props.group.pauseDurationMinutes} min`,
      pending: pendingPauseNote.value,
    })
  }
  return result
})
/** パネルを表示する必要があるならtrue。 */
const visible = computed(() => props.isEditing || summaries.value.length > 0)

/** disclosure panelのDOM id。 */
function panelId(): string {
  return `options-panel-${props.group.id}`
}
</script>

<template>
  <section v-if="visible" class="space-y-3 px-4 pb-4">
    <h3 v-if="!isEditing" class="flex items-center gap-1.5 text-label-md">
      <LockClosedIcon aria-hidden="true" class="size-4 text-muted" />
      Options
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
          <span>Options</span>
        </span>
      </button>

      <div v-if="isOpen" :id="panelId()" class="divide-y divide-border">
        <fieldset aria-label="Delay relaxed restrictions until next rule day" class="py-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 items-start gap-2 text-secondary-foreground">
              <LockClosedIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <span class="text-label-md">Delay relaxed restrictions until next rule day</span>
                <p class="mt-1 text-body-sm text-muted">
                  Stricter changes apply immediately. Relaxed restrictions take effect on the next
                  rule day.
                </p>
              </div>
            </div>
            <BooleanRadioGroup
              v-model="draft.lockMode"
              label="Delay relaxed restrictions until next rule day"
            />
          </div>
          <PendingFieldNote v-if="isFieldPending('lockMode')">
            Still on {{ pendingUntilLabel }}.
          </PendingFieldNote>
        </fieldset>

        <fieldset aria-label="Pause settings" class="py-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 items-start gap-2 text-secondary-foreground">
              <ClockIcon aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <span class="text-label-md">Pause</span>
                <p class="mt-1 text-body-sm text-muted">
                  Take a short break before temporarily disabling this group.
                </p>
              </div>
            </div>
            <div class="flex flex-col gap-2 sm:items-end">
              <div class="flex flex-wrap items-center gap-4">
                <span class="text-label-md text-secondary-foreground">Allow Pause</span>
                <BooleanRadioGroup v-model="draft.pauseAllowed" label="Allow Pause" on-first />
              </div>
              <PendingFieldNote v-if="isFieldPending('pauseAllowed')" class="sm:text-right">
                Still not allowed {{ pendingUntilLabel }}.
              </PendingFieldNote>
              <div class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 sm:justify-end">
                <div class="min-w-0">
                  <label class="flex items-center gap-2 text-label-md text-secondary-foreground">
                    <span class="shrink-0">Wait</span>
                    <NumberInput
                      v-model="draft.pauseWaitSeconds"
                      min="0"
                      step="1"
                      aria-label="Wait seconds before pausing"
                      class="w-20"
                      :disabled="!draft.pauseAllowed"
                      :invalid="Boolean(error('pauseWaitSeconds'))"
                      @input="emit('touch', 'pauseWaitSeconds')"
                    />
                    <span class="shrink-0">sec</span>
                  </label>
                  <AlertMessage v-if="error('pauseWaitSeconds')" class="mt-2">
                    {{ error('pauseWaitSeconds') }}
                  </AlertMessage>
                  <PendingFieldNote v-if="isFieldPending('pauseWaitSeconds')">
                    Still {{ effectivePauseWaitSeconds }} sec {{ pendingUntilLabel }}.
                  </PendingFieldNote>
                </div>
                <div class="min-w-0">
                  <label class="flex items-center gap-2 text-label-md text-secondary-foreground">
                    <span class="shrink-0">Pause for</span>
                    <NumberInput
                      v-model="draft.pauseDurationMinutes"
                      min="1"
                      step="1"
                      aria-label="Pause duration minutes"
                      class="w-20"
                      :disabled="!draft.pauseAllowed"
                      :invalid="Boolean(error('pauseDurationMinutes'))"
                      @input="emit('touch', 'pauseDurationMinutes')"
                    />
                    <span class="shrink-0">min</span>
                  </label>
                  <AlertMessage v-if="error('pauseDurationMinutes')" class="mt-2">
                    {{ error('pauseDurationMinutes') }}
                  </AlertMessage>
                  <PendingFieldNote v-if="isFieldPending('pauseDurationMinutes')">
                    Still {{ effectivePauseDurationMinutes }} min {{ pendingUntilLabel }}.
                  </PendingFieldNote>
                </div>
              </div>
            </div>
          </div>
        </fieldset>
      </div>
    </template>

    <dl v-else class="grid gap-3 text-body-sm sm:grid-cols-2">
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
