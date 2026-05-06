<script setup lang="ts">
/**
 * 正規表現パターン編集コンポーネントの props。
 */
interface Props {
  /** 指定パターン番号のエラーメッセージを返す関数。 */
  error: (index: number) => string | undefined
}

defineProps<Props>()

/**
 * グループに属する正規表現パターン配列。
 */
const patterns = defineModel<string[]>({ required: true })
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium">
        正規表現パターン
      </h3>
      <button
        type="button"
        class="text-primary text-sm"
        @click="patterns.push('https?://')"
      >
        + パターン追加
      </button>
    </div>
    <div
      v-for="(_, i) in patterns"
      :key="i"
      class="space-y-1"
    >
      <div class="flex gap-2">
        <input
          v-model="patterns[i]"
          aria-label="正規表現"
          class="flex-1 border border-input-border bg-input rounded-md px-2 py-1 font-mono text-sm"
        >
        <button
          type="button"
          class="text-destructive text-sm"
          @click="patterns.splice(i, 1)"
        >
          削除
        </button>
      </div>
      <p
        v-if="error(i)"
        class="text-destructive text-sm"
      >
        {{ error(i) }}
      </p>
    </div>
  </div>
</template>
