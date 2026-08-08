<script setup lang="ts">
import type { ArticleDetail } from '~~/types/api'

const route = useRoute()
const config = useRuntimeConfig()

// Function form, so the fetch re-runs when the param changes on client-side
// navigation. A plain template string captures the value once and goes stale.
const { data: article } = await useFetch<ArticleDetail>(
  () => `/api/articles/${route.params.slug}`,
)

if (!article.value) {
  throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
}

const canonical = computed(
  () => `${config.public.siteUrl}/article/${article.value?.slug}`,
)

// Server-rendered, in setup — NOT onMounted. Social crawlers do not execute
// JavaScript, so a client-injected tag looks perfect in devtools and is
// invisible when the link is shared. Verify with view-source.
useSeoMeta({
  title: () => article.value?.title,
  ogTitle: () => article.value?.title,
  description: () => article.value?.excerpt,
  ogDescription: () => article.value?.excerpt,
  ogImage: () => article.value?.coverImage,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: () => article.value?.title,
  ogUrl: () => canonical.value,
  ogType: 'article',
  ogSiteName: () => config.public.siteName,
  articlePublishedTime: () => article.value?.publishedAt,
  articleSection: () => article.value?.categorySlug ?? undefined,
  // article:author is a repeatable property, so useSeoMeta types it as an
  // array. Passing a bare string type-checks nowhere and emits a malformed tag.
  articleAuthor: () => (article.value ? [article.value.authorName] : undefined),
  twitterCard: 'summary_large_image',
  twitterTitle: () => article.value?.title,
  twitterDescription: () => article.value?.excerpt,
  twitterImage: () => article.value?.coverImage,
})

useHead({ link: [{ rel: 'canonical', href: canonical }] })
</script>

<template>
  <article v-if="article" id="doc" class="py-8 sm:py-12">
    <!--
      Header, cover and body all run at the reading measure. A full-width
      headline over a 42rem body makes a story page feel like a landing page.
    -->
    <header class="mx-auto max-w-[46rem]">
      <NuxtLink
        v-if="article.categorySlug"
        :to="`/category/${article.categorySlug}`"
        class="label inline-block text-[0.72rem] text-brand hover:underline"
      >
        {{ article.categorySlug }}
      </NuxtLink>

      <h1 class="mt-3 text-[clamp(1.9rem,1.2rem+2.9vw,3.1rem)] leading-[1.07]">
        {{ article.title }}
      </h1>

      <!--
        The excerpt is mandatory on the model and feeds og:description, so it
        gets a real slot at reading size — never filler under the headline.
      -->
      <p class="mt-4 text-[1.15rem] leading-[1.55] text-muted">
        {{ article.excerpt }}
      </p>

      <!--
        The byline. A named human on every piece is what separates this from an
        aggregator, so it is a real element rather than a grey line.
        The name links to the author page only when they have a username —
        otherwise it renders as plain text rather than linking to /author/null.
      -->
      <div class="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5">
        <AuthorAvatar :name="article.authorName" :avatar-url="article.authorAvatarUrl" size="sm" />

        <NuxtLink
          v-if="article.authorUsername"
          :to="`/author/${article.authorUsername}`"
          class="text-[0.95rem] font-semibold hover:text-brand"
        >
          {{ article.authorName }}
        </NuxtLink>
        <span v-else class="text-[0.95rem] font-semibold">{{ article.authorName }}</span>

        <span class="text-faint" aria-hidden="true">·</span>
        <time :datetime="isoDate(article.publishedAt)" class="text-[0.9rem] text-muted">
          {{ formatDate(article.publishedAt) }}
        </time>
      </div>
    </header>

    <!--
      Cover image. This same file is the og:image, so it is art-directed at
      1200x630 and never cropped to a shape the social card cannot reproduce.

      Held to the same measure as the header and body. An earlier pass ran it
      wider, and a few rem of overhang on each side reads as a misalignment
      rather than as a deliberately wider image — either match the column or
      break it properly, and matching is right for a reading page.
    -->
    <figure class="mx-auto mt-8 max-w-[46rem]">
      <img
        :src="article.coverImage"
        :alt="article.title"
        width="1200"
        height="630"
        fetchpriority="high"
        decoding="async"
        class="block aspect-[1200/630] w-full rounded-lg border border-line bg-surface object-cover"
      >
    </figure>

    <div class="mx-auto mt-10 max-w-[46rem]">
      <ArticleBody :content="article.content" />
    </div>

    <!-- The end-of-article author card: who wrote this, and why believe them. -->
    <div v-if="article.author" class="mx-auto mt-12 max-w-[46rem]">
      <AuthorCard :author="article.author" />
    </div>

    <div class="mx-auto mt-8 max-w-[46rem] border-t border-line pt-6">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2.5 text-[0.9rem] font-semibold text-ground transition-colors hover:bg-brand-deep"
      >
        <svg class="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 3 5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        All articles
      </NuxtLink>
    </div>
  </article>
</template>
