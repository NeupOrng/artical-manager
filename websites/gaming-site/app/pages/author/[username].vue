<script setup lang="ts">
import type { AuthorProfile } from '~~/types/api'

/**
 * Author index.
 *
 * Structurally the category page: rule-under-masthead, then the same card
 * grid. That is deliberate — an author page and a section page answer the same
 * reader question ("what else is here?"), so they should not invent two
 * different shapes for it.
 */
const route = useRoute()
const config = useRuntimeConfig()

const { data, error } = await useFetch<AuthorProfile>(
  () => `/api/authors/${route.params.username}`,
)

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Author not found', fatal: true })
}

const author = computed(() => data.value?.author)
const articles = computed(() => data.value?.articles ?? [])

const canonical = computed(
  () => `${config.public.siteUrl}/author/${author.value?.username}`,
)

useSeoMeta({
  title: () => author.value?.name,
  ogTitle: () => author.value?.name,
  // The author's own words where they wrote some; otherwise a plain factual
  // line. Never invent a bio — an empty quote is a real editorial state.
  description: () =>
    author.value?.quote ?? `Stories by ${author.value?.name} on ${config.public.siteName}.`,
  ogDescription: () =>
    author.value?.quote ?? `Stories by ${author.value?.name} on ${config.public.siteName}.`,
  ogType: 'profile',
  ogUrl: () => canonical.value,
  ogSiteName: () => config.public.siteName,
  twitterCard: 'summary',
})

useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>

<template>
  <main v-if="author" id="story" class="py-8">
    <header class="border-b border-hair pb-6">
      <div class="flex items-start gap-4">
        <AuthorAvatar :name="author.name" :avatar-url="author.avatarUrl" size="lg" />

        <div class="min-w-0">
          <p class="label text-[0.7rem] text-ember">
            Writer
          </p>
          <h1 class="mt-1.5 text-[clamp(1.9rem,1.3rem+2.4vw,2.8rem)] font-extrabold leading-none">
            {{ author.name }}
          </h1>
        </div>
      </div>

      <p v-if="author.quote" class="mt-5 max-w-[60ch] text-[1.05rem] leading-[1.6] text-mute">
        {{ author.quote }}
      </p>

      <!-- Only present for an author who opted in. -->
      <ul
        v-if="author.email || author.telegram"
        class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[0.9rem]"
      >
        <li v-if="author.email">
          <a :href="`mailto:${author.email}`" class="text-volt hover:underline">
            {{ author.email }}
          </a>
        </li>
        <li v-if="author.telegram" class="text-mute">
          {{ author.telegram }}
        </li>
      </ul>

      <p class="mt-5 text-[0.9rem] text-dim">
        {{ articles.length }} {{ articles.length === 1 ? 'story' : 'stories' }}
      </p>
    </header>

    <FeedError v-if="error" class="mt-8" />

    <p v-else-if="!articles.length" class="py-20 text-center text-[1.05rem] text-mute">
      Nothing published by this writer yet.
    </p>

    <div v-else class="mt-8 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
      <ArticleCard
        v-for="article in articles"
        :key="article.id"
        :article="article"
      />
    </div>
  </main>
</template>
