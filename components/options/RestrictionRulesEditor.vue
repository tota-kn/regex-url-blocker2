<script setup lang="ts">
import { PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import { createDefaultRestriction, createDefaultTimeWindow } from '@/utils/defaults'
import { formatStandaloneRestriction, formatTimeWindow } from '@/utils/groups'
import type { Restriction, TimeWindow } from '@/utils/types'
import RestrictionEditor from './RestrictionEditor.vue'
import ScheduleWindowEditor from './ScheduleWindowEditor.vue'

/**
 * 複数の制限ルールを編集するコンポーネントの props。
 */
interface Props {
  /** 編集モードかどうか。false のとき読み取り表示にする。 */
  isEditing?: boolean
  /** 指定フィールドのバリデーションエラーメッセージを返す関数。 */
  timeWindowError?: (index: number, field: 'condition' | 'timeRanges') => string | undefined
  restrictionError?: (index: number, field: 'graceMinutes' | 'waitSeconds') => string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: true,
  timeWindowError: () => undefined,
  restrictionError: () => undefined,
})

const timeWindows = defineModel<TimeWindow[]>('timeWindows', { required: true })
const restrictions = defineModel<Restriction[]>('restrictions', { required: true })

/** 新しい制限ルールを追加する。 */
function addTimeWindow(): void {
  timeWindows.value = [...timeWindows.value, createDefaultTimeWindow()]
}

/** 指定位置の制限ルールを削除する。 */
function removeTimeWindow(index: number): void {
  timeWindows.value = timeWindows.value.filter((_, i) => i !== index)
}

/** 新しい制限を追加する。 */
function addRestriction(): void {
  restrictions.value = [...restrictions.value, createDefaultRestriction('block')]
}

/** 指定位置の制限を削除する。 */
function removeRestriction(index: number): void {
  restrictions.value = restrictions.value.filter((_, i) => i !== index)
}
</script>

<template>
  <section class="min-w-0 space-y-3">
    <div>
      <h3 class="text-label-md">
        Time windows
      </h3>
    </div>

    <ol
      class="space-y-3"
      aria-label="Time windows"
    >
      <li
        v-for="(window, index) in timeWindows"
        :key="index"
        class="space-y-3 rounded-lg border border-border bg-surface p-3"
      >
        <div class="flex min-w-0 items-center justify-between gap-2">
          <h4 class="text-label-md">
            Time window {{ index + 1 }}
          </h4>
          <BaseButton
            v-if="isEditing"
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="`Remove time window ${index + 1}`"
            @click="removeTimeWindow(index)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </BaseButton>
        </div>

        <template v-if="isEditing">
          <label class="text-label-md">
            <span class="sr-only">Time window type</span>
            <select
              aria-label="Time window type"
              :value="window.type"
              class="h-8 rounded-lg border border-field-border bg-field px-2 text-body-md"
              @change="timeWindows[index] = ($event.target as HTMLSelectElement).value === 'always' ? { type: 'always' } : { type: 'scheduled', condition: { type: 'daily' }, timeRanges: [] }"
            >
              <option value="always">Always</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </label>
          <ScheduleWindowEditor
            v-if="window.type === 'scheduled'"
            :condition="window.condition"
            :time-ranges="window.timeRanges"
            :is-editing="isEditing"
            @update:condition="window.condition = $event"
            @update:time-ranges="window.timeRanges = $event"
          />
        </template>

        <output
          v-else
          :aria-label="`Time window ${index + 1}`"
          class="block text-body-md text-input-foreground"
        >
          {{ formatTimeWindow(window) }}
        </output>
      </li>
    </ol>
    <BaseButton
      v-if="isEditing"
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Add time window"
      @click="addTimeWindow"
    >
      <PlusIcon
        aria-hidden="true"
        class="size-4"
      />
      Time window
    </BaseButton>

    <div class="pt-3">
      <h3 class="text-label-md">
        Restrictions
      </h3>
    </div>
    <ol
      v-if="restrictions.length > 0"
      class="space-y-3"
      aria-label="Restrictions"
    >
      <li
        v-for="(restriction, index) in restrictions"
        :key="index"
        class="space-y-3 rounded-lg border border-border bg-surface p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-label-md">
            Restriction {{ index + 1 }}
          </h4>
          <BaseButton
            v-if="isEditing"
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="`Remove restriction ${index + 1}`"
            @click="removeRestriction(index)"
          >
            <TrashIcon
              aria-hidden="true"
              class="size-4"
            />
          </BaseButton>
        </div>
        <RestrictionEditor
          v-if="isEditing"
          v-model="restrictions[index]"
          :is-editing="isEditing"
          :error="field => props.restrictionError(index, field)"
        />
        <output
          v-else
          :aria-label="`Restriction ${index + 1}`"
          class="block text-body-md text-input-foreground"
        >{{ formatStandaloneRestriction(restriction) }}</output>
      </li>
    </ol>
    <BaseButton
      v-if="isEditing"
      type="button"
      size="sm"
      variant="ghost"
      aria-label="Add restriction"
      @click="addRestriction"
    >
      <PlusIcon
        aria-hidden="true"
        class="size-4"
      />
      Restriction
    </BaseButton>
  </section>
</template>
