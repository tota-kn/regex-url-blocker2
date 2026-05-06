<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowUturnLeftIcon, ShieldExclamationIcon } from '@heroicons/vue/24/outline'
import { loadSettings } from '@/utils/storage'
import type { Group } from '@/utils/types'

const blockedUrl = ref('')
const blockedGroups = ref<Group[]>([])
const isLoaded = ref(false)

const groupNames = computed(() => blockedGroups.value.map(group => group.name).join(', '))

/**
 * 現在の URL query からブロックされた URL を取り出す。
 */
function parseBlockedUrl(params: URLSearchParams): string {
  return params.get('url') ?? ''
}

/**
 * 現在の URL query からブロックした group id を取り出す。
 */
function parseGroupIds(params: URLSearchParams): string[] {
  return params.getAll('group')
}

/**
 * ブラウザ履歴の直前のページへ戻る。
 */
function goBack(): void {
  history.back()
}

onMounted(async () => {
  const params = new URLSearchParams(location.search)
  const groupIds = new Set(parseGroupIds(params))
  const settings = await loadSettings()
  blockedUrl.value = parseBlockedUrl(params)
  blockedGroups.value = settings.groups.filter(group => groupIds.has(group.id))
  isLoaded.value = true
})
</script>

<template>
  <main class="min-h-screen bg-secondary/40 px-4 py-10 text-foreground sm:px-6">
    <section class="mx-auto max-w-2xl rounded-lg border border-border bg-background p-6 shadow-sm">
      <div class="flex items-start gap-3">
        <ShieldExclamationIcon
          aria-hidden="true"
          class="mt-0.5 size-7 shrink-0 text-destructive"
        />
        <div class="min-w-0">
          <h1 class="text-xl font-semibold tracking-normal">
            Page blocked
          </h1>
          <p class="mt-1 text-sm text-secondary-foreground">
            This page was blocked by Regex URL Blocker.
          </p>
        </div>
      </div>

      <div class="mt-6 space-y-4">
        <div>
          <h2 class="text-sm font-medium text-secondary-foreground">
            URL
          </h2>
          <p
            aria-label="Blocked URL"
            class="mt-1 break-all rounded-md border border-border bg-input px-3 py-2 text-sm"
          >
            {{ blockedUrl || 'Unknown' }}
          </p>
        </div>

        <div>
          <h2 class="text-sm font-medium text-secondary-foreground">
            Blocked by
          </h2>
          <p
            v-if="!isLoaded"
            class="mt-1 text-sm text-muted"
          >
            Loading...
          </p>
          <p
            v-else-if="blockedGroups.length === 0"
            aria-label="Blocked groups"
            class="mt-1 rounded-md border border-border bg-input px-3 py-2 text-sm"
          >
            Unknown setting
          </p>
          <p
            v-else
            aria-label="Blocked groups"
            class="mt-1 rounded-md border border-border bg-input px-3 py-2 text-sm"
          >
            {{ groupNames }}
          </p>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/60"
          @click="goBack"
        >
          <ArrowUturnLeftIcon
            aria-hidden="true"
            class="size-4"
          />
          Back
        </button>
      </div>
    </section>
  </main>
</template>
