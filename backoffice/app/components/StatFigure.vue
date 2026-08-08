<script setup lang="ts">
/**
 * A labelled count.
 *
 * Deliberately NOT the hero-metric template — no oversized number, no accent
 * colour, no supporting sparkline. These are reference values an editor glances
 * at on the way to the table below; the table is the page. A dashboard whose
 * numbers shout is a dashboard whose numbers get ignored.
 *
 * `value` is typed as a number so a caller cannot pass the raw
 * bigint-as-string Postgres returns for count() without it being obvious.
 */
withDefaults(
  defineProps<{
    label: string
    value: number
    /** Optional qualifier beneath the figure. */
    hint?: string
  }>(),
  { hint: undefined },
)
</script>

<template>
  <div class="px-4 py-3">
    <dt class="text-[0.8125rem] text-fg-muted">
      {{ label }}
    </dt>
    <dd class="tnum mt-1 text-xl font-semibold">
      {{ value.toLocaleString() }}
    </dd>
    <p v-if="hint" class="mt-0.5 text-xs text-fg-subtle">
      {{ hint }}
    </p>
  </div>
</template>
