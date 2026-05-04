<template>
  <div class="p-4 border border-gray-200 rounded-lg space-y-4 bg-white">
    <div class="flex items-center justify-between">
      <input
        v-model="local.name"
        type="text"
        class="text-base font-semibold px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-blue-500 w-full mr-2"
        :aria-label="`グループ名`"
        placeholder="グループ名"
        @input="emitUpdate"
      >
      <button
        class="shrink-0 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-md focus:outline-none"
        aria-label="グループを削除"
        @click="emit('remove', props.group.id)"
      >
        削除
      </button>
    </div>

    <div>
      <p class="text-sm font-medium text-gray-700 mb-2">
        正規表現パターン
      </p>
      <PatternListEditor
        :patterns="local.patterns"
        @update:patterns="p => { local.patterns = p; emitUpdate() }"
        @update:has-error="e => patternHasError = e"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label
          :for="`limit-${props.group.id}`"
          class="block text-sm font-medium text-gray-700 mb-1"
        >1日の上限（分）</label>
        <input
          :id="`limit-${props.group.id}`"
          type="number"
          min="0"
          :value="local.dailyTimeLimitMinutes ?? ''"
          class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="なし"
          :aria-label="`1日の閲覧上限（分）`"
          @input="onLimitInput(($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>

    <div>
      <p class="text-sm font-medium text-gray-700 mb-2">
        許可時間帯
      </p>
      <AllowedHoursEditor
        :allowed-hours="local.allowedHours"
        @update:allowed-hours="h => { local.allowedHours = h; emitUpdate() }"
      />
    </div>

    <p
      v-if="!local.dailyTimeLimitMinutes && local.dailyTimeLimitMinutes !== 0 && local.allowedHours.length === 0"
      class="text-xs text-amber-600"
    >
      ⚠ 制限が設定されていません
    </p>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import PatternListEditor from './PatternListEditor.vue'
import AllowedHoursEditor from './AllowedHoursEditor.vue'
import type { Group } from '@/utils/types'

/**
 * GroupEditor のプロパティ定義。
 */
const props = defineProps<{
  /** 編集対象のグループ */
  group: Group
}>()

const emit = defineEmits<{
  /** グループ内容の変更時に発火 */
  update: [group: Group]
  /** グループ削除時に発火 */
  remove: [id: string]
}>()

const local = reactive<Group>({ ...props.group, patterns: [...props.group.patterns], allowedHours: props.group.allowedHours.map(h => ({ ...h })) })
const patternHasError = ref(false)

/**
 * 数値入力から dailyTimeLimitMinutes を更新する。空文字は null（制限なし）に変換。
 */
const onLimitInput = (value: string) => {
  local.dailyTimeLimitMinutes = value === '' ? null : Math.max(0, Number.parseInt(value, 10))
  emitUpdate()
}

/**
 * 変更内容を親コンポーネントに通知する。バリデーションエラーがある場合は通知しない。
 */
const emitUpdate = () => {
  if (patternHasError.value) return
  emit('update', { ...local, patterns: [...local.patterns], allowedHours: local.allowedHours.map(h => ({ ...h })) })
}
</script>
