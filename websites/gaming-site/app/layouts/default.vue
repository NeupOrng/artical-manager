<script setup lang="ts">
/**
 * The site frame: a sticky bar with the mark, the sections, and a volt hairline
 * along the top edge.
 *
 * Sticky because this is a browsing site — readers move between sections far
 * more than they do on the technology site, where the nav is a masthead you
 * pass once.
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
  <div class="flex min-h-screen flex-col bg-pitch">
    <a
      href="#story"
      class="label sr-only bg-volt px-4 py-2 text-sm text-pitch focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
    >
      Skip to article
    </a>

    <header class="sticky top-0 z-40 border-t-[3px] border-volt bg-pitch/95 backdrop-blur">
      <div class="mx-auto flex max-w-[84rem] items-center gap-4 px-4 py-3 sm:px-6">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <SiteMark />
          <span class="text-[1.02rem] font-extrabold leading-none tracking-[-0.02em]">
            {{ config.public.siteName }}
          </span>
        </NuxtLink>

        <!-- Five sections do not earn a hamburger. On small screens the rank
             scrolls horizontally instead of hiding behind a disclosure. -->
        <nav
          aria-label="Sections"
          class="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] sm:justify-end [&::-webkit-scrollbar]:hidden"
        >
          <NuxtLink
            v-for="category in categories"
            :key="category.slug"
            :to="`/category/${category.slug}`"
            class="label shrink-0 px-2.5 py-2 text-[0.74rem] transition-colors"
            :class="
              activeCategory === category.slug
                ? 'text-volt'
                : 'text-mute hover:text-paper'
            "
          >
            {{ category.slug }}
          </NuxtLink>
        </nav>
      </div>
      <div class="h-px bg-hair" />
    </header>

    <div class="mx-auto w-full max-w-[84rem] flex-1 px-4 sm:px-6">
      <slot />
    </div>

    <footer class="mt-20 border-t border-hair">
      <div
        class="mx-auto flex max-w-[84rem] flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <div class="flex items-center gap-2.5">
          <SiteMark />
          <span class="font-bold">{{ config.public.siteName }}</span>
        </div>
        <p class="max-w-[46ch] text-[0.92rem] leading-snug text-mute">
          Gaming news, reviews and guides. Every piece is written by a named
          author.
        </p>
      </div>
    </footer>
  </div>
</template>
