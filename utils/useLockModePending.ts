import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { getPendingGroupFieldKeys, resolveEffectiveGroup } from './effectiveSettings'
import type { Group } from './types'

/** Lock Modeの保留状態と実効groupをリアクティブに算出する。 */
export function useLockModePending(
  effectiveGroup: MaybeRefOrGetter<Group | undefined>,
  preferredGroup: MaybeRefOrGetter<Group>,
  appliesAfterLabel: MaybeRefOrGetter<string | undefined>,
) {
  const pendingFieldKeys = computed<Array<keyof Group>>(() => {
    const effective = toValue(effectiveGroup)
    return effective ? getPendingGroupFieldKeys(effective, toValue(preferredGroup)) : []
  })
  const resolvedGroup = computed(() => {
    const effective = toValue(effectiveGroup)
    const preferred = toValue(preferredGroup)
    return effective ? resolveEffectiveGroup(effective, preferred) : preferred
  })
  const pendingUntilLabel = computed(() => {
    const label = toValue(appliesAfterLabel)
    return label ? `until ${label}` : 'until the next rule day'
  })

  /** 指定フィールドがLock Modeにより保留中ならtrue。 */
  function isFieldPending(key: keyof Group): boolean {
    return pendingFieldKeys.value.includes(key)
  }

  return { pendingFieldKeys, resolvedGroup, pendingUntilLabel, isFieldPending }
}
