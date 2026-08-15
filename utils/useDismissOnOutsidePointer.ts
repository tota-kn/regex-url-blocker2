import { onBeforeUnmount, watch, type Ref } from 'vue'

/** 外側ポインタ操作で閉じる挙動を登録する。 */
export function useDismissOnOutsidePointer(
  root: Ref<HTMLElement | null>,
  isOpen: Ref<boolean>,
  dismiss: () => void,
): void {
  /** root 外の操作なら dismiss を呼ぶ。 */
  function handlePointerDown(event: PointerEvent): void {
    const target = event.target
    if (target instanceof Node && root.value?.contains(target)) return
    dismiss()
  }

  watch(isOpen, (open) => {
    if (open) document.addEventListener('pointerdown', handlePointerDown, true)
    else document.removeEventListener('pointerdown', handlePointerDown, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handlePointerDown, true)
  })
}
