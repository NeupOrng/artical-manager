<script setup lang="ts">
/**
 * Shown when a listing fetch fails.
 *
 * This exists because the alternative is worse: an empty array and an error are
 * indistinguishable to a `v-if="!articles.length"`, so a backend outage renders
 * as "Nothing published yet" — the site calmly reporting an infrastructure
 * failure as an editorial fact. A reader who sees that concludes the
 * publication is dead rather than that it is briefly unreachable.
 *
 * The pages themselves are ISR-cached, so in production a reader usually gets
 * the last good render instead of this. This is the uncached path and the
 * first-ever-render path, which is exactly when it matters most.
 */
</script>

<template>
  <div class="flex flex-col items-center gap-4 border border-hair px-6 py-20 text-center">
    <span class="flex size-11 items-center justify-center bg-raise" aria-hidden="true">
      <svg viewBox="0 0 24 24" class="size-6 text-ember" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 8v5" stroke-linecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>

    <h2 class="text-[1.35rem] font-bold leading-tight">
      Stories are not loading right now
    </h2>
    <p class="max-w-[46ch] text-[1rem] leading-relaxed text-mute">
      This is a problem on our side, not a problem with the site being empty.
      Nothing has been removed — try again in a moment.
    </p>
  </div>
</template>
