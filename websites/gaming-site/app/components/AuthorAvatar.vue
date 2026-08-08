<script setup lang="ts">
/**
 * Initial-based monogram.
 *
 * There is no author photo in the data model and one must not be invented, so
 * this derives a stable mark from the name rather than shipping a generic
 * person icon — which reads as "missing image" instead of as a choice.
 *
 * Square, not a circle. Nothing on this site has a radius: the article cards
 * refuse a container outright, and a lone rounded pill would be the one soft
 * edge on the page. It also keeps the mark visibly this site's own — the
 * technology site solves the same problem with circles.
 */
const props = withDefaults(
  defineProps<{ name: string, avatarUrl?: string | null, size?: 'sm' | 'md' | 'lg' }>(),
  { avatarUrl: null, size: 'md' },
)

// First letter of the first two words: "Devin Hartley" -> DH. Falls back to a
// single letter for mononyms rather than rendering an empty box.
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join(''),
)

const sizeClass = computed(() => ({
  sm: 'size-7 text-[0.66rem]',
  md: 'size-10 text-[0.82rem]',
  lg: 'size-14 text-[1.15rem]',
}[props.size]))
</script>

<template>
  <!--
    Decorative in both branches: the author's name is always rendered beside
    this, so announcing it again would just repeat the name to a screen reader.
  -->
  <img
    v-if="avatarUrl"
    :src="avatarUrl"
    alt=""
    width="256"
    height="256"
    loading="lazy"
    decoding="async"
    class="shrink-0 bg-raise object-cover"
    :class="sizeClass"
  >

  <span
    v-else
    class="flex shrink-0 items-center justify-center bg-raise font-extrabold tracking-[0.04em] text-volt"
    :class="sizeClass"
    aria-hidden="true"
  >{{ initials }}</span>
</template>
