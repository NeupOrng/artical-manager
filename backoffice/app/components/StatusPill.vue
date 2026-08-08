<script setup lang="ts">
import type { ArticleStatus } from '~/types/api'

defineProps<{ status: ArticleStatus }>()

/**
 * A dot plus a word.
 *
 * The word is always present and colour only reinforces it. Status conveyed by
 * a coloured dot alone is unreadable to anyone who cannot separate the two hues
 * — and here the two states are "the public can see this" and "they cannot",
 * so getting it wrong publishes the wrong thing. PRODUCT.md principle 2.
 */
const STYLE: Record<ArticleStatus, { chip: string, dot: string, label: string }> = {
  published: {
    chip: 'border-border bg-live-surface text-live',
    dot: 'bg-live',
    label: 'Published',
  },
  draft: {
    chip: 'border-border bg-draft-surface text-draft',
    dot: 'bg-draft',
    label: 'Draft',
  },
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
    :class="STYLE[status].chip"
  >
    <span class="size-1.5 rounded-full" :class="STYLE[status].dot" aria-hidden="true" />
    {{ STYLE[status].label }}
  </span>
</template>
