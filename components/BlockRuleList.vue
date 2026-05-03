<template>
  <div>
    <h2 class="text-xl font-semibold mb-4">
      ブロックルール一覧
    </h2>
    <div
      v-if="rules.length === 0"
      class="text-gray-500 italic"
    >
      登録されているブロックルールはありません
    </div>
    <div
      v-else
      class="space-y-4"
    >
      <BlockRuleItem
        v-for="(rule, index) in rules"
        :id="index"
        :key="index"
        :pattern="rule.pattern"
        :time-limit="rule.timeLimit"
        :on-update="handleUpdateRule"
        :on-delete="handleDeleteRule"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'
import BlockRuleItem from './BlockRuleItem.vue'

/**
 * ブロックルールの型定義
 */
interface BlockRule {
  pattern: string
  timeLimit: number
}

/**
 * コンポーネントのプロパティ定義
 */
const props = defineProps<{
  /**
   * 表示するブロックルールのリスト
   */
  rules: BlockRule[]
  /**
   * ブロックルール更新時のイベントハンドラ
   */
  onUpdateRule: (index: number, pattern: string, timeLimit: number) => void
  /**
   * ブロックルール削除時のイベントハンドラ
   */
  onDeleteRule: (index: number) => void
}>()

/**
 * ブロックルールの更新を処理する
 */
const handleUpdateRule = (index: number, pattern: string, timeLimit: number): void => {
  props.onUpdateRule(index, pattern, timeLimit)
}

/**
 * ブロックルールの削除を処理する
 */
const handleDeleteRule = (index: number): void => {
  props.onDeleteRule(index)
}
</script>
