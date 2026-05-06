<script setup lang="ts">
import { ref } from 'vue'

const dialogRef = ref<HTMLDialogElement | null>(null)
const message = ref('')
let resolve: ((value: boolean) => void) | null = null

/**
 * 確認ダイアログを開き、ユーザーの選択を Promise で返す。
 * 確認ボタンで `true`、キャンセルで `false`。
 */
function open(msg: string): Promise<boolean> {
  message.value = msg
  return new Promise((res) => {
    resolve = res
    dialogRef.value?.showModal()
  })
}

/** 確認ボタン押下時の処理。 */
function onConfirm(): void {
  dialogRef.value?.close()
  resolve?.(true)
  resolve = null
}

/** キャンセルボタン押下時の処理。 */
function onCancel(): void {
  dialogRef.value?.close()
  resolve?.(false)
  resolve = null
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialogRef"
    class="rounded-md border border-border bg-background text-foreground p-6 shadow-lg w-80"
  >
    <p class="mb-4">
      {{ message }}
    </p>
    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="border border-border rounded-md px-3 py-1 hover:bg-muted"
        @click="onCancel"
      >
        キャンセル
      </button>
      <button
        type="button"
        class="text-destructive border border-destructive rounded-md px-3 py-1 hover:bg-muted"
        @click="onConfirm"
      >
        削除する
      </button>
    </div>
  </dialog>
</template>
