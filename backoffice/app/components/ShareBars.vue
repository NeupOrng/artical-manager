<script setup lang="ts">
/**
 * A ranked list of shares — views by category, views by source.
 *
 * Bars rather than a pie: a handful of rows compared by length reads at a
 * glance; angles do not. The percentage is text; the bar repeats it.
 */
defineProps<{
  items: { key: string, label: string, value: number, share: number, note?: string }[]
  emptyText: string
}>()

const pct = (share: number) => {
  const p = share * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}
</script>

<template>
  <p v-if="!items.length" class="text-[0.8125rem] text-fg-muted">
    {{ emptyText }}
  </p>
  <ul v-else class="space-y-2.5">
    <li v-for="item in items" :key="item.key" :title="`${item.value.toLocaleString()} views`">
      <div class="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span class="min-w-0 truncate">
          {{ item.label }}
          <span v-if="item.note" class="text-xs text-fg-subtle">{{ item.note }}</span>
        </span>
        <span class="tnum shrink-0 text-fg-muted">{{ pct(item.share) }}</span>
      </div>
      <div class="mt-1 h-1.5 rounded-full bg-bg-sunken" aria-hidden="true">
        <div class="h-full rounded-full bg-accent" :style="{ width: `${Math.max(item.share * 100, 1.5)}%` }" />
      </div>
    </li>
  </ul>
</template>
