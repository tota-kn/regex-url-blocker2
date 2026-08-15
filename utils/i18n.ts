import { createI18n, type I18n } from 'vue-i18n'
import type { App } from 'vue'
import type { LanguagePreference } from './types'

/** 拡張機能内で利用する解決済み言語。 */
export type AppLocale = 'en' | 'ja'

/** 日本語翻訳。キーはVue側に表示する英語原文そのものとする。 */
export const jaMessages = {
  'General settings': '一般設定',
  'Options sections': '設定セクション',
  'General settings has errors': '一般設定にエラーがあります',
  Language: '言語',
  'Automatic (browser language)': '自動（ブラウザの言語）',
  English: 'English',
  Japanese: '日本語',
  Groups: 'グループ',
  '{count} group | {count} groups': '{count}グループ',
  'Group {number}': 'グループ {number}',
  'Add group': 'グループを追加',
  'Add Group': 'グループを追加',
  'Create group': 'グループを作成',
  Cancel: 'キャンセル',
  'Cancel create group': 'グループ作成をキャンセル',
  'No groups': 'グループなし',
  'No groups yet': 'グループはまだありません',
  Name: '名前',
  'New group': '新しいグループ',
  Paused: '一時停止中',
  Restore: '復元',
  'Restore group': 'グループを復元',
  Edit: '編集',
  'Edit group': 'グループを編集',
  'Group actions': 'グループ操作',
  Enable: '有効化',
  Disable: '無効化',
  Duplicate: '複製',
  'Duplicate group': 'グループを複製',
  Delete: '削除',
  'Delete group': 'グループを削除',
  'Group details': 'グループの詳細',
  'Remaining time today': '今日の残り時間',
  'Cancel group': 'グループ編集をキャンセル',
  'Save group': 'グループを保存',
  Save: '保存',
  'URL patterns': 'URLパターン',
  'URL pattern': 'URLパターン',
  'Delete pattern': 'パターンを削除',
  'Add URL pattern': 'URLパターンを追加',
  Rules: 'ルール',
  'Add rule': 'ルールを追加',
  'Remove rule {number}': 'ルール{number}を削除',
  'Rule {number}': 'ルール{number}',
  'Rule {number} when': 'ルール{number}の適用日時',
  'Rule {number} restriction': 'ルール{number}の制限',
  'Rule {number} daily limit minutes': 'ルール{number}の日次上限（分）',
  'Rule {number} wait seconds': 'ルール{number}の待機秒数',
  'Rule {number} grant minutes': 'ルール{number}の許可時間（分）',
  'Rule {number} destination': 'ルール{number}の遷移先',
  'Rule {number} destination URL': 'ルール{number}の遷移先URL',
  Always: '常時',
  'Every day': '毎日',
  Weekly: '毎週',
  Monthly: '毎月',
  'Date range': '期間指定',
  'Block access': 'アクセスをブロック',
  'Wait before access': 'アクセス前に待機',
  'min per day': '分／日',
  'sec, then allow': '秒待機後、許可',
  min: '分',
  sec: '秒',
  'When blocked, go to': 'ブロック時の遷移先',
  'Blocked page': 'ブロックページ',
  'Another URL': '別のURL',
  Days: '曜日',
  'Time window days of month': '毎月の適用日',
  'of every month': '（毎月）',
  'Time window period start': '期間の開始日',
  'Time window period end': '期間の終了日',
  'every year': '（毎年）',
  'Active during': '適用時間帯',
  'Active time ranges': '適用時間帯',
  'No rules yet. This group does nothing until you add one.':
    'ルールはまだありません。追加するまで、このグループは何もしません。',
  Options: 'オプション',
  'Advanced settings': '詳細設定',
  'Delay relaxed restrictions until next rule day': '制限の緩和を次のルール日まで延期',
  'Pause settings': '一時停止設定',
  Pause: '一時停止',
  'Allow Pause': '一時停止を許可',
  On: 'オン',
  Off: 'オフ',
  'Not allowed': '許可しない',
  'Take a short break before temporarily disabling this group.':
    'このグループを一時的に無効化する前に短い休憩を取ります。',
  'Wait seconds before pausing': '一時停止までの待機秒数',
  'Pause for': '一時停止時間',
  'Pause duration minutes': '一時停止する分数',
  'This group stays enforced {until}.': 'このグループは{until}まで引き続き適用されます。',
  'Earlier URL patterns stay active {until}.': '以前のURLパターンは{until}まで有効です。',
  'Earlier rules stay active {until}.': '以前のルールは{until}まで有効です。',
  'Stricter changes apply immediately. Relaxed restrictions take effect on the next rule day.':
    '制限を強める変更はすぐに適用されます。制限の緩和は次のルール日に反映されます。',
  'Still on {until}.': '{until}までオンのままです。',
  'Still not allowed {until}.': '{until}まで許可されません。',
  'Still {value} sec {until}.': '{until}まで{value}秒のままです。',
  'Still {value} min {until}.': '{until}まで{value}分のままです。',
  'Wait {seconds} sec, pause for {minutes} min': '{seconds}秒待機し、{minutes}分一時停止',
  'Blank group': '空のグループ',
  'Start with no URL patterns or blocking rules.':
    'URLパターンやブロックルールがない状態から始めます。',
  'Core social 15 min/day': '主要SNS 15分／日',
  'Start with core social networks and a 15-minute daily limit.':
    '主要SNSと15分の日次上限から始めます。',
  'Video 30 min/day': '動画 30分／日',
  'Start with video sites and a 30-minute daily limit.': '動画サイトと30分の日次上限から始めます。',
  'Work hours focus': '勤務時間に集中',
  'Block matching URLs on weekdays from 09:00 to 18:00.':
    '平日の09:00から18:00まで一致するURLをブロックします。',
  'Create blank group': '空のグループを作成',
  'Create group from core social 15 min/day template':
    '主要SNS 15分／日のテンプレートからグループを作成',
  'Create group from video 30 min/day template': '動画 30分／日のテンプレートからグループを作成',
  'Create group from work hours focus template': '勤務時間に集中テンプレートからグループを作成',
  '{label} summary': '{label}の概要',
  '{time} left': '残り{time}',
  'Take a breath': 'ひと呼吸おきましょう',
  'Stay here for {seconds} seconds before pausing this group.':
    'このグループを一時停止する前に、ここで{seconds}秒お待ちください。',
  Ready: '準備完了',
  '{seconds}s remaining': '残り{seconds}秒',
  'Pause {minutes} min': '{minutes}分間一時停止',
  'Paused {time}': '一時停止中 {time}',
  'Pause {time} left': '一時停止まで残り{time}',
  'Pause ready': '一時停止できます',
  '{name} copy': '{name} のコピー',
  'Weekly {days}': '毎週 {days}',
  'Monthly {days}': '毎月 {days}',
  'Allow {minutes} min per day': '1日{minutes}分まで許可',
  'Wait {seconds} sec, then allow {minutes} min': '{seconds}秒待機後、{minutes}分許可',
  'blocked page': 'ブロックページ',
  'Delete group?': 'グループを削除しますか？',
  'Confirm delete': '削除を確認',
  'How overlapping rules are applied': '重複するルールの適用方法',
  'Earlier active groups': '以前から有効なグループ',
  'Earlier restrictions still active': '以前の制限がまだ有効です',
  'These groups were removed from saved settings, but remain active until the next rule day. Restore one to edit it again.':
    'これらのグループは保存設定から削除されていますが、次のルール日まで有効です。再編集するには復元してください。',
  'Open options': '設定を開く',
  'Page blocked': 'ページがブロックされました',
  'This page was blocked by Regex URL Guard.':
    'このページは Regex URL Guard によってブロックされました。',
  'Blocked URL': 'ブロックされたURL',
  Unknown: '不明',
  'Loading...': '読み込み中...',
  'Blocking details': 'ブロックの詳細',
  'Unknown setting': '不明な設定',
  'Unblocks at': 'ブロック解除日時',
  'Resets at': 'リセット日時',
  'Not scheduled': '予定なし',
  'No active reason found.': '有効な理由が見つかりません。',
  Back: '戻る',
  'Take a moment': '少し待ちましょう',
  'This page is gated by "{group}". Wait before continuing.':
    'このページは「{group}」によって待機が必要です。続行する前にお待ちください。',
  'This page is gated by Regex URL Guard. Wait before continuing.':
    'このページは Regex URL Guard によって待機が必要です。続行する前にお待ちください。',
  'Wait countdown': '待機カウントダウン',
  'Time remaining': '残り時間',
  'Remaining seconds': '残り秒数',
  'Waiting URL': '待機中のURL',
  'After the countdown you can browse for {minutes} min without waiting again. Any daily limit on this group keeps counting down during that time.':
    'カウントダウン後は、再度待つことなく{minutes}分間閲覧できます。その間も、このグループの日次上限は消費されます。',
  Continue: '続行',
  'This page is excluded from blocking.': 'このページはブロック対象外です。',
  'No matching groups for this page.': 'このページに一致するグループはありません。',
  'No active limits apply to this page.': 'このページに適用中の制限はありません。',
  'Active limits for this page': 'このページに適用中の制限',
  'Blocked now': '現在ブロック中',
  'Remaining time for {group}': '{group}の残り時間',
  'Start a new rule day at this time': '新しいルール日を開始する時刻',
  'Cannot change while any group has Lock Mode enabled or pending.':
    'Lock Mode が有効または保留中のグループがある間は変更できません。',
  Notification: '通知',
  'Notify me before the daily limit is reached': '日次上限に達する前に通知する',
  'Notify me': '通知する',
  'Minutes before daily limit warning': '日次上限の警告までの分数',
  'min before the daily limit is reached': '分前に日次上限を通知',
  Enabled: '有効',
  Disabled: '無効',
  'Unable to check': '確認できません',
  'Allow this extension in Incognito': 'シークレットモードでこの拡張機能を許可',
  'Incognito access:': 'シークレットモードでのアクセス：',
  'Open Chrome extension settings': 'Chrome の拡張機能設定を開く',
  'Settings file': '設定ファイル',
  'Export settings': '設定をエクスポート',
  'Import settings': '設定をインポート',
  'Settings JSON file': '設定JSONファイル',
  'Import replaces all groups and general settings.':
    'インポートすると、すべてのグループと一般設定が置き換わります。',
  Sunday: '日曜日',
  Monday: '月曜日',
  Tuesday: '火曜日',
  Wednesday: '水曜日',
  Thursday: '木曜日',
  Friday: '金曜日',
  Saturday: '土曜日',
  Sun: '日',
  Mon: '月',
  Tue: '火',
  Wed: '水',
  Thu: '木',
  Fri: '金',
  Sat: '土',
  'All day': '終日',
  Block: 'ブロック',
  'Daily limit': '日次上限',
  Wait: '待機',
  'Wait {seconds} sec': '{seconds}秒待機',
  'Regex URL Guard - Options': 'Regex URL Guard - 設定',
  'Please wait': 'お待ちください',
  'Enter a name.': '名前を入力してください。',
  'Enter a valid URL pattern or regular expression.':
    '有効なURLパターンまたは正規表現を入力してください。',
  'Enter a valid URL, including http:// or https://.':
    'http:// または https:// を含む有効なURLを入力してください。',
  'Enter a whole number of 0 or greater.': '0以上の整数を入力してください。',
  'Enter a whole number of 1 or greater.': '1以上の整数を入力してください。',
  'Enter a time in HH:MM format (00:00–23:59).':
    'HH:MM形式（00:00〜23:59）で時刻を入力してください。',
  'Enter time ranges as HH:MM-HH:MM, separated by commas.':
    '時間帯をHH:MM-HH:MM形式で、カンマ区切りで入力してください。',
  'Select at least one day of the week.': '曜日を1つ以上選択してください。',
  'Enter one or more days from 1 to 31, separated by commas.':
    '1〜31の日付を1つ以上、カンマ区切りで入力してください。',
  'Enter a valid date in MM/DD format.': 'MM/DD形式で有効な日付を入力してください。',
  'Add at least one URL pattern.': 'URLパターンを1つ以上追加してください。',
  'Add at least one rule.': 'ルールを1つ以上追加してください。',
  '{group}: {minutes} remaining today.': '{group}：今日の残り時間は{minutes}です。',
  '{count} minute | {count} minutes': '{count}分',
  'Regex URL Guard - remaining {time}': 'Regex URL Guard - 残り {time}',
} as const

