<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })

/** BaseDialogが通知するイベント。 */
interface Emits {
  /** Escによるキャンセル要求。 */
  cancel: []
}

const emit = defineEmits<Emits>()
const dialogRef = ref<HTMLDialogElement | null>(null)

/** モーダルとして開く。 */
function open(): void {
  dialogRef.value?.showModal()
}

/** ダイアログを閉じる。 */
function close(): void {
  dialogRef.value?.close()
}

/** 現在開いているならtrue。 */
function isOpen(): boolean {
  return dialogRef.value?.open === true
}

defineExpose({ open, close, isOpen })
</script>

<template>
  <dialog
    ref="dialogRef"
    v-bind="$attrs"
    class="dialog-centered rounded-lg border border-border bg-background text-foreground shadow-lg backdrop:bg-scrim"
    @cancel.prevent="emit('cancel')"
  >
    <slot />
  </dialog>
</template>
