<script setup lang="ts">
/**
 * A labelled figure, optionally compared with the previous period.
 *
 * Deliberately NOT the hero-metric template — no oversized number, no accent
 * colour on the value. These are reference values an editor glances at on the
 * way to the chart and tables below.
 *
 * `value` is typed as a number so a caller cannot pass the raw
 * bigint-as-string Postgres returns for count() without it being obvious. Null
 * renders as an em dash: "not known" must never look like zero.
 *
 * The comparison is text first ("+18% vs prior 30 days"); the icon and its
 * colour repeat it, never replace it.
 */
const props = withDefaults(
  defineProps<{
    label: string
    value: number | null
    /** Optional qualifier beneath the figure. Replaced by the comparison when one is given. */
    hint?: string
    delta?: { current: number, previous: number } | null
    /** e.g. "prior 30 days" */
    period?: string
  }>(),
  { hint: undefined, delta: null, period: 'prior period' },
)

const change = computed(() => {
  const d = props.delta
  if (!d) return null
  if (d.previous === 0) {
    return d.current === 0
      ? { text: `Same as ${props.period}`, direction: 0 }
      : { text: `None in ${props.period}`, direction: 0 }
  }
  const pct = Math.round(((d.current - d.previous) / d.previous) * 100)
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return { text: `${sign}${Math.abs(pct)}% vs ${props.period}`, direction: Math.sign(pct) }
})
</script>

<template>
  <div class="px-4 py-3">
    <dt class="text-[0.8125rem] text-fg-muted">
      {{ label }}
    </dt>
    <dd class="tnum mt-1 text-xl font-semibold">
      {{ value === null ? '—' : value.toLocaleString() }}
    </dd>
    <p
      v-if="change"
      class="mt-0.5 flex items-center gap-1 text-xs"
      :class="change.direction > 0 ? 'text-live' : change.direction < 0 ? 'text-danger' : 'text-fg-subtle'"
    >
      <AppIcon v-if="change.direction > 0" name="trend-up" :size="12" />
      <AppIcon v-else-if="change.direction < 0" name="trend-down" :size="12" />
      {{ change.text }}
    </p>
    <p v-else-if="hint" class="mt-0.5 text-xs text-fg-subtle">
      {{ hint }}
    </p>
  </div>
</template>
