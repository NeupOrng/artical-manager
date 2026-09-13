<script setup lang="ts">
/**
 * An article's view count.
 *
 * Loads after paint (see useArticleViews), so it renders a reserved space
 * first. The space is reserved rather than left empty because the number
 * appearing must not push the surrounding meta row sideways — a value that
 * arrives late and shifts layout is worse than no value.
 */
const props = withDefaults(
  defineProps<{ articleId: string, size?: 'sm' | 'md' }>(),
  { size: 'sm' },
)

const { track, countFor } = useArticleViews()

// Registers this id for the batched fetch. Called during setup so every card in
// one render coalesces into a single request.
track(props.articleId)

const count = computed(() => countFor(props.articleId))

// Compact above 1000: "1.2K" rather than "1,203". A view count is a magnitude,
// not a figure anyone needs to the unit.
const formatter = new Intl.NumberFormat('en-GB', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const label = computed(() =>
  count.value === null ? null : formatter.format(count.value),
)

// Screen readers get the real number and the noun, not "1.2K".
const accessibleLabel = computed(() =>
  count.value === null
    ? ''
    : `${count.value.toLocaleString('en-GB')} ${count.value === 1 ? 'view' : 'views'}`,
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 tabular-nums"
    :class="size === 'md' ? 'text-[0.9rem]' : 'text-[0.8rem]'"
  >
    <svg
      class="shrink-0"
      :class="size === 'md' ? 'size-4' : 'size-3.5'"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      aria-hidden="true"
    >
      <path d="M1.7 10S4.6 4.6 10 4.6 18.3 10 18.3 10 15.4 15.4 10 15.4 1.7 10 1.7 10Z" stroke-linejoin="round" />
      <circle cx="10" cy="10" r="2.6" />
    </svg>

    <!--
      The placeholder holds the same width as a short number so the row does
      not reflow when the real value lands.
    -->
    <span v-if="label === null" class="inline-block w-5 opacity-0" aria-hidden="true">—</span>

    <template v-else>
      <span aria-hidden="true">{{ label }}</span>
      <span class="sr-only">{{ accessibleLabel }}</span>
    </template>
  </span>
</template>
