<script setup lang="ts">
import type { PublicAuthor } from '~~/types/api'

/**
 * The end-of-article byline card — the standard editorial pattern for "who
 * wrote this and why should you believe them", and the reason the quote field
 * exists at all.
 *
 * Contact rows render only when the server sent a value. That is not a display
 * preference: null means the author did not opt in to publishing it, so an
 * `v-if` here is the last step of a decision made in the domain layer.
 */
defineProps<{ author: PublicAuthor }>()
</script>

<template>
  <aside class="rounded-lg border border-line bg-surface p-5 sm:p-6">
    <div class="flex items-start gap-4">
      <NuxtLink :to="`/author/${author.username}`" class="shrink-0">
        <AuthorAvatar :name="author.name" :avatar-url="author.avatarUrl" size="lg" />
      </NuxtLink>

      <div class="min-w-0 flex-1">
        <p class="label text-[0.66rem] text-muted">
          Written by
        </p>

        <NuxtLink
          :to="`/author/${author.username}`"
          class="mt-1.5 block text-[1.2rem] font-bold leading-tight tracking-[-0.02em] hover:text-brand"
        >
          {{ author.name }}
        </NuxtLink>

        <p v-if="author.quote" class="mt-2.5 max-w-[58ch] text-[1rem] leading-[1.55] text-muted">
          {{ author.quote }}
        </p>

        <!-- Contact. Present only for an author who opted in. -->
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

          <!--
            Rendered as plain text, not a t.me link. The field is free text by
            decision and may hold a phone number, so constructing a URL from it
            would produce a broken link for half the possible values.
          -->
          <li v-if="author.telegram" class="inline-flex items-center gap-2 text-[0.92rem] text-muted">
            <svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M17.5 3.5 2.8 9.2c-.6.2-.6.9 0 1.1l3.6 1.2 1.4 4c.2.5.8.6 1.1.2l1.9-2 3.6 2.7c.4.3 1 .1 1.1-.4l2.6-11.6c.1-.6-.4-1.1-.9-.9Z" stroke-linejoin="round" />
              <path d="m6.4 11.5 8.4-5.6-6.3 6.8" stroke-linejoin="round" />
            </svg>
            {{ author.telegram }}
          </li>
        </ul>

        <NuxtLink
          :to="`/author/${author.username}`"
          class="mt-4 inline-flex items-center gap-1.5 text-[0.92rem] font-semibold text-brand hover:underline"
        >
          All articles by {{ author.name }}
          <svg class="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="m6 3 5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </NuxtLink>
      </div>
    </div>
  </aside>
</template>
