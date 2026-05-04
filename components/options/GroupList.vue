<template>
  <div class="space-y-4">
    <div
      v-if="groups.length === 0"
      class="text-sm text-gray-500 italic"
    >
      グループが登録されていません
    </div>
    <div
      v-for="(group, i) in groups"
      :key="group.id"
      draggable="true"
      class="cursor-grab active:cursor-grabbing"
      :class="{ 'opacity-50': draggingIndex === i }"
      :aria-label="`グループ ${group.name}`"
      @dragstart="onDragStart(i)"
      @dragover.prevent="onDragOver(i)"
      @drop.prevent="onDrop"
      @dragend="onDragEnd"
    >
      <GroupEditor
        :group="group"
        @update="g => emit('update', i, g)"
        @remove="id => emit('remove', id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import GroupEditor from './GroupEditor.vue'
import type { Group } from '@/utils/types'

/**
 * GroupList のプロパティ定義。
 */
const props = defineProps<{
  /** グループの配列 */
  groups: Group[]
}>()

const emit = defineEmits<{
  /** グループ内容の更新時 */
  update: [index: number, group: Group]
  /** グループの削除時 */
  remove: [id: string]
  /** ドラッグ&ドロップで並び替えが確定した時 */
  reorder: [fromIndex: number, toIndex: number]
}>()

const draggingIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

/**
 * ドラッグ開始時のインデックスを記録する。
 */
const onDragStart = (i: number) => {
  draggingIndex.value = i
}

/**
 * ドラッグ中のターゲットインデックスを更新する。
 */
const onDragOver = (i: number) => {
  overIndex.value = i
}

/**
 * ドロップ時に並び替えイベントを発火する。
 */
const onDrop = () => {
  if (draggingIndex.value !== null && overIndex.value !== null && draggingIndex.value !== overIndex.value) {
    emit('reorder', draggingIndex.value, overIndex.value)
  }
}

/**
 * ドラッグ終了時に状態をリセットする。
 */
const onDragEnd = () => {
  draggingIndex.value = null
  overIndex.value = null
}

// props は将来の拡張用に参照を保持（現状は GroupEditor に渡すためのみ）
void props
</script>
