<script setup lang="ts">
import type { ArticleListItem, Paginated, PublicCategoryResolution } from '~~/types/api'

const route = useRoute()
const config = useRuntimeConfig()

const slug = computed(() => String(route.params.slug))

/**
 * Resolve the section first. Before this, ANY slug rendered — a typo produced
 * an empty section page with a 200 that search engines would happily index,
 * and the heading was the slug capitalised rather than the category's name.
 */
const { data: section, error: sectionError } = await useFetch<PublicCategoryResolution>(
  () => `/api/categories/${encodeURIComponent(slug.value)}`,
)

if (sectionError.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Section not found', fatal: true })
}

// A renamed section: 301 to where it lives now, so shared links and search
// results keep working and pass their ranking on. Also canonicalises case —
// /category/Reviews lands on /category/reviews rather than a duplicate page.
const target = section.value?.slug
if (target && target !== slug.value) {
  await navigateTo(`/category/${target}`, { redirectCode: 301 })
}

const category = computed(() => section.value?.kind === 'category' ? section.value : null)

const { data, error } = await useFetch<Paginated<ArticleListItem>>(
  () => `/api/articles?categorySlug=${encodeURIComponent(category.value?.slug ?? slug.value)}`,
)

const articles = computed(() => data.value?.data ?? [])

// If the resolve call failed for a reason other than 404 (the API is down), the
// page still renders from the slug rather than failing outright — the ISR copy
// is what readers see during an outage anyway.
const label = computed(() =>
  category.value?.name ?? slug.value.charAt(0).toUpperCase() + slug.value.slice(1),
)
const description = computed(
  () => category.value?.description
    ?? `${label.value} — reporting, reviews and guides from ${config.public.siteName}.`,
)

useSeoMeta({
  title: () => `${label.value} — ${config.public.siteName}`,
  ogTitle: () => `${label.value} — ${config.public.siteName}`,
  description: () => description.value,
  ogDescription: () => description.value,
  ogType: 'website',
  ogSiteName: config.public.siteName,
  ogUrl: () => `${config.public.siteUrl}/category/${category.value?.slug ?? slug.value}`,
  ogImage: () => articles.value[0]?.coverImage,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <main id="doc" class="py-8 sm:py-12">
    <header class="border-b border-line-soft pb-6">
      <h1 class="text-[clamp(1.9rem,1.3rem+2.4vw,2.8rem)] leading-none">
        {{ label }}
      </h1>
      <p v-if="category?.description" class="mt-3 max-w-[60ch] text-[1rem] text-muted">
        {{ category.description }}
      </p>
      <p v-if="!error" class="mt-3 text-[0.92rem] text-muted">
        {{ articles.length }} {{ articles.length === 1 ? 'article' : 'articles' }}
      </p>
    </header>

    <FeedError v-if="error" class="mt-8" />

    <!-- A section with nothing published yet is a legitimate state, not an
         error — it exists, it just has nothing in it. -->
    <p v-else-if="!articles.length" class="py-20 text-center text-muted">
      Nothing published in this section yet.
    </p>

    <div v-else class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <ArticleCard
        v-for="article in articles"
        :key="article.id"
        :article="article"
      />
    </div>
  </main>
</template>
