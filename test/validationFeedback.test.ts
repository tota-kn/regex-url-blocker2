import { describe, expect, it } from 'vitest'
import { useValidationFeedback } from '../utils/useValidationFeedback'

describe('useValidationFeedback', () => {
  it('shows only touched fields until save is attempted, including nested paths', () => {
    const feedback = useValidationFeedback()

    expect(feedback.shouldShow('name')).toBe(false)
    feedback.touch('restrictions[0]')
    expect(feedback.shouldShow('restrictions[0].waitSeconds')).toBe(true)
    expect(feedback.shouldShow('name')).toBe(false)

    feedback.showAllErrors()
    expect(feedback.shouldShow('name')).toBe(true)
  })
})
