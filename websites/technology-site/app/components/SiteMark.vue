<script setup lang="ts">
/**
 * The site mark — an authored glyph, not a logo.
 *
 * The site has no name and no wordmark yet (PRODUCT.md: undecided, must not be
 * invented), so this reserves the slot: a real mark drops into the same box
 * without touching the layout. Drawn rather than typed so it does not depend on
 * a font loading, and deliberately generic — the reference's own mark is its
 * identity and is not ours to borrow.
 */
</script>

<template>
  <span
    class="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-ground"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.75">
      <path d="M4 17 10 7l4 6.5L16.5 10 20 17Z" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  </span>
</template>
