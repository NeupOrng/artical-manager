<script setup lang="ts">
import type { AuthorStatus } from '~/types/api'

/**
 * A dot plus a word, like `StatusPill` — but a separate component, not a
 * widened one. That one is typed to `ArticleStatus` and means "can the public
 * see this"; these three mean "can this person get in". One component serving
 * both would have to accept a union of unrelated states, and every future
 * article status would silently become a valid author status.
 *
 * The word is always present and colour only reinforces it: status carried by
 * hue alone is unreadable to anyone who cannot separate the two, and here the
 * states include "this person has access".
 */
defineProps<{ status: AuthorStatus }>()

const STYLE: Record<AuthorStatus, { chip: string, dot: string, label: string }> = {
  active: {
    chip: 'border-border bg-live-surface text-live',
    dot: 'bg-live',
    label: 'Active',
  },
  // Deliberately the draft styling: an unaccepted invite is the same kind of
  // "not yet real" as an unpublished article, and reusing the token keeps the
  // page from inventing a fourth colour nobody has seen before.
  invited: {
    chip: 'border-border bg-draft-surface text-draft',
    dot: 'bg-draft',
    label: 'Invited',
  },
  deactivated: {
    chip: 'border-border bg-surface text-muted',
    dot: 'bg-muted',
    label: 'Deactivated',
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
