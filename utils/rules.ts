import { resolveDailyLimitRule, resolveEffectiveWait } from './blocking'
import { minutesToTime } from './datetime'
import { formatTimeWindow } from './groups'
import {
  filterActiveRules,
  getRuleActiveTimeRanges,
  isAllDayWindow,
  isWindowActiveAt,
} from './timeWindow'
import type { BlockDestination, GlobalSettings, Rule, RuleKind, RuleRestriction } from './types'

/**
 * 制限種別の画面表示名。
 */
export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  block: 'Block',
  dailyLimit: 'Daily limit',
  wait: 'Wait',
}

/**
 * 複数のルールが同時に有効なときの評価順の説明。ツールチップに表示する。
 */
export const EVALUATION_ORDER_STEPS: { kind: RuleKind; label: string; detail: string }[] = [
  { kind: 'block', label: 'Block', detail: 'Always sends you to the destination.' },
  { kind: 'dailyLimit', label: 'Daily limit', detail: "Blocks once today's minutes run out." },
  { kind: 'wait', label: 'Wait', detail: 'Shows the gate page, then lets you through.' },
]

/**
 * 評価順の補足。Wait が時間を消費しないという誤解を防ぐ。
 */
export const EVALUATION_ORDER_NOTE =
  'The first rule that applies wins. Wait only gates access — the daily limit keeps counting down while you browse, including during the minutes granted after a wait.'

/**
 * 現在時刻におけるグループ全体の合成結果。
 */
export interface CurrentStateSummary {
  /** 状態の分類。バッジの色分けに使う。 */
  kind: 'blocked' | 'gated' | 'limited' | 'free'
  /** 1行で表す現在の状態。 */
  headline: string
  /** 評価順に並べた、これから何が起きるかの説明。 */
  lines: string[]
}

/**
 * 遷移先を読み取り表示用の文言に変換する。
 */
export function formatDestination(destination: BlockDestination | undefined): string {
  if (!destination || destination.type === 'blockedPage') return 'blocked page'
  return destination.url
}

/**
 * ルールの制限内容を読み取り表示用の文言に変換する。
 */
export function formatRuleRestriction(restriction: RuleRestriction): string {
  if (restriction.kind === 'block') return 'Block access'
  if (restriction.kind === 'dailyLimit') return `Allow ${restriction.minutes} min per day`
  return `Wait ${restriction.seconds} sec, then allow ${restriction.grantMinutes} min`
}

/**
 * ルール1件を「いつ・何を・どこへ」の3要素に分解した表示用の文言を返す。
 */
export function formatRule(rule: Rule): { when: string; what: string; destination?: string } {
  return {
    when: formatTimeWindow(rule.window),
    what: formatRuleRestriction(rule.restriction),
    ...(rule.restriction.kind === 'wait'
      ? {}
      : { destination: formatDestination(rule.destination) }),
  }
}

/**
 * ルール1件を1行の自然文へ変換する。
 */
export function formatRuleSentence(rule: Rule): string {
  const { when, what, destination } = formatRule(rule)
  return `${when} → ${what}${destination ? ` → ${destination}` : ''}`
}

/**
 * 秒数を mm:ss 形式へ変換する。
 */