/** 英語カタログ。同じキー集合を英語原文へ写像する。 */
export const enMessages = Object.fromEntries(
  Object.keys(jaMessages).map((key) => [key, key]),
) as Record<keyof typeof jaMessages, string>

/** 設定値とブラウザUI言語から実際に表示する言語を決める。 */
export function resolveLocale(preference: LanguagePreference, uiLanguage = 'en'): AppLocale {
  if (preference === 'en' || preference === 'ja') return preference
  return uiLanguage.toLowerCase().split(/[-_]/)[0] === 'ja' ? 'ja' : 'en'
}

const initialUiLanguage =
  typeof browser === 'undefined' || !browser.i18n ? 'en' : browser.i18n.getUILanguage()
export const i18n = createI18n({
  legacy: false,
  locale: resolveLocale('auto', initialUiLanguage),
  fallbackLocale: 'en',
  messages: { en: enMessages, ja: jaMessages },
})

/** 現在の表示言語を変更する。 */
export function setLanguage(preference: LanguagePreference, uiLanguage = initialUiLanguage): void {
  i18n.global.locale.value = resolveLocale(preference, uiLanguage)
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.global.locale.value
}

/** Vueアプリへ共通i18nプラグインを登録する。 */
export function installI18n(app: App): void {
  app.use(i18n as I18n)
}

/** Vue外から現在言語で翻訳する。 */
export function translate(key: string, params?: Record<string, unknown>): string {
  return i18n.global.t(key, params ?? {})
}

/** 保存済み設定を読み、ページ起動前に言語を適用する。 */
export async function initializeLanguage(): Promise<void> {
  const raw = (await browser.storage.sync.get('global')) as {
    global?: { language?: LanguagePreference }
  }
  setLanguage(raw.global?.language ?? 'auto')
}
