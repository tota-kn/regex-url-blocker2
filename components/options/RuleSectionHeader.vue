<script setup lang="ts">
/**
 * ルール編集セクションで共通利用する見出しの props。
 */
interface Props {
  /** 見出しに表示する文言。 */
  title: string
}

defineProps<Props>()
</script>

<template>
  <div class="flex min-h-5 items-center gap-1.5">
    <slot name="icon" />
    <h3 class="text-label-md">{{ title }}</h3>
  </div>
</template>
