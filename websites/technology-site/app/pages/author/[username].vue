<script setup lang="ts">
import type { AuthorProfile } from '~~/types/api'

const route = useRoute()
const config = useRuntimeConfig()

const { data } = await useFetch<AuthorProfile>(
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

// The quote doubles as the page description, which is exactly what it is for.
// No fallback is generated from article text: an author without a quote gets a
// plain description rather than something invented on their behalf.
const description = computed(() =>
  author.value?.quote
  ?? `Articles by ${author.value?.name} on ${config.public.siteName}.`,
)

// Server-rendered, in setup — crawlers do not execute JavaScript.
useSeoMeta({
  title: () => `${author.value?.name} — ${config.public.siteName}`,
  ogTitle: () => `${author.value?.name} — ${config.public.siteName}`,
  description: () => description.value,
  ogDescription: () => description.value,
  ogType: 'profile',
  ogSiteName: config.public.siteName,
  ogUrl: () => canonical.value,
  // The author's most recent cover, so a shared author link still gets a card.
  ogImage: () => articles.value[0]?.coverImage,
  twitterCard: 'summary_large_image',
})

useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>

<template>
  <main v-if="author" id="doc" class="py-8 sm:py-12">
    <header class="border-b border-line pb-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <AuthorAvatar :name="author.name" :avatar-url="author.avatarUrl" size="lg" />

        <div class="min-w-0 flex-1">
          <h1 class="text-[clamp(1.8rem,1.3rem+2.2vw,2.6rem)] leading-[1.08]">
            {{ author.name }}
          </h1>

          <p v-if="author.quote" class="mt-3 max-w-[58ch] text-[1.1rem] leading-[1.55] text-muted">
            {{ author.quote }}
          </p>

          <!-- Contact rows appear only for an author who opted in. -->
          <ul
            v-if="author.email || author.telegram"
            class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <li v-if="author.email">
              <a
                :href="`mailto:${author.email}`"
                class="inline-flex items-center gap-2 text-[0.92rem] text-brand hover:underline"
              >
                <svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
                  <path d="m3.5 6 6.5 4.5L16.5 6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ author.email }}
              </a>
            </li>
            <!-- Plain text, not a t.me link: the field may hold a phone
                 number, so a constructed URL would break for half the values. -->
            <li v-if="author.telegram" class="inline-flex items-center gap-2 text-[0.92rem] text-muted">
              <svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M17.5 3.5 2.8 9.2c-.6.2-.6.9 0 1.1l3.6 1.2 1.4 4c.2.5.8.6 1.1.2l1.9-2 3.6 2.7c.4.3 1 .1 1.1-.4l2.6-11.6c.1-.6-.4-1.1-.9-.9Z" stroke-linejoin="round" />
                <path d="m6.4 11.5 8.4-5.6-6.3 6.8" stroke-linejoin="round" />
              </svg>
              {{ author.telegram }}
            </li>
          </ul>
        </div>
      </div>
    </header>

    <section class="mt-8">
      <h2 class="label pb-5 text-[0.72rem] text-muted">
        {{ articles.length }} {{ articles.length === 1 ? 'article' : 'articles' }}
      </h2>

      <p v-if="!articles.length" class="py-16 text-center text-muted">
        Nothing published by this author yet.
      </p>

      <!--
        Three tracks, matching the category page. Four is right on the homepage
        only because the lead is pulled out of that grid; here every article is
        in the grid, so four leaves a single stranded card at realistic counts.
      -->
      <div v-else class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <ArticleCard
          v-for="article in articles"
          :key="article.id"
          :article="article"
        />
      </div>
    </section>
  </main>
</template>
