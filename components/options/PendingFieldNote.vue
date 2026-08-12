<script setup lang="ts">
import { LockClosedIcon } from '@heroicons/vue/24/outline'

/**
 * Lock Mode により希望値がまだ適用されていないフィールドへ添える注記。
 * どのフィールドが保留中かをフィールド単位で示し、いま実際に効いている値を伝える。
 */
</script>

<template>
  <p class="mt-1 flex items-start gap-1 text-body-sm text-warning-text">
    <LockClosedIcon aria-hidden="true" class="mt-0.5 size-3.5 shrink-0" />
    <span><slot /></span>
  </p>
</template>
