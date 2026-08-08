<script setup lang="ts">
/**
 * The site mark — an authored glyph, not a logo.
 *
 * The site has no name and no wordmark yet (PRODUCT.md: undecided, must not be
 * invented), so this is a neutral placeholder that reserves the slot: a real
 * mark drops into the same box without touching the layout. It is drawn rather
 * than typed so it does not depend on a font loading, and it is deliberately
 * generic — an abstract play glyph, not a borrowed identity.
 */
</script>

<template>
  <span
    class="flex size-8 shrink-0 items-center justify-center bg-volt text-pitch"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M5 4.5 18.5 12 5 19.5Z" stroke-linejoin="miter" />
    </svg>
  </span>
</template>
