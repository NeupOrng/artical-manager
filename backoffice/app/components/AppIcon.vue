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
  // Editor toolbar. Drawn rather than set as unicode glyphs (•— ” {} —):
  // a mix of type and symbols never optically aligns, and the craft floor
  // rules out glyphs standing in for an icon system.
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'quote'
  | 'code-block'
  | 'link'
  | 'image'
  | 'rule'
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

  // ── Editor toolbar ────────────────────────────────────────────────────────
  // Letterforms drawn as paths, not typeset: a real B in the UI font would
  // shift weight and baseline against the drawn icons beside it.
  bold: 'M5 3h4a2.5 2.5 0 0 1 0 5H5zM5 8h4.5a2.5 2.5 0 0 1 0 5H5z',
  italic: 'M10 3H6.5M9.5 13H6M9 3 7 13',
  strike: 'M3 8h10M11.5 5.2C11.1 4 9.8 3.2 8 3.2c-1.9 0-3.2.9-3.2 2.2 0 1 .7 1.7 2 2.1M4.6 10.6c.3 1.4 1.6 2.2 3.5 2.2 2 0 3.3-.9 3.3-2.3 0-.9-.5-1.6-1.5-2',
  // Angle brackets — inline code.
  code: 'm5.5 5.5-3 2.5 3 2.5M10.5 5.5l3 2.5-3 2.5',
  // An H with the level as a small numeral — the only place a letterform is
  // drawn, because "heading level 2" has no non-textual convention.
  'heading-2': 'M2.5 3.5v9M2.5 8h4.5M7 3.5v9M9.8 9.5c0-.8.7-1.4 1.6-1.4.9 0 1.6.6 1.6 1.4 0 1.5-3.2 1.6-3.2 3.1h3.4',
  'heading-3': 'M2.5 3.5v9M2.5 8h4.5M7 3.5v9M9.9 8.5c.3-.3.8-.5 1.4-.5.9 0 1.6.5 1.6 1.2s-.6 1.2-1.5 1.2c.9 0 1.6.5 1.6 1.2 0 .8-.7 1.3-1.7 1.3-.7 0-1.2-.2-1.5-.6',
  'bullet-list': 'M6 4h7.5M6 8h7.5M6 12h7.5M3 4h.01M3 8h.01M3 12h.01',
  'ordered-list': 'M6.5 4H13.5M6.5 8H13.5M6.5 12H13.5M2.5 3.5h1v3M2 11.2c0-.5.4-.9 1-.9s1 .4 1 .9c0 .8-2 1-2 2.3h2',
  // Opening quotation mark, drawn as two solid-ish strokes.
  quote: 'M4.5 10c-1.1 0-1.9-.8-1.9-1.9C2.6 6 4 4.4 6 3.6M11.4 10c-1.1 0-1.9-.8-1.9-1.9C9.5 6 10.9 4.4 12.9 3.6',
  // A framed code region — distinct from inline `code` at a glance.
  'code-block': 'M2.5 4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM6.5 6.5 5 8l1.5 1.5M9.5 6.5 11 8l-1.5 1.5',
  link: 'M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6',
  // Distinct from `media`: no sun, so the two never read as the same control.
  image: 'M2.5 4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM2.5 10.5 6 7l3.5 3.5L11 9l2.5 2.5',
  rule: 'M2.5 8h11',
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
