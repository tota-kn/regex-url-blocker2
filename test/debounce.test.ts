import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from '../utils/debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('wait ミリ秒経過するまで呼ばれない', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d()
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('連続呼び出しは最後の引数で1回だけ実行', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('a')
    d('b')
    d('c')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('間隔を空けた呼び出しはそれぞれ実行', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('a')
    vi.advanceTimersByTime(300)
    d('b')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(1, 'a')
    expect(fn).toHaveBeenNthCalledWith(2, 'b')
  })
})
