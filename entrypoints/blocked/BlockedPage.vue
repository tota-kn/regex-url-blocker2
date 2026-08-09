<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowUturnLeftIcon } from '@heroicons/vue/24/outline'
import BaseButton from '@/components/ui/BaseButton.vue'
import InfoValue from '@/components/ui/InfoValue.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import {
  getEffectiveGroupBlockStatus,
  getNextDailyResetAt,
  getTimeRangeUnblockAt,
  type GroupBlockStatus,
} from '@/utils/blocking'
import { formatDateTime } from '@/utils/datetime'
import { formatRuleSentence, RULE_KIND_LABELS } from '@/utils/rules'
import { loadPageState } from '@/utils/storage'
import type { GlobalSettings, Group } from '@/utils/types'

interface BlockedReason {
  /** 画面に表示する理由 badge。ブロックを起こしたルールの種別名。 */
  label: string
  /** 原因になったルールを自然文にしたもの。 */
  summary: string
  /** 解除時刻の説明ラベル。 */
  releaseLabel: string
  /** 解除される日時。実質常時ブロックで解除予定がない場合は undefined。 */
  releaseAt?: Date
}

interface BlockedGroupDisplay {
  /** ブロックしたグループ。 */
  group: Group
  /** 現在時刻のブロック状態。 */
  status: GroupBlockStatus
  /** 画面に表示するブロック理由。原因が特定できない場合は undefined。 */
  reason?: BlockedReason
}

const blockedUrl = ref('')
const blockedGroupDisplays = ref<BlockedGroupDisplay[]>([])
const isLoaded = ref(false)

/**
 * ブロック状態から、どのルールがなぜ止めたのかを1件にまとめて返す。
 * 評価順で最初に成立した理由だけを表示するため、実際の挙動と1対1で対応する。
 */
function buildReason(
  group: Group,
  status: GroupBlockStatus,
  now: Date,
  global: GlobalSettings,
): BlockedReason | undefined {
  const reason = status.blockReason
  if (!reason) return undefined
  const summary = formatRuleSentence(reason.rule)

  if (reason.kind === 'block') {
    const releaseAt = getTimeRangeUnblockAt(group, now, global)
    return {
      label: RULE_KIND_LABELS.block,
      summary,
      releaseLabel: 'Unblocks at',
      ...(releaseAt ? { releaseAt } : {}),
    }
  }
  if (reason.kind === 'sessionLimit') {
    return {
      label: RULE_KIND_LABELS.sessionLimit,
      summary,
      releaseLabel: 'Break ends at',
      releaseAt: new Date(reason.breakUntil),
    }
  }
  return {
    label: RULE_KIND_LABELS.dailyLimit,
    summary,
    releaseLabel: 'Resets at',
    releaseAt: getNextDailyResetAt(now, global),
  }
}

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
  const { settings, counters, effectiveSettings, sessionLimitState } = await loadPageState()
  const now = new Date()
  blockedUrl.value = parseBlockedUrl(params)
  blockedGroupDisplays.value = [...groupIds].flatMap((groupId) => {
    const effective = getEffectiveGroupBlockStatus(
      groupId,
      effectiveSettings,
      settings,
      counters.counters[groupId],
      blockedUrl.value,
      now,
      sessionLimitState,
    )
    if (!effective) return []
    const { group, status } = effective
    const reason = buildReason(group, status, now, effectiveSettings.global)
    return [{ group, status, ...(reason ? { reason } : {}) }]
  })
  isLoaded.value = true
})
</script>

<template>
  <main class="min-h-screen bg-secondary/40 px-4 py-10 text-foreground sm:px-6">
    <section class="mx-auto max-w-2xl rounded-lg border border-border bg-background p-6 shadow-sm">
      <div class="flex items-start gap-3">
        <img src="/icon/48.png" alt="" aria-hidden="true" class="mt-0.5 size-8 shrink-0" />
        <div class="min-w-0">
          <h1 class="text-heading-lg">Page blocked</h1>
          <p class="mt-1 text-body-md text-secondary-foreground">
            This page was blocked by Regex URL Guard.
          </p>
        </div>
      </div>

      <div class="mt-6 space-y-4">
        <div>
          <InfoValue label="URL" aria-label="Blocked URL" break-all>
            {{ blockedUrl || 'Unknown' }}
          </InfoValue>
        </div>

        <p v-if="!isLoaded" class="text-body-sm text-muted-foreground">Loading...</p>
        <InfoValue v-else-if="blockedGroupDisplays.length === 0" aria-label="Blocking details">
          Unknown setting
        </InfoValue>
        <div v-else class="space-y-3" aria-label="Blocking details">
          <article
            v-for="display in blockedGroupDisplays"
            :key="display.group.id"
            class="rounded-lg border border-border bg-surface-muted p-3"
          >
            <h3 class="text-heading-md">
              {{ display.group.name }}
            </h3>

            <div
              v-if="display.reason"
              class="mt-3 rounded-lg border border-border bg-background px-3 py-2"
              :aria-label="`${display.group.name} ${display.reason.label}`"
            >
              <div class="flex flex-wrap items-center gap-2">
                <StatusBadge kind="danger" class="inline-flex">
                  {{ display.reason.label }}
                </StatusBadge>
                <span class="font-mono text-body-sm text-secondary-foreground">
                  {{ display.reason.summary }}
                </span>
              </div>
              <dl class="mt-2 grid gap-1 text-body-sm sm:grid-cols-[max-content_1fr] sm:gap-x-3">
                <dt class="text-muted-foreground">
                  {{ display.reason.releaseLabel }}
                </dt>
                <dd class="font-medium text-foreground">
                  {{
                    display.reason.releaseAt
                      ? formatDateTime(display.reason.releaseAt)
                      : 'Not scheduled'
                  }}
                </dd>
              </dl>
            </div>

            <p v-else class="mt-2 text-body-sm text-muted-foreground">No active reason found.</p>
          </article>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <BaseButton type="button" variant="primary" class="h-10 px-4" @click="goBack">
          <ArrowUturnLeftIcon aria-hidden="true" class="size-4" />
          Back
        </BaseButton>
      </div>
    </section>
  </main>
</template>
