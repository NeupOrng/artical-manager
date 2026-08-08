<script setup lang="ts">
import type { ArticleListItem } from '~~/types/api'

/**
 * A card in the listing grid.
 *
 * Bordered surface with the reference's radius language — 8px on the card, 6px
 * on the image well. The image is inset rather than bleeding to the card edge,
 * which is how the reference treats its own cards and is what keeps the border
 * reading as a container rather than a frame.
 */
defineProps<{ article: ArticleListItem }>()
</script>

<template>
  <article class="group h-full">
    <NuxtLink
      :to="`/article/${article.slug}`"
      class="flex h-full flex-col rounded-lg border border-line bg-surface p-3 transition-colors hover:border-brand/50"
    >
      <div class="overflow-hidden rounded-md bg-ground">
        <img
          :src="article.coverImage"
          alt=""
          width="1200"
          height="630"
          loading="lazy"
          decoding="async"
          class="block aspect-[1200/630] w-full object-cover"
        >
      </div>

      <div class="flex flex-1 flex-col px-1 pb-1 pt-3.5">
        <h3 class="text-[1.06rem] leading-[1.25] group-hover:text-brand">
          {{ article.title }}
        </h3>

        <!--
          No `flex-1` here. `line-clamp` renders as a -webkit-box, and letting
          flex stretch that box makes it taller than the clamp — so the ellipsis
          lands at line three while a fourth line still shows beneath it. The
          meta row uses mt-auto instead to hold the card footer down.
        -->
        <p class="mt-2 line-clamp-3 text-[0.95rem] leading-[1.5] text-muted">
          {{ article.excerpt }}
        </p>

        <div class="mt-auto pt-3.5">
          <p class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span v-if="article.categorySlug" class="label text-[0.66rem] text-brand">
              {{ article.categorySlug }}
            </span>
            <time :datetime="isoDate(article.publishedAt)" class="text-[0.8rem] text-faint">
              {{ formatDate(article.publishedAt) }}
            </time>
          </p>

          <!--
            The byline. Plain text, not a nested link: this card is already
            wrapped in a NuxtLink to the article, and an anchor inside an anchor
            is invalid markup that browsers resolve unpredictably. The author
            page is reachable from the article's own byline.
          -->
          <p class="mt-2 flex items-center gap-2 text-[0.82rem] text-muted">
            <AuthorAvatar :name="article.authorName" :avatar-url="article.authorAvatarUrl" size="sm" class="!size-6 !text-[0.6rem]" />
            {{ article.authorName }}
          </p>
        </div>
      </div>
    </NuxtLink>
  </article>
</template>
