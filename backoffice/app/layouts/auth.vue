<script setup lang="ts">
/**
 * Unauthenticated pages. No navigation — there is nowhere to go, and offering
 * links that all bounce back here is worse than offering none.
 *
 * The wordmark sits above the card rather than inside it so the card stays a
 * single-purpose object: one job, one form, one action.
 */
</script>

<template>
  <div class="grid min-h-dvh place-items-center px-4 py-10">
    <div class="w-full max-w-[22rem]">
      <p class="mb-5 text-center text-[0.9375rem] font-semibold tracking-tight">
        Artical
      </p>
      <div class="rounded-lg border border-border bg-panel p-6 shadow-sm">
        <slot />
      </div>
      <p class="mt-5 text-center text-xs text-fg-subtle">
        Accounts are created by an administrator.
      </p>
    </div>
  </div>
</template>
