<script setup lang="ts">
import { TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
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
        class="inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-1 hover:bg-muted"
        @click="onCancel"
      >
        <XMarkIcon
          aria-hidden="true"
          class="size-4"
        />
        Cancel
      </button>
      <button
        type="button"
        aria-label="Confirm delete"
        class="inline-flex items-center gap-1.5 text-destructive border border-destructive rounded-md px-3 py-1 hover:bg-muted"
        @click="onConfirm"
      >
        <TrashIcon
          aria-hidden="true"
          class="size-4"
        />
        Delete
      </button>
    </div>
  </dialog>
</template>
