<script setup lang="ts">
import type { ArticleListItem } from '~~/types/api'

/**
 * A card in the grid. Image on top, headline below — the image does the
 * attracting, the headline does the convincing.
 *
 * No container: no border, no panel, no radius. The image is the card's edge.
 * Boxing every item in a bordered panel is the reflex this deliberately
 * refuses, and it also lets the grid run denser than a panelled one could.
 */
defineProps<{ article: ArticleListItem }>()
</script>

<template>
  <article class="group">
    <NuxtLink :to="`/article/${article.slug}`" class="block">
      <div class="overflow-hidden bg-raise">
        <img
          :src="article.coverImage"
          alt=""
          width="1200"
          height="630"
          loading="lazy"
          decoding="async"
          class="block aspect-[1200/630] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        >
      </div>

      <h3 class="mt-3 text-[1.08rem] font-bold leading-[1.16] group-hover:text-volt">
        {{ article.title }}
      </h3>

      <p class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span v-if="article.categorySlug" class="label text-[0.68rem] uppercase text-ember">
          {{ article.categorySlug }}
        </span>
        <time :datetime="isoDate(article.publishedAt)" class="text-[0.8rem] text-dim">
          {{ formatDate(article.publishedAt) }}
        </time>
      </p>
    </NuxtLink>
  </article>
</template>
