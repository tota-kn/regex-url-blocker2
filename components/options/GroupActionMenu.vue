<script setup lang="ts">
import {
  CheckCircleIcon,
  DocumentDuplicateIcon,
  EllipsisVerticalIcon,
  NoSymbolIcon,
  PauseIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import MenuItem from '@/components/ui/MenuItem.vue'
import { useDismissOnOutsidePointer } from '@/utils/useDismissOnOutsidePointer'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** グループアクションメニューのprops。 */
interface Props {
  /** DOM idに使うgroup id。 */
  groupId: string
  /** 現在groupが無効ならtrue。 */
  disabled: boolean
  /** Pause項目を表示するか。 */
  showPause: boolean
  /** Disable/Enable項目を表示するか。 */
  showDisabledToggle: boolean
  /** Duplicate項目を表示するか。 */
  showDuplicate: boolean
  /** Delete項目を表示するか。 */
  showDelete: boolean
  /** Pause項目のラベル。 */
  pauseLabel: string
  /** Pause操作が可能ならtrue。 */
  canPause: boolean
  /** Pauseを無効化する理由。 */
  pauseDisabledReason?: string
}

/** グループアクションメニューのイベント。 */
interface Emits {
  pause: []
  toggleDisabled: []
  duplicate: []
  remove: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)

/** メニューのDOM id。 */
function menuId(): string {
  return `group-actions-menu-${props.groupId}`
}

/** Pause無効理由のDOM id。 */
function pauseReasonId(): string {
  return `group-pause-disabled-reason-${props.groupId}`
}

/** メニューを開閉する。 */
function toggle(): void {
  isOpen.value = !isOpen.value
}

/** メニューを閉じる。 */
function close(): void {
  isOpen.value = false
}

/** イベントを通知してメニューを閉じる。 */
function select(event: keyof Emits): void {
  close()
  if (event === 'pause') emit('pause')
  else if (event === 'toggleDisabled') emit('toggleDisabled')
  else if (event === 'duplicate') emit('duplicate')
  else emit('remove')
}

useDismissOnOutsidePointer(root, isOpen, close)
</script>

<template>
  <div ref="root" class="relative" @keydown.escape.stop.prevent="close">
    <BaseButton
      type="button"
      :aria-label="t('Group actions')"
      aria-haspopup="menu"
      :aria-controls="menuId()"
      :aria-expanded="isOpen"
      size="icon-md"
      @click="toggle"
    >
      <EllipsisVerticalIcon aria-hidden="true" class="size-5" />
    </BaseButton>

    <div
      v-if="isOpen"
      :id="menuId()"
      role="menu"
      class="absolute right-0 z-20 mt-2 min-w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
    >
      <div v-if="showPause">
        <MenuItem
          :aria-label="pauseLabel"
          :aria-describedby="pauseDisabledReason ? pauseReasonId() : undefined"
          :disabled="!canPause"
          @click="select('pause')"
        >
          <PauseIcon aria-hidden="true" class="size-4 shrink-0" />
          <span>{{ pauseLabel }}</span>
        </MenuItem>
        <p
          v-if="pauseDisabledReason"
          :id="pauseReasonId()"
          class="px-3 pb-2 text-body-sm text-muted"
        >
          {{ pauseDisabledReason }}
        </p>
      </div>
      <MenuItem
        v-if="showDisabledToggle"
        :aria-label="disabled ? t('Enable') : t('Disable')"
        @click="select('toggleDisabled')"
      >
        <CheckCircleIcon v-if="disabled" aria-hidden="true" class="size-4 shrink-0" />
        <NoSymbolIcon v-else aria-hidden="true" class="size-4 shrink-0" />
        <span>{{ disabled ? t('Enable') : t('Disable') }}</span>
      </MenuItem>
      <MenuItem
        v-if="showDuplicate"
        :aria-label="t('Duplicate group')"
        @click="select('duplicate')"
      >
        <DocumentDuplicateIcon aria-hidden="true" class="size-4 shrink-0" />
        <span>{{ t('Duplicate') }}</span>
      </MenuItem>
      <MenuItem
        v-if="showDelete"
        :aria-label="t('Delete group')"
        variant="danger"
        @click="select('remove')"
      >
        <TrashIcon aria-hidden="true" class="size-4 shrink-0" />
        <span>{{ t('Delete') }}</span>
      </MenuItem>
    </div>
  </div>
</template>
