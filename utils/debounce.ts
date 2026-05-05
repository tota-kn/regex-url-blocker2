/**
 * 連続呼び出しから `wait` ミリ秒静かになった後で1回だけ実行する debounce 関数を返す。
 * 最後の呼び出しの引数が採用される。
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Args) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, wait)
  }
}
