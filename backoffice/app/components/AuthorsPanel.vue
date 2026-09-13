<script setup lang="ts">
import type { AuthorActivity } from '~/types/api'

/**
 * Who published what in the range. Sorted by NAME and deliberately unranked —
 * decision D3: this is for an editor to see activity, not a leaderboard.
 */
defineProps<{ authors: AuthorActivity[] }>()

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
</script>

<template>
  <p v-if="!authors.length" class="text-[0.8125rem] text-fg-muted">
    Nobody published in this period.
  </p>
  <ul v-else class="divide-y divide-border">
    <li v-for="author in authors" :key="author.authorId" class="flex items-baseline justify-between gap-3 py-1.5 text-[0.8125rem] first:pt-0 last:pb-0">
      <span class="min-w-0 truncate">{{ author.name }}</span>
      <span class="tnum shrink-0 text-fg-muted">
        {{ author.published }} published<template v-if="author.views !== null"> · {{ compact.format(author.views) }} {{ author.views === 1 ? 'view' : 'views' }}</template>
      </span>
    </li>
  </ul>
</template>
