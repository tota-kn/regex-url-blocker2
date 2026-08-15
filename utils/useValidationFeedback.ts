import { ref } from 'vue'
import type { ValidationError } from './validation'

/**
 * フォームの検証メッセージを表示するタイミングを管理する。
 *
 * フィールドを編集した後はそのフィールドだけを表示し、保存を試みた後は
 * フォーム内のすべてのエラーを表示する。配列・ネストしたパスでは、親パスを
 * touch するとその配下のフィールドも対象になる。
 */
export function useValidationFeedback() {
  const touchedFields = ref(new Set<string>())
  const saveAttempted = ref(false)

  /** 指定フィールドを編集済みとして記録する。 */
  function touch(field: string): void {
    touchedFields.value = new Set(touchedFields.value).add(field)
  }

  /** 保存試行後、フォーム内の全エラーを表示する。 */
  function showAllErrors(): void {
    saveAttempted.value = true
  }

  /** 指定フィールドのエラーを現在表示すべきかを返す。 */
  function shouldShow(field: string): boolean {
    if (saveAttempted.value) return true
    return [...touchedFields.value].some(
      (touched) =>
        field === touched || field.startsWith(`${touched}.`) || field.startsWith(`${touched}[`),
    )
  }

  /** 新しいフォーム編集を開始するために表示状態を初期化する。 */
  function reset(): void {
    touchedFields.value = new Set()
    saveAttempted.value = false
  }

  /** 完全一致するフィールドの表示対象エラーメッセージを返す。 */
  function messageFor(errors: ValidationError[], field: string): string | undefined {
    const error = errors.find((candidate) => candidate.field === field)
    return error && shouldShow(error.field) ? error.message : undefined
  }

  /** 指定prefix配下で最初の表示対象エラーメッセージを返す。 */
  function messageForPrefix(errors: ValidationError[], prefix: string): string | undefined {
    const error = errors.find((candidate) => candidate.field.startsWith(prefix))
    return error && shouldShow(error.field) ? error.message : undefined
  }

  return { touch, showAllErrors, shouldShow, reset, messageFor, messageForPrefix }
}
