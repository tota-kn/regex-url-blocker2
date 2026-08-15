<script setup lang="ts">
import { QuestionMarkCircleIcon } from '@heroicons/vue/24/outline'
import { ref, useId } from 'vue'
import { useDismissOnOutsidePointer } from '@/utils/useDismissOnOutsidePointer'

/**
 * 補足説明ツールチップの props。
 */
interface Props {
  /** トリガーボタンの aria-label。何の説明かを表す。 */
  label: string
}

defineProps<Props>()

const PANEL_WIDTH = 288
const VIEWPORT_MARGIN = 8

const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const panelStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })
const panelId = useId()

/**
 * ツールチップを開く。
 * グループカードは overflow-hidden なので、パネルは fixed で配置してクリッピングを避ける。
 */
function open(): void {
  const rect = trigger.value?.getBoundingClientRect()
  if (rect) {
    const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN)
    panelStyle.value = {
      top: `${rect.bottom + 6}px`,
      left: `${Math.max(VIEWPORT_MARGIN, left)}px`,
    }
  }
  isOpen.value = true
}

/** ツールチップを閉じる。 */
function close(): void {
  isOpen.value = false
}

/** クリック／タップで開閉する。ポインタを持たない環境でも開けるようにする。 */
function toggle(): void {
  isOpen.value = !isOpen.value
}

useDismissOnOutsidePointer(root, isOpen, close)
</script>

<template>
  <span
    ref="root"
    class="relative inline-flex"
    @mouseenter="open"
    @mouseleave="close"
    @keydown.escape.stop.prevent="close"
  >
    <button
      ref="trigger"
      type="button"
      :aria-label="label"
      :aria-expanded="isOpen"
      :aria-describedby="isOpen ? panelId : undefined"
      class="inline-flex size-5 items-center justify-center rounded-full text-muted transition hover:text-secondary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @click="toggle"
      @focus="open"
      @blur="close"
    >
      <QuestionMarkCircleIcon aria-hidden="true" class="size-4" />
    </button>

    <span
      v-if="isOpen"
      :id="panelId"
      role="tooltip"
      class="fixed z-50 w-72 rounded-md border border-border bg-surface p-3 text-left text-body-sm font-normal text-secondary-foreground shadow-lg"
      :style="panelStyle"
    >
      <slot />
    </span>
  </span>
</template>
