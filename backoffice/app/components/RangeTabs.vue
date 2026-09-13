<script setup lang="ts">
import type { AnalyticsRange } from '~/types/api'

/**
 * The dashboard's time range. A segmented control — three mutually exclusive
 * options, all visible, matching the status tabs on the article list.
 */
const model = defineModel<AnalyticsRange>({ required: true })

const OPTIONS: { value: AnalyticsRange, label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]
</script>

<template>
  <div role="radiogroup" aria-label="Time range" class="flex rounded-md border border-border bg-panel p-0.5">
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="rounded px-2.5 py-1 text-[0.8125rem] transition-colors"
      :class="model === option.value
        ? 'bg-bg-sunken font-medium text-fg'
        : 'text-fg-muted hover:text-fg'"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
