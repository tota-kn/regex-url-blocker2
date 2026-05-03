<template>
  <div class="p-4 border border-gray-200 rounded-lg">
    <div class="flex flex-col space-y-4">
      <div>
        <label
          :for="`pattern-${id}`"
          class="block text-sm font-medium text-gray-700 mb-1"
        >ブロック対象URLの正規表現</label>
        <input
          :id="`pattern-${id}`"
          v-model="localPattern"
          type="text"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="ブロック対象URLの正規表現"
        >
      </div>
      <div>
        <label
          :for="`timeLimit-${id}`"
          class="block text-sm font-medium text-gray-700 mb-1"
        >利用可能時間 (分/日)</label>
        <input
          :id="`timeLimit-${id}`"
          v-model="localTimeLimit"
          type="number"
          min="0"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="利用可能時間（分単位）"
        >
      </div>
      <div class="flex space-x-2">
        <button
          class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          tabindex="0"
          aria-label="ブロックルールを更新"
          @click="handleUpdate"
          @keydown.enter="handleUpdate"
        >
          更新
        </button>
        <button
          class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          tabindex="0"
          aria-label="ブロックルールを削除"
          @click="handleDelete"
          @keydown.enter="handleDelete"
        >
          削除
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * コンポーネントのプロパティ定義
 */
const props = defineProps<{
  /**
   * ブロックルールのID（インデックス）
   */
  id: number
  /**
   * ブロックルールのパターン
   */
  pattern: string
  /**
   * ブロックルールの時間制限（分単位）
   */
  timeLimit: number
  /**
   * ブロックルール更新時のイベントハンドラ
   */
  onUpdate: (id: number, pattern: string, timeLimit: number) => void
  /**
   * ブロックルール削除時のイベントハンドラ
   */
  onDelete: (id: number) => void
}>()

/**
 * ローカルのブロックパターン（編集用）
 */
const localPattern = ref<string>(props.pattern)

/**
 * ローカルの時間制限（編集用）
 */
const localTimeLimit = ref<number>(props.timeLimit)

/**
 * プロパティの変更を監視してローカル状態を更新
 */
watch(() => props.pattern, (newPattern) => {
  localPattern.value = newPattern
})

watch(() => props.timeLimit, (newTimeLimit) => {
  localTimeLimit.value = newTimeLimit
})

/**
 * ブロックルールの更新を処理する
 */
const handleUpdate = (): void => {
  if (!localPattern.value) return
  if (localTimeLimit.value < 0) return

  props.onUpdate(props.id, localPattern.value, localTimeLimit.value)
}

/**
 * ブロックルールの削除を処理する
 */
const handleDelete = (): void => {
  props.onDelete(props.id)
}
</script>
