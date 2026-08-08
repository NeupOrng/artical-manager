<script setup lang="ts">
import type { ArticleListItem, Paginated } from '~~/types/api'

const { data, error } = await useFetch<Paginated<ArticleListItem>>('/api/articles')

const config = useRuntimeConfig()

const articles = computed(() => data.value?.data ?? [])
const lead = computed(() => articles.value[0])
const rest = computed(() => articles.value.slice(1))

const description
  = 'Gaming news, reviews and guides, written by named authors.'

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
  <main id="story">
    <!--
      A failed fetch is not an empty publication. Saying "nothing published yet"
      when the backend is unreachable reports an outage as an editorial fact,
      which is worse than saying nothing.
    -->
    <FeedError v-if="error" />

    <p v-else-if="!articles.length" class="py-24 text-center text-[1.05rem] text-mute">
      Nothing published yet.
    </p>

    <template v-else>
      <section class="grid gap-8 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-10">
        <!-- Lead. One story gets the scale; the ranking is the front page's job. -->
        <NuxtLink v-if="lead" :to="`/article/${lead.slug}`" class="group block">
          <div class="overflow-hidden bg-raise">
            <img
              :src="lead.coverImage"
              alt=""
              width="1200"
              height="630"
              fetchpriority="high"
              decoding="async"
              class="block aspect-[1200/630] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            >
          </div>

          <p v-if="lead.categorySlug" class="label mt-4 text-[0.72rem] text-ember">
            {{ lead.categorySlug }}
          </p>

          <h2
            class="mt-2.5 text-[clamp(1.7rem,1.1rem+2.4vw,2.7rem)] font-extrabold leading-[1.07] group-hover:text-volt"
          >
            {{ lead.title }}
          </h2>

          <p class="mt-3 max-w-[54ch] text-[1.05rem] leading-[1.55] text-mute">
            {{ lead.excerpt }}
          </p>

          <time :datetime="isoDate(lead.publishedAt)" class="mt-3 block text-[0.85rem] text-dim">
            {{ formatDate(lead.publishedAt) }}
          </time>
        </NuxtLink>

        <!-- Latest rail. A chronological index of the same stories, which is
             what a rail is for: recency, not a second ranking. -->
        <aside class="lg:border-l lg:border-hair lg:pl-8">
          <h2 class="label border-b border-hair pb-3 text-[0.76rem] text-paper">
            Latest
          </h2>
          <ul>
            <li
              v-for="article in articles"
              :key="article.id"
              class="border-b border-hair"
            >
              <NuxtLink
                :to="`/article/${article.slug}`"
                class="group flex gap-3 py-3.5"
              >
                <time
                  :datetime="isoDate(article.publishedAt)"
                  class="w-16 shrink-0 pt-0.5 text-[0.76rem] leading-tight text-dim"
                >
                  {{ formatDate(article.publishedAt) }}
                </time>
                <span class="min-w-0">
                  <span class="block font-semibold leading-[1.25] group-hover:text-volt">
                    {{ article.title }}
                  </span>
                  <span
                    v-if="article.categorySlug"
                    class="label mt-1.5 block text-[0.66rem] text-ember"
                  >
                    {{ article.categorySlug }}
                  </span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </aside>
      </section>

      <section v-if="rest.length" class="mt-6 border-t border-hair pt-8">
        <h2 class="label pb-5 text-[0.78rem] text-paper">
          More stories
        </h2>
        <!--
          Uniform cards. An earlier pass gave the first card a larger size and
          an excerpt, which made the row heights ragged and read as a bug rather
          than as hierarchy. The lead above already carries the ranking; this
          grid's job is even, scannable density.
        -->
        <div class="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
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
