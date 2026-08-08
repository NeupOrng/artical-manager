<script setup lang="ts">
/**
 * The site frame: a sticky bar with the mark and the sections, over a hairline.
 *
 * Follows the reference's header language — thin, quiet, translucent over the
 * ground, with the brand colour used only for the mark and the active state.
 */
const config = useRuntimeConfig()
const route = useRoute()

// Cached server-side (see server/api/categories.get.ts), so this costs one
// call per TTL for the whole site rather than one per render.
const { data: categories } = await useFetch<{ slug: string, count: number }[]>(
  '/api/categories',
  { default: () => [] },
)

const activeCategory = computed(() =>
  route.path.startsWith('/category/') ? route.params.slug : null,
)
</script>

<template>
  <div class="flex min-h-screen flex-col bg-ground">
    <a
      href="#doc"
      class="label sr-only rounded-md bg-brand px-4 py-2 text-sm text-ground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
    >
      Skip to article
    </a>

    <header class="sticky top-0 z-40 border-b border-line-soft bg-ground/85 backdrop-blur">
      <div class="mx-auto flex max-w-[76rem] items-center gap-4 px-4 py-3 sm:px-6">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <SiteMark />
          <span class="text-[1rem] font-bold leading-none tracking-[-0.02em]">
            {{ config.public.siteName }}
          </span>
        </NuxtLink>

        <!-- A handful of sections does not earn a hamburger. On small screens
             the rank scrolls horizontally rather than hiding behind a
             disclosure. -->
        <nav
          aria-label="Sections"
          class="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] sm:justify-end [&::-webkit-scrollbar]:hidden"
        >
          <NuxtLink
            v-for="category in categories"
            :key="category.slug"
            :to="`/category/${category.slug}`"
            class="shrink-0 rounded-md px-2.5 py-1.5 text-[0.9rem] font-medium capitalize transition-colors"
            :class="
              activeCategory === category.slug
                ? 'bg-surface text-brand'
                : 'text-muted hover:bg-surface hover:text-text'
            "
          >
            {{ category.slug }}
          </NuxtLink>
        </nav>
      </div>
    </header>

    <div class="mx-auto w-full max-w-[76rem] flex-1 px-4 sm:px-6">
      <slot />
    </div>

    <footer class="mt-20 border-t border-line-soft">
      <div
        class="mx-auto flex max-w-[76rem] flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <div class="flex items-center gap-2.5">
          <SiteMark />
          <span class="font-semibold">{{ config.public.siteName }}</span>
        </div>
        <p class="max-w-[48ch] text-[0.92rem] leading-snug text-muted">
          Technology reporting, reviews and guides. Every piece is written by a
          named author.
        </p>
      </div>
    </footer>
  </div>
</template>
