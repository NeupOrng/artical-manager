<script setup lang="ts">
/**
 * Shown when a listing fetch fails.
 *
 * This exists because the alternative is worse: an empty array and an error are
 * indistinguishable to a `v-if="!articles.length"`, so a backend outage renders
 * as "No published articles yet" — the site calmly reporting an infrastructure
 * failure as an editorial fact. A reader who sees that concludes the
 * publication is dead rather than that it is briefly unreachable. This was hit
 * for real during review, which is why it is a component and not a note.
 *
 * The pages themselves are ISR-cached, so in production a reader usually gets
 * the last good render instead of this. This is the uncached path and the
 * first-ever-render path, which is exactly when it matters most.
 */
</script>

<template>
  <div class="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface px-6 py-16 text-center">
    <span class="flex size-11 items-center justify-center rounded-full bg-ground" aria-hidden="true">
      <svg viewBox="0 0 24 24" class="size-6 text-brand" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 8v5" stroke-linecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>

    <h2 class="text-[1.3rem] leading-tight">
      Articles are not loading right now
    </h2>
    <p class="max-w-[48ch] text-[1rem] leading-relaxed text-muted">
      This is a fault on our side, not an empty publication. Nothing has been
      withdrawn — try again in a moment.
    </p>
  </div>
</template>
