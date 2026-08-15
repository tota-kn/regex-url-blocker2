<script setup lang="ts">
/** 共通ページ外殻のprops。 */
interface Props {
  /** ページ見出し。 */
  title: string
}

defineProps<Props>()
</script>

<template>
  <main class="min-h-screen bg-surface-muted px-4 py-10 text-foreground sm:px-6">
    <section class="mx-auto max-w-2xl rounded-lg border border-border bg-background p-6 shadow-sm">
      <div class="flex items-start gap-3">
        <img src="/icon/48.png" alt="" aria-hidden="true" class="mt-0.5 size-8 shrink-0" />
        <div class="min-w-0">
          <h1 class="text-heading-lg">{{ title }}</h1>
          <div class="mt-1 text-body-md text-secondary-foreground">
            <slot name="description" />
          </div>
        </div>
      </div>
      <slot />
    </section>
  </main>
</template>