function formatDuration(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`
}

/**
 * ルールのウィンドウが現在の時間帯を抜ける時刻を "HH:MM" で返す。終日なら undefined。
 */
function windowEndsAtLabel(rule: Rule, at: Date): string | undefined {
  if (isAllDayWindow(rule.window)) return undefined
  const active = getRuleActiveTimeRanges(rule, at)[0]
  if (!active || active.startMinute === active.endMinute) return undefined
  return minutesToTime(active.endMinute % 1440)
}

/**
 * 現在時刻でグループがどう振る舞うかを、評価順に沿った自然文で返す。
 * 「Daily limit と Wait を組み合わせると何が起きるか」を画面上で読めるようにするための中核。
 * @param consumedSec 今日すでに消費した閲覧秒数。
 */
export function describeCurrentState(
  rules: Rule[],
  now: Date,
  global: GlobalSettings,
  consumedSec = 0,
): CurrentStateSummary {
  const summary = buildCurrentState(rules, now, global, consumedSec)
  const inactive = rules.length - filterActiveRules(rules, now, global).length
  if (inactive === 0 || summary.kind === 'free') return summary
  return {
    ...summary,
    lines: [
      ...summary.lines,
      `${inactive} other rule${inactive === 1 ? '' : 's'} applies at different times.`,
    ],
  }
}

/**
 * 現在アクティブなルールだけから状態を組み立てる。
 */
function buildCurrentState(
  rules: Rule[],
  now: Date,
  global: GlobalSettings,
  consumedSec: number,
): CurrentStateSummary {
  if (rules.length === 0) {
    return { kind: 'free', headline: 'No rules configured', lines: [] }
  }

  const active = filterActiveRules(rules, now, global)
  if (active.length === 0) {
    return {
      kind: 'free',
      headline: 'Not restricted right now',
      lines: [
        rules.length === 1
          ? 'The only rule applies at another time — nothing is active at the moment.'
          : `All ${rules.length} rules apply at other times — nothing is active at the moment.`,
      ],
    }
  }

  const blockRule = active.find((rule) => rule.restriction.kind === 'block')
  // 実際に課される制限と説明文が食い違わないよう、縮約は blocking.ts の解決関数へ委ねる。
  const daily = resolveDailyLimitRule(active)
  const wait = resolveEffectiveWait(active)

  if (blockRule) {
    const endsAt = windowEndsAtLabel(blockRule, now)
    const lines = [
      `Block is active (${formatTimeWindow(blockRule.window)}) → ${formatDestination(blockRule.destination)}.`,
      endsAt ? `Access returns at ${endsAt}.` : 'Active all day.',
    ]
    const shadowed = [
      daily ? RULE_KIND_LABELS.dailyLimit : undefined,
      wait ? RULE_KIND_LABELS.wait : undefined,
    ].filter((label): label is string => label !== undefined)
    if (shadowed.length > 0) {
      lines.push(
        `${shadowed.join(', ')} ${shadowed.length === 1 ? 'is' : 'are'} not applied while Block is active.`,
      )
    }
    return { kind: 'blocked', headline: 'Blocked now', lines }
  }

  const destination = formatDestination(daily?.rule?.destination)
  const remainingSec = daily ? Math.max(0, daily.minutes * 60 - consumedSec) : undefined

  if (daily && remainingSec === 0) {
    // ウィンドウを抜けた時点でも解除されるため、終日ルールでない限り両方の可能性を示す。
    const endsAt = windowEndsAtLabel(daily.rule, now)
    return {
      kind: 'blocked',
      headline: 'Blocked now',
      lines: [
        `Daily limit of ${daily.minutes} min is used up → ${destination}.`,
        endsAt
          ? `Access returns when the window ends at ${endsAt}, or at the next daily reset — whichever is first.`
          : 'Resets at the start of the next rule day.',
      ],
    }
  }

  const lines: string[] = []
  let step = 1
  if (wait) {
    lines.push(
      `${step}. Wait ${wait.seconds} sec on the gate page, then browse for ${wait.grantMinutes} min without waiting again.`,
    )
    step += 1
  }
  if (daily && remainingSec !== undefined) {
    lines.push(
      `${step}. Daily limit: ${formatDuration(remainingSec)} left of ${daily.minutes} min. It keeps counting down while you browse${wait ? `, including the ${wait.grantMinutes} min after a wait` : ''}.`,
    )
    step += 1
    lines.push(`${step}. When it reaches 0 → ${destination}.`)
  }

  if (wait) return { kind: 'gated', headline: 'Wait required before access', lines }
  return { kind: 'limited', headline: 'Allowed, with limits', lines }
}

/**
 * 今後7日間を30分刻みでサンプリングし、同時に有効になるルールの組み合わせを検出する。
 * daily / weekly / always は厳密、monthly / period は直近7日分の近似。
 */
function findOverlappingPairs(rules: Rule[], now: Date, global: GlobalSettings): Set<string> {
  const pairs = new Set<string>()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  for (let slot = 0; slot < 7 * 48; slot += 1) {
    const at = new Date(start.getTime() + slot * 30 * 60_000)
    const activeIndexes = rules
      .map((rule, index) => (isWindowActiveAt(rule.window, at, global) ? index : -1))
      .filter((index) => index >= 0)
    for (const a of activeIndexes) {
      for (const b of activeIndexes) {
        if (a < b) pairs.add(`${a}:${b}`)
      }
    }
  }
  return pairs
}

/**
 * 同時に有効になるルールの組み合わせから、結果が直感に反するものを警告文言として返す。
 */
export function describeRuleConflicts(rules: Rule[], now: Date, global: GlobalSettings): string[] {
  const messages = new Set<string>()
  for (const pair of findOverlappingPairs(rules, now, global)) {
    const [a, b] = pair.split(':').map(Number)
    const first = rules[a!]!.restriction
    const second = rules[b!]!.restriction

    if (first.kind === 'block' || second.kind === 'block') {
      const other = first.kind === 'block' ? second : first
      if (other.kind !== 'block') {
        messages.add(
          `Block overlaps with ${RULE_KIND_LABELS[other.kind]}. While Block is active, ${RULE_KIND_LABELS[other.kind]} has no effect.`,
        )
      }
      continue
    }

    if (first.kind !== second.kind) continue

    if (first.kind === 'dailyLimit' && second.kind === 'dailyLimit') {
      messages.add(
        `Two Daily limit rules overlap. The shorter one (${Math.min(first.minutes, second.minutes)} min) is used.`,
      )
    }
    if (first.kind === 'wait' && second.kind === 'wait') {
      // 秒数と許可分数は別々に最長を採るため、片方のルールがまるごと採用されるわけではない。
      messages.add(
        `Two Wait rules overlap. The longer wait (${Math.max(first.seconds, second.seconds)} sec) and the longer allowance (${Math.max(first.grantMinutes, second.grantMinutes)} min) are used, even if they come from different rules.`,
      )
    }
  }
  return [...messages]
}
