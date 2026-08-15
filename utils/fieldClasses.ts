/** 入力コントロールの表示モード。 */
export type FieldDisplay = 'editable' | 'readonly'

/** 入力コントロールの状態クラスを選ぶための設定。 */
export interface FieldStateOptions {
  /** 編集可能か読み取り表示か。 */
  display?: FieldDisplay
  /** 操作を無効化しているか。 */
  disabled?: boolean
  /** 入力値が不正か。 */
  invalid?: boolean
}

/** 共通の入力状態に対応する Tailwind クラスを返す。 */
export function fieldStateClasses(options: FieldStateOptions): string {
  if (options.display === 'readonly') {
    return 'cursor-default border-transparent bg-field-readonly text-input-foreground disabled:opacity-100'
  }
  if (options.disabled) {
    return 'border-field-border bg-field-disabled text-muted-foreground'
  }
  if (options.invalid) {
    return 'border-danger-border bg-field text-input-foreground focus:border-danger focus:ring-2 focus:ring-danger-border/70 hover:bg-field-hover'
  }
  return 'border-field-border bg-field text-input-foreground focus:border-primary focus:ring-2 focus:ring-ring hover:bg-field-hover hover:border-field-border-hover'
}
