<script setup lang="ts">
import type { PublishingPipeline, Readiness } from '~/types/api'

/**
 * What is ready to go, and what is blocking the rest. Each row opens the article
 * list filtered to exactly those drafts — the counts and the list come from one
 * domain rule, so they always agree.
 */
const props = defineProps<{
  pipeline: PublishingPipeline
  /** Contributor view: counts are their own, so the links filter to "mine" too. */
  mine: boolean
}>()

const { relative, absolute } = useRelativeTime()

const rows = computed(() => [
  { readiness: 'ready' as Readiness, label: 'Ready to publish', icon: 'check-circle' as const, count: props.pipeline.ready, blocking: false },
  { readiness: 'needs-excerpt' as Readiness, label: 'Needs an excerpt', icon: 'article' as const, count: props.pipeline.needsExcerpt, blocking: true },
  { readiness: 'needs-cover' as Readiness, label: 'Needs a cover image', icon: 'image' as const, count: props.pipeline.needsCover, blocking: true },
])

const link = (readiness: Readiness) => ({
  path: '/articles',
  query: { readiness, ...(props.mine ? { mine: '1' } : {}) },
})
</script>

<template>
  <ul class="-mx-1.5">
    <li v-for="row in rows" :key="row.readiness">
      <NuxtLink
        :to="link(row.readiness)"
        class="flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-[0.8125rem] transition-colors hover:bg-bg-subtle"
      >
        <span class="flex items-center gap-2" :class="row.count ? 'text-fg' : 'text-fg-muted'">
          <AppIcon :name="row.icon" :size="14" class="text-fg-subtle" />
          {{ row.label }}
        </span>
        <span
          class="tnum rounded-full px-2 py-px text-xs"
          :class="row.blocking && row.count ? 'bg-draft-surface font-medium text-draft' : 'text-fg-muted'"
        >{{ row.count }}</span>
      </NuxtLink>
    </li>
  </ul>
  <p class="mt-2 text-xs text-fg-subtle">
    <template v-if="pipeline.lastPublishedAt">
      Last published <span :title="absolute(pipeline.lastPublishedAt)">{{ relative(pipeline.lastPublishedAt) }}</span>
    </template>
    <template v-else>
      Nothing published yet
    </template>
  </p>
</template>
