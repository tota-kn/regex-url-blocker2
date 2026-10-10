<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { createChallengeText } from '@/utils/accessChallenge'
import type { AccessChallenge } from '@/utils/types'

/** 実行する操作課題。親は課題切替時にkeyを変えて進捗を初期化する。 */
const props = defineProps<{ challenge: AccessChallenge }>()
const emit = defineEmits<{ complete: [] }>()
const { t } = useI18n()
const entered = ref('')
const text = ref(createChallengeText(props.challenge.length))
const completed = ref(0)
const mismatch = ref(false)

/** 完全一致した文字列だけを数え、次の文字列を生成する。 */
function checkText(): void {
  mismatch.value = entered.value !== text.value
  if (mismatch.value) return
  completed.value++
  if (completed.value >= props.challenge.count) emit('complete')
  else text.value = createChallengeText(props.challenge.length)
  entered.value = ''
}
</script>

<template>
  <form class="mt-6 space-y-3" @submit.prevent="checkText">
    <p class="text-body-sm text-muted-foreground">
      {{ t('Strings remaining: {count}', { count: challenge.count - completed }) }}
    </p>
    <p
      :aria-label="t('String to enter')"
      class="select-none break-all rounded-lg border border-border bg-surface-muted p-3 font-mono text-body-md"
    >
      {{ text }}
    </p>
    <label class="block space-y-1 text-body-sm">
      <span>{{ t('Enter the string') }}</span>
      <BaseInput
        v-model="entered"
        :aria-label="t('Enter the string')"
        class="w-full font-mono"
        autocomplete="off"
        autocapitalize="off"
        :spellcheck="false"
        @paste.prevent
        @drop.prevent
      />
    </label>
    <p v-if="mismatch" role="alert" class="text-body-sm text-danger">
      {{ t('The string does not match.') }}
    </p>
    <BaseButton type="submit">{{ t('Check') }}</BaseButton>
  </form>
</template>
