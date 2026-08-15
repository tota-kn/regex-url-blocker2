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

  it('returns visible exact and nested validation messages', () => {
    const feedback = useValidationFeedback()
    const errors = [
      { field: 'name', message: 'Name required' },
      { field: 'rules[0].window', message: 'Window required' },
    ]

    feedback.touch('rules[0]')
    expect(feedback.messageFor(errors, 'name')).toBeUndefined()
    expect(feedback.messageForPrefix(errors, 'rules[0].')).toBe('Window required')
    feedback.showAllErrors()
    expect(feedback.messageFor(errors, 'name')).toBe('Name required')
  })
})
