<script setup lang="ts">
import { TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'

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
    class="w-80 rounded-md border border-border bg-background p-6 text-foreground shadow-lg"
  >
    <p class="mb-4">
      {{ message }}
    </p>
    <div class="flex justify-end gap-2">
      <BaseButton
        type="button"
        @click="onCancel"
      >
        <XMarkIcon
          aria-hidden="true"
          class="size-4"
        />
        Cancel
      </BaseButton>
      <BaseButton
        type="button"
        aria-label="Confirm delete"
        variant="danger-ghost"
        @click="onConfirm"
      >
        <TrashIcon
          aria-hidden="true"
          class="size-4"
        />
        Delete
      </BaseButton>
    </div>
  </dialog>
</template>
