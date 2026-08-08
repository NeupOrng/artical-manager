<script setup lang="ts">
import type { ArticleListItem, Paginated } from '~~/types/api'

const { data, error } = await useFetch<Paginated<ArticleListItem>>('/api/articles')

const config = useRuntimeConfig()

const articles = computed(() => data.value?.data ?? [])
const lead = computed(() => articles.value[0])
const rest = computed(() => articles.value.slice(1))

const description
  = 'Technology reporting, reviews and guides, written by named authors.'

useSeoMeta({
  title: config.public.siteName,
  ogTitle: config.public.siteName,
  description,
  ogDescription: description,
  ogType: 'website',
  ogSiteName: config.public.siteName,
  ogUrl: () => config.public.siteUrl,
  ogImage: () => lead.value?.coverImage,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <main id="doc">
    <!--
      A failed fetch is not an empty publication. Saying "no published articles"
      when the backend is unreachable reports an outage as an editorial fact.
    -->
    <div v-if="error" class="py-14">
      <FeedError />
    </div>

    <p v-else-if="!articles.length" class="py-24 text-center text-muted">
      No published articles yet.
    </p>

    <template v-else>
      <!--
        The lead. One article gets scale; the rest are an even grid. That
        editorial ranking is what a front page is for, and it is why this is not
        a grid of equal cards.
      -->
      <section v-if="lead" class="py-8 sm:py-12">
        <NuxtLink :to="`/article/${lead.slug}`" class="group block">
          <div class="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-10">
            <div class="overflow-hidden rounded-lg border border-line bg-surface">
              <img
                :src="lead.coverImage"
                alt=""
                width="1200"
                height="630"
                fetchpriority="high"
                decoding="async"
                class="block aspect-[1200/630] w-full object-cover"
              >
            </div>

            <div>
              <p v-if="lead.categorySlug" class="label text-[0.7rem] text-brand">
                {{ lead.categorySlug }}
              </p>
              <h2
                class="mt-3 text-[clamp(1.75rem,1.1rem+2.6vw,2.9rem)] leading-[1.08] group-hover:text-brand"
              >
                {{ lead.title }}
              </h2>
              <p class="mt-4 max-w-[52ch] text-[1.05rem] leading-[1.6] text-muted">
                {{ lead.excerpt }}
              </p>
              <time :datetime="isoDate(lead.publishedAt)" class="mt-4 block text-[0.85rem] text-faint">
                {{ formatDate(lead.publishedAt) }}
              </time>
            </div>
          </div>
        </NuxtLink>
      </section>

      <section v-if="rest.length" class="border-t border-line-soft pt-8">
        <h2 class="label pb-5 text-[0.72rem] text-muted">
          Latest
        </h2>
        <!--
          Four across, not three. The lead is pulled out of this grid, so a
          three-column track leaves a single orphaned card on its own row at the
          article counts this publication actually has. Four tracks divide the
          common cases evenly and keep the card width close to the reference's.
        -->
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ArticleCard
            v-for="article in rest"
            :key="article.id"
            :article="article"
          />
        </div>
      </section>
    </template>
  </main>
</template>
