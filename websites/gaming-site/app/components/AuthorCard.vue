<script setup lang="ts">
import type { PublicAuthor } from '~~/types/api'

/**
 * End-of-article byline card.
 *
 * Deliberately not a panel. This site separates with hairline rules — the
 * article header and the "More stories" section both do — and boxing this one
 * block in a bordered, rounded card would make it the only container on the
 * site. The technology site does use a panel here; that divergence is the
 * point, the two publications are not meant to look related.
 *
 * The name carries the emphasis through weight and scale rather than
 * decoration, which is how the rest of this site's hierarchy works.
 */
defineProps<{ author: PublicAuthor }>()
</script>

<template>
  <aside class="border-t border-hair pt-6">
    <p class="label flex items-center gap-2.5 text-[0.7rem] text-ember">
      <AuthorAvatar :name="author.name" :avatar-url="author.avatarUrl" size="sm" />
      Written by
    </p>

    <NuxtLink
      :to="`/author/${author.username}`"
      class="mt-3 block text-[1.5rem] font-extrabold leading-none hover:text-volt"
    >
      {{ author.name }}
    </NuxtLink>

    <p v-if="author.quote" class="mt-3 max-w-[56ch] text-[1rem] leading-[1.55] text-mute">
      {{ author.quote }}
    </p>

    <!--
      Contact appears only for an author who opted in (contact_public). Set as
      plain text rather than icon rows: this site reserves glyphs for
      navigation affordances, so labelling a mail address with an envelope adds
      decoration without adding meaning — the address already says what it is.
    -->
    <ul
      v-if="author.email || author.telegram"
      class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[0.9rem]"
    >
      <li v-if="author.email">
        <a :href="`mailto:${author.email}`" class="text-volt hover:underline">
          {{ author.email }}
        </a>
      </li>

      <!--
        Plain text, not a t.me link. The field is free text by decision and may
        hold a phone number, so building a URL from it breaks for half the
        possible values.
      -->
      <li v-if="author.telegram" class="text-mute">
        {{ author.telegram }}
      </li>
    </ul>

    <NuxtLink
      :to="`/author/${author.username}`"
      class="label mt-5 inline-block border-b border-volt-deep pb-0.5 text-[0.72rem] text-volt hover:border-volt"
    >
      All stories by {{ author.name }}
    </NuxtLink>
  </aside>
</template>
