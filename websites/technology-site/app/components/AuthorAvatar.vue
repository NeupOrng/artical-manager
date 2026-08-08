<script setup lang="ts">
/**
 * Initial-based avatar.
 *
 * There is no author photo in the data model and one must not be invented, so
 * this derives a stable mark from the name instead of shipping a generic person
 * icon — which reads as "missing image" rather than as a deliberate choice.
 */
const props = withDefaults(
  defineProps<{ name: string, avatarUrl?: string | null, size?: 'sm' | 'md' | 'lg' }>(),
  { avatarUrl: null, size: 'md' },
)

// First letter of the first two words: "Mara Okonkwo" -> MO. Falls back to one
// letter for mononyms rather than rendering an empty box.
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join(''),
)

const sizeClass = computed(() => ({
  sm: 'size-8 text-[0.72rem]',
  md: 'size-10 text-[0.85rem]',
  lg: 'size-16 text-[1.25rem]',
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
    class="shrink-0 rounded-full bg-surface object-cover"
    :class="sizeClass"
  >

  <span
    v-else
    class="flex shrink-0 items-center justify-center rounded-full bg-surface font-bold text-brand"
    :class="sizeClass"
    aria-hidden="true"
  >{{ initials }}</span>
</template>
