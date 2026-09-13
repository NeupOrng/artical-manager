<script setup lang="ts">
import type { ArticleFilters } from '~/composables/useArticles'
import type { Readiness } from '~/types/api'

/**
 * The article list — the working surface of this tool.
 *
 * Density over whitespace: this is a list to scan, not content to be sold. The
 * one thing an editor needs to see at a glance is what is live, what is a draft,
 * and which drafts are actually ready to go.
 */
const route = useRoute()
const router = useRouter()
const { data: me } = await useMe()
const { relative, absolute } = useRelativeTime()
const { create } = useArticleActions()
const { parse } = useApiError()

/**
 * Filters live in the URL, not in component state. That makes a filtered list
 * shareable and survivable across a refresh — an editor who sends "the drafts
 * needing covers" to someone should be sending a link, not instructions.
 */
const filters = computed<ArticleFilters>(() => ({
  page: Number(route.query.page ?? 1),
  perPage: 20,
  status: (route.query.status as 'draft' | 'published') || undefined,
  search: (route.query.search as string) || undefined,
  authorId: route.query.mine === '1' && me.value?.kind === 'author'
    ? me.value.id
    : undefined,
  categoryId: (route.query.categoryId as string) || undefined,
  readiness: (route.query.readiness as Readiness) || undefined,
}))

const READINESS_LABEL: Record<Readiness, string> = {
  'ready': 'Ready to publish',
  'needs-excerpt': 'Needs an excerpt',
  'needs-cover': 'Needs a cover image',
}

const { data: list, status, error, refresh } = useArticleList(filters)

/**
 * The name for the category filter chip. The live list covers most cases; a
 * retired category (reachable from the categories page) is not in it, so fall
 * back to the label on the rows themselves — every row shares it.
 */
const { categories } = useCategories()
const categoryFilterName = computed(() => {
  const id = filters.value.categoryId
  if (!id) return null
  return categories.value.find(c => c.id === id)?.name
    ?? list.value?.data[0]?.categoryName
    ?? 'Selected category'
})

const setQuery = (patch: Record<string, string | undefined>) => {
  // A FILTER change returns to page one — staying on page 4 of a narrower
  // result set shows an empty table that reads as "no articles". A PAGE change
  // obviously must not reset itself, so the patch wins when it names `page`.
  const resetPage = !('page' in patch)

  router.push({
    query: {
      ...route.query,
      ...(resetPage ? { page: undefined } : {}),
      ...patch,
    },
  })
}

const search = ref((route.query.search as string) ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  // Debounced so typing does not fire a request per keystroke.
  searchTimer = setTimeout(() => setQuery({ search: value || undefined }), 300)
})

const STATUS_TABS = [
  { label: 'All', value: undefined },
  { label: 'Drafts', value: 'draft' },
  { label: 'Published', value: 'published' },
] as const

const creating = ref(false)
const createError = ref<string | null>(null)

/**
 * Creating goes straight into the editor rather than opening a modal for a
 * title. A new article is a draft with a working title — the real writing
 * happens on the next screen, and an interstitial dialog is one more thing
 * between an idea and a cursor.
 */
async function createArticle() {
  creating.value = true
  createError.value = null
  try {
    const article = await create({ title: 'Untitled article' })
    await navigateTo(`/articles/${article.id}`)
  }
  catch (e) {
    createError.value = parse(e).message
    creating.value = false
  }
}

const totalPages = computed(() =>
  Math.max(1, Math.ceil((list.value?.meta.total ?? 0) / (list.value?.meta.perPage ?? 20))),
)

useHead({ title: 'Articles · Artical' })
</script>

