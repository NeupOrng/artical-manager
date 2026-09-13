<script setup lang="ts">
/**
 * Stands in for the readership panels when there are no readership figures.
 *
 * Neither state is an error the editor caused or can fix from here, and the
 * editorial figures on the page are still current — so it says both, quietly,
 * instead of a red banner that reads as "the dashboard is broken".
 */
defineProps<{ status: 'not-connected' | 'unavailable' }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex items-start gap-3 rounded-md border border-dashed border-border-strong px-4 py-3.5 text-[0.8125rem]">
    <AppIcon name="warning" class="mt-0.5 shrink-0 text-fg-subtle" />
    <div>
      <p class="font-medium">
        {{ status === 'not-connected'
          ? 'View analytics are not set up for this site'
          : 'View analytics are temporarily unavailable' }}
      </p>
      <p class="mt-0.5 text-fg-muted">
        <template v-if="status === 'not-connected'">
          Publishing figures and the pipeline are still current. Ask whoever runs
          the platform to connect this site to analytics.
        </template>
        <template v-else>
          Readership could not be loaded just now. Publishing figures and the
          pipeline are still current.
        </template>
      </p>
      <button
        v-if="status === 'unavailable'"
        type="button"
        class="mt-2 text-fg-muted underline underline-offset-2 hover:text-fg"
        @click="$emit('retry')"
      >
        Try again
      </button>
    </div>
  </div>
</template>
