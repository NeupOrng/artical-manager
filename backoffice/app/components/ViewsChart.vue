<script setup lang="ts">
/**
 * Views per day, with a dot on each day something was published.
 *
 * Hand-drawn SVG — one area, one line, a few labels — rather than a chart
 * library: decision M5 in docs/proposals/dashboard-analytics-umami.md. Colours
 * are theme tokens, so dark mode needs nothing extra.
 *
 * The dots answer the question this chart exists for: did publishing that
 * piece bring readers?
 *
 * Accessible three ways: a text summary on the SVG, arrow-key exploration with
 * an announced readout, and a visually hidden table of every day.
 */
const props = defineProps<{
  days: { date: string, views: number }[]
  published: { date: string, count: number }[]
}>()

const W = 720
const H = 200
const PAD = { l: 40, r: 10, t: 14, b: 26 }
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b

/** A round ceiling, so the gridlines land on numbers people read at a glance. */
function niceMax(v: number): number {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

const max = computed(() => niceMax(Math.max(0, ...props.days.map(d => d.views))))
const last = computed(() => Math.max(1, props.days.length - 1))
const x = (i: number) => PAD.l + (i * plotW) / last.value
const y = (v: number) => PAD.t + plotH - (v / max.value) * plotH

const line = computed(() =>
  props.days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.views).toFixed(1)}`).join(' '))
const area = computed(() =>
  `${line.value} L${x(props.days.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`)

const publishedOn = computed(() => new Map(props.published.map(p => [p.date, p.count])))
const markers = computed(() =>
  props.days.flatMap((d, i) => (publishedOn.value.get(d.date) ?? 0) > 0 ? [i] : []))

const total = computed(() => props.days.reduce((t, d) => t + d.views, 0))

/** Dates arrive as local YYYY-MM-DD already; format them without shifting zones. */
const label = (date: string, extra: Intl.DateTimeFormatOptions = {}) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', ...extra })

const ticks = computed(() => {
  const n = props.days.length
  if (!n) return []
  return [...new Set([0, Math.floor((n - 1) / 2), n - 1])].map(i => ({ i, text: label(props.days[i]!.date) }))
})

// ── Exploration ────────────────────────────────────────────────────────────

const active = ref<number | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const clamp = (i: number) => Math.min(Math.max(i, 0), props.days.length - 1)

function onPointer(event: PointerEvent) {
  const rect = svg.value?.getBoundingClientRect()
  if (!rect?.width) return
  const px = ((event.clientX - rect.left) / rect.width) * W
  active.value = clamp(Math.round(((px - PAD.l) / plotW) * last.value))
}

function onKey(event: KeyboardEvent) {
  const n = props.days.length
  const current = active.value ?? n - 1
  const next = ({ ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: n - 1 } as Record<string, number>)[event.key]
  if (next === undefined) return
  event.preventDefault()
  active.value = clamp(next)
}

const readout = computed(() => {
  if (active.value === null) return null
  const day = props.days[active.value]
  if (!day) return null
  const count = publishedOn.value.get(day.date) ?? 0
  return {
    // Kept away from the edges so the readout never clips.
    left: `clamp(4.5rem, ${((x(active.value) / W) * 100).toFixed(2)}%, calc(100% - 4.5rem))`,
    date: label(day.date, { weekday: 'short' }),
    views: day.views,
    published: count,
  }
})
</script>

<template>
  <div class="relative">
    <svg
      ref="svg"
      :viewBox="`0 0 ${W} ${H}`"
      class="block h-auto w-full touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      role="img"
      tabindex="0"
      :aria-label="`Views per day over ${days.length} days, ${total.toLocaleString()} in total. Use the arrow keys to read individual days.`"
      @pointermove="onPointer"
      @pointerleave="active = null"
      @keydown="onKey"
      @focus="active ??= days.length - 1"
      @blur="active = null"
    >
      <!-- Gridlines at zero, half and the rounded maximum. -->
      <g v-for="v in [0, max / 2, max]" :key="v">
        <line :x1="PAD.l" :x2="W - PAD.r" :y1="y(v)" :y2="y(v)" class="stroke-border" :stroke-dasharray="v === 0 ? undefined : '3 4'" />
        <text :x="PAD.l - 8" :y="y(v) + 4" text-anchor="end" class="tnum fill-fg-subtle text-[11px]">{{ v.toLocaleString() }}</text>
      </g>

      <path :d="area" class="fill-accent-subtle" />
      <path :d="line" fill="none" class="stroke-accent" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Publish markers sit on the baseline, under the line they explain. -->
      <circle
        v-for="i in markers"
        :key="`m${i}`"
        :cx="x(i)"
        :cy="y(0)"
        r="4"
        class="fill-fg stroke-panel"
        stroke-width="2"
      />

      <g v-if="active !== null">
        <line :x1="x(active)" :x2="x(active)" :y1="PAD.t" :y2="y(0)" class="stroke-border-strong" />
        <circle :cx="x(active)" :cy="y(days[active]?.views ?? 0)" r="3.5" class="fill-accent stroke-panel" stroke-width="2" />
      </g>

      <text
        v-for="t in ticks"
        :key="`t${t.i}`"
        :x="x(t.i)"
        :y="H - 6"
        :text-anchor="t.i === 0 ? 'start' : t.i === days.length - 1 ? 'end' : 'middle'"
        class="fill-fg-subtle text-[11px]"
      >{{ t.text }}</text>
    </svg>

    <div
      v-if="readout"
      class="pointer-events-none absolute top-1 -translate-x-1/2 rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs shadow-sm"
      :style="{ left: readout.left }"
      aria-hidden="true"
    >
      <p class="text-fg-muted">
        {{ readout.date }}
      </p>
      <p class="tnum font-medium">
        {{ readout.views.toLocaleString() }} {{ readout.views === 1 ? 'view' : 'views' }}
      </p>
      <p v-if="readout.published" class="text-fg-muted">
        {{ readout.published }} published
      </p>
    </div>

    <!-- Announces keyboard exploration; the visual readout above is hidden from AT. -->
    <p class="sr-only" aria-live="polite">
      <template v-if="readout">
        {{ readout.date }}: {{ readout.views }} views<template v-if="readout.published">, {{ readout.published }} published</template>
      </template>
    </p>

    <p
      v-if="total === 0"
      class="pointer-events-none absolute inset-0 grid place-items-center text-[0.8125rem] text-fg-muted"
    >
      No views recorded in this period
    </p>

    <table class="sr-only">
      <caption>Views per day</caption>
      <thead>
        <tr><th scope="col">Date</th><th scope="col">Views</th><th scope="col">Published</th></tr>
      </thead>
      <tbody>
        <tr v-for="d in days" :key="d.date">
          <td>{{ label(d.date, { year: 'numeric' }) }}</td>
          <td>{{ d.views }}</td>
          <td>{{ publishedOn.get(d.date) ?? 0 }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
