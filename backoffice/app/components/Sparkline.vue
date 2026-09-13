<script setup lang="ts">
/**
 * A tiny trend line for a table row. Decorative: the number beside it is the
 * accessible value, so this is hidden from assistive technology.
 */
const props = withDefaults(
  defineProps<{ values: number[], width?: number, height?: number }>(),
  { width: 64, height: 18 },
)

const points = computed(() => {
  const n = props.values.length
  if (n === 0) return ''
  const max = Math.max(1, ...props.values)
  const pad = 1.5
  return props.values
    .map((v, i) => {
      const px = n === 1 ? props.width / 2 : (i * props.width) / (n - 1)
      const py = props.height - pad - (v / max) * (props.height - pad * 2)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')
})
</script>

<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true" class="block overflow-visible">
    <polyline :points="points" fill="none" class="stroke-accent" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
</template>
