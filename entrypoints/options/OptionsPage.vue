<template>
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-6">
      URL ブロッカー設定
    </h1>

    <!-- ブロックルール入力フォーム -->
    <div class="mb-8">
      <BlockRuleForm :on-add-rule="handleAddRule" />
    </div>

    <!-- ブロックルールリスト -->
    <BlockRuleList
      :rules="blockRules"
      :on-update-rule="handleUpdateRule"
      :on-delete-rule="handleDeleteRule"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BlockRuleForm from '../../components/BlockRuleForm.vue'
import BlockRuleList from '../../components/BlockRuleList.vue'

/**
 * ブロックルールの型定義
 */
interface BlockRule {
  pattern: string
  timeLimit: number
}

/**
 * 登録済みブロックルールのリスト
 */
const blockRules = ref<BlockRule[]>([])

/**
 * Chrome Storageからブロックルールを読み込む
 */
const loadBlockRules = async (): Promise<void> => {
  try {
    const result = await chrome.storage.sync.get('blockRules')
    if (result.blockRules) {
      blockRules.value = result.blockRules
    }
  }
  catch (error) {
    console.error('ブロックルールの読み込み中にエラーが発生しました:', error)
  }
}

/**
 * Chrome Storageにブロックルールを保存する
 */
const saveBlockRules = async (): Promise<void> => {
  try {
    await chrome.storage.sync.set({ blockRules: blockRules.value })
  }
  catch (error) {
    console.error('ブロックルールの保存中にエラーが発生しました:', error)
  }
}

/**
 * 新しいブロックルールを追加する
 */
const handleAddRule = (pattern: string, timeLimit: number): void => {
  blockRules.value.push({
    pattern,
    timeLimit,
  })

  // 保存
  saveBlockRules()
}

/**
 * 既存のブロックルールを更新する
 */
const handleUpdateRule = (index: number, pattern: string, timeLimit: number): void => {
  if (index < 0 || index >= blockRules.value.length) return

  blockRules.value[index] = {
    pattern,
    timeLimit,
  }

  // 保存
  saveBlockRules()
}

/**
 * ブロックルールを削除する
 */
const handleDeleteRule = (index: number): void => {
  if (index < 0 || index >= blockRules.value.length) return

  blockRules.value.splice(index, 1)

  // 保存
  saveBlockRules()
}

// コンポーネントマウント時にブロックルールを読み込む
onMounted(() => {
  loadBlockRules()
})
</script>
