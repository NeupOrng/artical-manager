<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * App-level error boundary. Catches 404s from mistyped URLs and any unhandled
 * SSR failure.
 *
 * Deliberately plain: this is an internal tool, so there is nobody to reassure
 * and nothing to sell. Name what happened and offer the one useful way out.
 *
 * `clearError` rather than a link, so recovering does not force a full reload
 * and lose the session-warmed state.
 */
const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error?.statusCode === 404)

useHead({ title: 'Error · Artical' })
</script>

<template>
  <div class="grid min-h-dvh place-items-center px-4 py-10">
    <div class="w-full max-w-[26rem] text-center">
      <p class="tnum font-mono text-xs text-fg-subtle">
        {{ error?.statusCode ?? 500 }}
      </p>
      <h1 class="mt-2 text-base font-semibold">
        {{ isNotFound ? 'Page not found' : 'Something went wrong' }}
      </h1>
      <p class="mt-2 text-[0.8125rem] text-fg-muted">
        <template v-if="isNotFound">
          That address does not match anything in the backoffice. It may have
          been a section that is not built yet.
        </template>
        <template v-else>
          {{ error?.statusMessage || 'The page failed to load.' }}
        </template>
      </p>

      <button
        type="button"
        class="mt-6 rounded-md bg-accent px-3.5 py-2 text-[0.8125rem] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
        @click="clearError({ redirect: '/' })"
      >
        Back to the dashboard
      </button>
    </div>
  </div>
</template>
