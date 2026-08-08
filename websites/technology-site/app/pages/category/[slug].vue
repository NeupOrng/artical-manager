<script setup lang="ts">
import type { ArticleListItem, Paginated } from '~~/types/api'

const route = useRoute()
const config = useRuntimeConfig()

const slug = computed(() => String(route.params.slug))

const { data, error } = await useFetch<Paginated<ArticleListItem>>(
  () => `/api/articles?categorySlug=${encodeURIComponent(String(route.params.slug))}`,
)

const articles = computed(() => data.value?.data ?? [])

// A category with no published articles is a legitimate state, not an error —
// the taxonomy is tenant data and an empty one simply has nothing in it yet.
const label = computed(() => slug.value.charAt(0).toUpperCase() + slug.value.slice(1))
const description = computed(
  () => `${label.value} — reporting, reviews and guides from ${config.public.siteName}.`,
)

useSeoMeta({
  title: () => `${label.value} — ${config.public.siteName}`,
  ogTitle: () => `${label.value} — ${config.public.siteName}`,
  description: () => description.value,
  ogDescription: () => description.value,
  ogType: 'website',
  ogSiteName: config.public.siteName,
  ogUrl: () => `${config.public.siteUrl}/category/${slug.value}`,
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
      <p v-if="!error" class="mt-3 text-[0.92rem] text-muted">
        {{ articles.length }} {{ articles.length === 1 ? 'article' : 'articles' }}
      </p>
    </header>

    <FeedError v-if="error" class="mt-8" />

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
