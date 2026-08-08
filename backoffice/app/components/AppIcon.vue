<script lang="ts">
/**
 * The icon set. Authored SVG, one grid, one stroke weight.
 *
 * Drawn rather than pulled from a library because the set is small and the
 * consistency matters more than the breadth: every glyph is on a 16 unit grid
 * at 1.5 stroke, round caps and joins. A mixed-weight set reads as sloppy at
 * this size even when nobody can say why.
 *
 * Never an emoji or a unicode glyph standing in for one of these.
 *
 * The type lives in a companion <script> block because `<script setup>` cannot
 * carry exports, and other components need to name an icon in their own props.
 */
export type IconName =
  | 'article'
  | 'category'
  | 'media'
  | 'author'
  | 'site'
  | 'chevron-down'
  | 'external'
  | 'warning'
</script>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: IconName
    /** Pixel size. 16 is the UI default; 14 for inline-with-text. */
    size?: number
  }>(),
  { size: 16 },
)

/** Path data only — the wrapper owns sizing, stroke, and colour. */
const PATHS: Record<IconName, string> = {
  // A page with lines of text.
  article: 'M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4',
  // A tag.
  category: 'M2.5 8.2V3.5a1 1 0 0 1 1-1h4.7a1 1 0 0 1 .7.3l4.3 4.3a1 1 0 0 1 0 1.4l-4.7 4.7a1 1 0 0 1-1.4 0L2.8 8.9a1 1 0 0 1-.3-.7ZM5.5 5.5h.01',
  // A picture with a horizon and a sun.
  media: 'M2.5 4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM2.5 10.5 6 7.5l3 2.5 2-1.5 2.5 2M10.5 5.75h.01',
  // A person.
  author: 'M13 13.5v-1.2a2.8 2.8 0 0 0-2.8-2.8H5.8A2.8 2.8 0 0 0 3 12.3v1.2M8 7a2.25 2.25 0 1 0 0-4.5A2.25 2.25 0 0 0 8 7Z',
  // A globe.
  site: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM2 8h12M8 2a9 9 0 0 1 0 12 9 9 0 0 1 0-12Z',
  'chevron-down': 'm4 6 4 4 4-4',
  external: 'M9.5 3H13v3.5M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5',
  // Triangle with a bang.
  warning: 'M7.1 2.9 2.2 11a1 1 0 0 0 .9 1.5h9.8a1 1 0 0 0 .9-1.5L8.9 2.9a1 1 0 0 0-1.8 0ZM8 6.2v2.4M8 10.8h.01',
}
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path :d="PATHS[props.name]" />
  </svg>
</template>
