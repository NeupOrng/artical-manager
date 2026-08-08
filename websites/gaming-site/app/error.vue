<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * Error pages render outside the default layout, so the frame is rebuilt here
 * rather than inherited.
 */
const props = defineProps<{ error: NuxtError }>()

const config = useRuntimeConfig()
const isMissing = computed(() => props.error?.statusCode === 404)

useSeoMeta({ robots: 'noindex' })
</script>

<template>
  <div class="flex min-h-screen flex-col bg-pitch">
    <header class="border-t-[3px] border-volt">
      <div class="mx-auto flex max-w-[84rem] items-center gap-2.5 px-4 py-3 sm:px-6">
        <SiteMark />
        <span class="text-[1.02rem] font-extrabold leading-none tracking-[-0.02em]">
          {{ config.public.siteName }}
        </span>
      </div>
      <div class="h-px bg-hair" />
    </header>

    <div class="mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center px-4 py-20 sm:px-6">
      <p class="label text-[0.78rem] text-ember">
        Error {{ error?.statusCode ?? 500 }}
      </p>

      <h1 class="mt-3 text-[clamp(1.9rem,1.2rem+2.9vw,3rem)] font-extrabold leading-[1.06]">
        {{ isMissing ? 'We could not find that story' : 'Something broke on our side' }}
      </h1>

      <p class="mt-4 max-w-[48ch] text-[1.1rem] leading-[1.5] text-mute">
        {{
          isMissing
            ? 'It may have been moved, or it was never published here.'
            : 'The story itself is fine — this is a fault at our end. Try again shortly.'
        }}
      </p>

      <NuxtLink
        to="/"
        class="label mt-8 inline-flex w-fit items-center gap-2 bg-volt px-5 py-2.5 text-[0.8rem] text-pitch transition-colors hover:bg-paper"
      >
        <svg class="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <path d="M10 3 5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Back to the homepage
      </NuxtLink>
    </div>
  </div>
</template>
