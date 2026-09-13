<script setup lang="ts">
import type { TopArticle } from '~/types/api'

/**
 * The most-read articles in the range, each with its daily trend. A table
 * because it is compared across columns; it scrolls in its own container on a
 * narrow window so the page never scrolls sideways.
 */
defineProps<{ articles: TopArticle[] }>()

const { relative, absolute } = useRelativeTime()
</script>

<template>
  <p v-if="!articles.length" class="px-4 pb-4 text-[0.8125rem] text-fg-muted">
    No article views in this period.
  </p>
  <div v-else class="overflow-x-auto">
    <table class="w-full min-w-[34rem] border-collapse text-[0.8125rem]">
      <thead>
        <tr class="border-b border-border text-fg-muted">
          <th scope="col" class="w-8 px-4 py-2 text-start font-medium">
            <span class="sr-only">Rank</span>#
          </th>
          <th scope="col" class="px-2 py-2 text-start font-medium">Article</th>
          <th scope="col" class="px-2 py-2 text-start font-medium">Category</th>
          <th scope="col" class="px-2 py-2 text-end font-medium">Views</th>
          <th scope="col" class="px-4 py-2 text-start font-medium">
            <span class="sr-only">Daily trend</span>Trend
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(a, i) in articles" :key="a.articleId" class="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle">
          <td class="tnum px-4 py-2.5 text-fg-subtle">
            {{ i + 1 }}
          </td>
          <td class="px-2 py-2.5">
            <NuxtLink
              :to="`/articles/${a.articleId}`"
              class="block max-w-sm truncate font-medium underline-offset-2 hover:text-accent hover:underline"
              :title="a.title"
            >
              {{ a.title }}
            </NuxtLink>
            <span class="mt-0.5 block text-xs text-fg-subtle">
              {{ a.authorName }} · <span :title="absolute(a.publishedAt)">{{ relative(a.publishedAt) }}</span>
            </span>
          </td>
          <td class="px-2 py-2.5 text-fg-muted">
            {{ a.categoryName ?? '—' }}
          </td>
          <td class="tnum px-2 py-2.5 text-end font-medium">
            {{ a.views.toLocaleString() }}
          </td>
          <td class="px-4 py-2.5">
            <Sparkline :values="a.daily" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