<template>
  <div>
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          Articles
        </h1>
        <p class="mt-1 text-[0.8125rem] text-fg-muted">
          {{ list?.meta.total ?? 0 }} on this site
        </p>
      </div>

      <button
        type="button"
        :disabled="creating"
        class="rounded-md bg-accent px-3 py-2 text-[0.8125rem] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
        @click="createArticle"
      >
        {{ creating ? 'Creating…' : 'New article' }}
      </button>
    </header>

    <p
      v-if="createError"
      class="mt-3 rounded-md border border-border bg-danger-surface px-3 py-2 text-[0.8125rem] text-danger"
      role="alert"
    >
      {{ createError }}
    </p>

    <!-- Filters. Status as tabs because there are three and they are mutually
         exclusive; a select would hide the current state behind a click. -->
    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="flex rounded-md border border-border bg-panel p-0.5">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.label"
          type="button"
          class="rounded px-2.5 py-1 text-[0.8125rem] transition-colors"
          :class="filters.status === tab.value
            ? 'bg-bg-sunken font-medium text-fg'
            : 'text-fg-muted hover:text-fg'"
          @click="setQuery({ status: tab.value })"
        >
          {{ tab.label }}
        </button>
      </div>

      <label class="flex-1 sm:max-w-xs">
        <span class="sr-only">Search titles</span>
        <input
          v-model="search"
          type="search"
          placeholder="Search titles…"
          class="w-full rounded-md border border-border bg-panel px-3 py-1.5 text-[0.8125rem] transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent"
        >
      </label>

      <label
        v-if="me?.kind === 'author'"
        class="flex items-center gap-2 text-[0.8125rem] text-fg-muted"
      >
        <input
          type="checkbox"
          :checked="route.query.mine === '1'"
          class="rounded border-border"
          @change="setQuery({ mine: ($event.target as HTMLInputElement).checked ? '1' : undefined })"
        >
        Only mine
      </label>

      <!-- Arrives from the categories page. A removable chip rather than a
           control of its own: filtering by category is a drill-down, and the
           way back out needs to be one obvious click. -->
      <button
        v-if="categoryFilterName"
        type="button"
        class="flex items-center gap-1.5 rounded-full border border-border bg-panel py-1 ps-2.5 pe-2 text-[0.8125rem] transition-colors hover:border-border-strong"
        :aria-label="`Remove filter: category ${categoryFilterName}`"
        @click="setQuery({ categoryId: undefined })"
      >
        <span class="text-fg-muted">Category</span>
        <span class="font-medium">{{ categoryFilterName }}</span>
        <span aria-hidden="true" class="text-fg-subtle">×</span>
      </button>

      <!-- Arrives from the dashboard's publishing pipeline. Same chip pattern
           as the category drill-down: one obvious click back out. -->
      <button
        v-if="filters.readiness"
        type="button"
        class="flex items-center gap-1.5 rounded-full border border-border bg-panel py-1 ps-2.5 pe-2 text-[0.8125rem] transition-colors hover:border-border-strong"
        :aria-label="`Remove filter: ${READINESS_LABEL[filters.readiness]}`"
        @click="setQuery({ readiness: undefined })"
      >
        <span class="text-fg-muted">Drafts</span>
        <span class="font-medium">{{ READINESS_LABEL[filters.readiness] }}</span>
        <span aria-hidden="true" class="text-fg-subtle">×</span>
      </button>
    </div>

    <div v-if="status === 'pending'" class="mt-4 animate-pulse space-y-2">
      <div v-for="n in 5" :key="n" class="h-12 rounded-md border border-border bg-panel" />
    </div>

    <div
      v-else-if="error"
      class="mt-4 flex items-start gap-3 rounded-lg border border-border bg-danger-surface px-4 py-3.5"
      role="alert"
    >
      <AppIcon name="warning" class="mt-0.5 text-danger" />
      <div class="text-[0.8125rem]">
        <p class="font-medium text-danger">
          Could not load articles
        </p>
        <button type="button" class="mt-1 text-fg-muted underline underline-offset-2" @click="refresh()">
          Try again
        </button>
      </div>
    </div>

    <!-- Empty state distinguishes "nothing here yet" from "nothing matched",
         because the useful next action is completely different. -->
    <div
      v-else-if="!list?.data.length"
      class="mt-4 rounded-lg border border-dashed border-border-strong bg-panel px-6 py-12 text-center"
    >
      <template v-if="filters.search || filters.status || filters.authorId || filters.categoryId || filters.readiness">
        <p class="text-[0.8125rem] font-medium">
          Nothing matches those filters
        </p>
        <button
          type="button"
          class="mt-2 text-[0.8125rem] text-accent underline underline-offset-2"
          @click="router.push({ query: {} })"
        >
          Clear filters
        </button>
      </template>
      <template v-else>
        <p class="text-[0.8125rem] font-medium">
          No articles yet
        </p>
        <p class="mx-auto mt-1 max-w-sm text-[0.8125rem] text-fg-muted">
          Start one and it appears here as a draft until an editor publishes it.
        </p>
      </template>
    </div>

    <div v-else class="mt-4 overflow-x-auto rounded-lg border border-border bg-panel">
      <table class="w-full min-w-3xl border-collapse text-[0.8125rem]">
        <thead>
          <tr class="border-b border-border text-fg-muted">
            <th scope="col" class="px-4 py-2.5 text-start font-medium">Title</th>
            <th scope="col" class="px-4 py-2.5 text-start font-medium">Status</th>
            <th scope="col" class="px-4 py-2.5 text-start font-medium">Category</th>
            <th scope="col" class="px-4 py-2.5 text-start font-medium">Author</th>
            <th scope="col" class="px-4 py-2.5 text-end font-medium">Edited</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="article in list.data"
            :key="article.id"
            class="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle"
          >
            <td class="px-4 py-2.5">
              <NuxtLink
                :to="`/articles/${article.id}`"
                class="block max-w-md truncate font-medium underline-offset-2 hover:text-accent hover:underline"
                :title="article.title"
              >
                {{ article.title }}
              </NuxtLink>
              <span class="mt-0.5 block max-w-md truncate font-mono text-xs text-fg-subtle">
                {{ article.slug }}
              </span>
            </td>
            <td class="px-4 py-2.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <StatusPill :status="article.status" />
                <!--
                  Surfaced in the LIST, not only in the editor: an editor
                  scanning for something to publish needs to see which drafts
                  are actually ready without opening each one.
                -->
                <span
                  v-if="article.status === 'draft' && article.missingToPublish.length"
                  class="rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted"
                  :title="`Cannot publish yet: needs ${article.missingToPublish.join(' and ')}`"
                >
                  needs {{ article.missingToPublish.length === 2 ? 'excerpt + cover' : article.missingToPublish[0] === 'excerpt' ? 'excerpt' : 'cover' }}
                </span>
              </div>
            </td>
            <td class="px-4 py-2.5 text-fg-muted">
              {{ article.categoryName ?? '—' }}
            </td>
            <td class="px-4 py-2.5 text-fg-muted">
              {{ article.authorName }}
            </td>
            <td
              class="whitespace-nowrap px-4 py-2.5 text-end text-fg-muted"
              :title="absolute(article.updatedAt)"
            >
              {{ relative(article.updatedAt) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav
      v-if="totalPages > 1"
      class="mt-4 flex items-center justify-between text-[0.8125rem]"
      aria-label="Pagination"
    >
      <button
        type="button"
        :disabled="(filters.page ?? 1) <= 1"
        class="rounded-md border border-border bg-panel px-3 py-1.5 transition-colors hover:bg-bg-sunken disabled:opacity-40"
        @click="setQuery({ page: String((filters.page ?? 1) - 1) })"
      >
        Previous
      </button>
      <span class="tnum text-fg-muted">
        Page {{ filters.page ?? 1 }} of {{ totalPages }}
      </span>
      <button
        type="button"
        :disabled="(filters.page ?? 1) >= totalPages"
        class="rounded-md border border-border bg-panel px-3 py-1.5 transition-colors hover:bg-bg-sunken disabled:opacity-40"
        @click="setQuery({ page: String((filters.page ?? 1) + 1) })"
      >
        Next
      </button>
    </nav>
  </div>
</template>
