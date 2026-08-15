<script setup lang="ts">
/** 真偽ラジオグループのprops。 */
interface Props {
  /** 各radioのaria-label先頭部分。 */
  label: string
  /** Onを先に表示するか。 */
  onFirst?: boolean
}

withDefaults(defineProps<Props>(), { onFirst: false })
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-4">
    <template v-for="value in onFirst ? [true, false] : [false, true]" :key="String(value)">
      <label class="inline-flex items-center gap-2 text-label-md text-secondary-foreground">
        <input
          v-model="model"
          type="radio"
          class="size-4 border-border text-primary focus:ring-2 focus:ring-ring"
          :aria-label="`${label} ${value ? 'On' : 'Off'}`"
          :value="value"
        />
        <span>{{ value ? 'On' : 'Off' }}</span>
      </label>
    </template>
  </div>
</template>
