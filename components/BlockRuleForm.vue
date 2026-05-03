<template>
  <div class="p-4 bg-gray-50 rounded-lg">
    <h2 class="text-xl font-semibold mb-4">
      新規ブロックルールの追加
    </h2>
    <div class="flex flex-col space-y-4">
      <div>
        <label
          for="newPattern"
          class="block text-sm font-medium text-gray-700 mb-1"
        >ブロック対象URLの正規表現</label>
        <input
          id="newPattern"
          v-model="pattern"
          type="text"
          placeholder="例: .*facebook\.com.*"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="ブロック対象URLの正規表現"
        >
      </div>
      <div>
        <label
          for="newTimeLimit"
          class="block text-sm font-medium text-gray-700 mb-1"
        >利用可能時間 (分/日)</label>
        <input
          id="newTimeLimit"
          v-model="timeLimit"
          type="number"
          min="0"
          placeholder="30"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="利用可能時間（分単位）"
        >
      </div>
      <div>
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          tabindex="0"
          aria-label="ブロックルールを追加"
          @click="handleAddRule"
          @keydown.enter="handleAddRule"
        >
          追加
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 新しいルールのパターン
 */
const pattern = ref<string>('')

/**
 * 新しいルールの時間制限（分単位）
 */
const timeLimit = ref<number>(30)

/**
 * コンポーネントのプロパティ定義
 */
const props = defineProps<{
  /**
   * 新しいルール追加時のイベントハンドラ
   */
  onAddRule: (pattern: string, timeLimit: number) => void
}>()

/**
 * 新しいブロックルールの追加を処理する
 */
const handleAddRule = (): void => {
  if (!pattern.value) return
  if (timeLimit.value < 0) return

  props.onAddRule(pattern.value, timeLimit.value)

  // 入力フォームをリセット
  pattern.value = ''
  timeLimit.value = 30
}
</script>
