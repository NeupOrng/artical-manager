<script setup lang="ts">
import type { AnalyticsRange } from '~/types/api'

/**
 * The dashboard. Two genuinely different screens behind one route, chosen by
 * principal kind.
 *
 * Branching on `kind` rather than one layout with blanks: a platform admin has
 * no articles, and a "0 published" tile would state something false. The
 * correct answer is that the question does not apply to them.
 *
 * For authors the page answers, top to bottom: how is it reading (figures and
 * the daily chart), what is reading (articles, sections, sources), and what is
 * ready to go (pipeline) — then the recent work. Readership comes from
 * analytics and may be missing; the editorial half never is. See
 * docs/proposals/dashboard-analytics-umami.md.
 */
const route = useRoute()
const router = useRouter()
const { data: dashboard, error, status, refresh } = await useDashboard()
const { relative, absolute } = useRelativeTime()

/** The range lives in the URL, like the article filters: shareable, survives refresh. */
const RANGES: AnalyticsRange[] = ['7d', '30d', '90d']
const range = computed<AnalyticsRange>({
  get: () => {
    const q = route.query.range as AnalyticsRange
    return RANGES.includes(q) ? q : '30d'
  },
  set: value => router.replace({ query: { ...route.query, range: value === '30d' ? undefined : value } }),
})
const PERIOD: Record<AnalyticsRange, { prior: string, last: string }> = {
  '7d': { prior: 'prior 7 days', last: 'last 7 days' },
  '30d': { prior: 'prior 30 days', last: 'last 30 days' },
  '90d': { prior: 'prior 90 days', last: 'last 90 days' },
}

const isAuthor = computed(() => dashboard.value?.kind === 'author')
const {
  data: analytics,
  status: analyticsStatus,
  error: analyticsError,
  refresh: refreshAnalytics,
} = useDashboardAnalytics(range, isAuthor)

/** Contributors see their own work — known from the role before analytics loads. */
const isMine = computed(() => dashboard.value?.kind === 'author' && dashboard.value.role === 'contributor')

const readership = computed(() => {
  const r = analytics.value?.readership
  return r?.status === 'ok' ? r : null
})

/** One word for what the readership panels should show. */
const readershipState = computed<'loading' | 'ok' | 'not-connected' | 'unavailable'>(() => {
  if (analyticsError.value) return 'unavailable'
  if (!analytics.value) return analyticsStatus.value === 'pending' || analyticsStatus.value === 'idle' ? 'loading' : 'unavailable'
  return analytics.value.readership.status
})

const draftTotal = computed(() =>
  dashboard.value?.kind === 'author'
    ? (isMine.value ? dashboard.value.mine.draft : dashboard.value.articles.draft)
    : 0)

const categoryItems = computed(() =>
  (readership.value?.byCategory ?? []).map(c => ({
    key: c.categoryId ?? 'uncategorised',
    label: c.name,
    value: c.views,
    share: c.share,
    note: c.retired ? 'retired' : undefined,
  })))

const sourceItems = computed(() => {
  const sources = readership.value?.sources ?? []
  const total = sources.reduce((t, s) => t + s.views, 0) || 1
  return sources.map(s => ({ key: s.source, label: s.source, value: s.views, share: s.views / total }))
})

useHead({ title: 'Dashboard · Artical' })
</script>

<template>
  <div>
    <!-- Loading. Skeleton rows rather than a spinner: the shape of what is
         coming is more useful than the fact that something is coming, and it
         stops the layout jumping when data lands. -->
    <div v-if="status === 'pending'" class="animate-pulse space-y-6">
      <div class="h-7 w-56 rounded-md bg-bg-sunken" />
      <div class="h-20 rounded-lg border border-border bg-panel" />
      <div class="h-64 rounded-lg border border-border bg-panel" />
    </div>

    <!--
      The middleware redirects 401 and 403, so an error reaching here is
      something else — almost always the backend being down. Say that, and say
      what is unaffected: an author seeing a failed admin screen reasonably
      fears their live sites are down too, and they are not.
    -->
    <div
      v-else-if="error"
      class="flex items-start gap-3 rounded-lg border border-border bg-danger-surface px-4 py-3.5"
      role="alert"
    >
      <AppIcon name="warning" class="mt-0.5 text-danger" />
      <div class="text-[0.8125rem]">
        <p class="font-medium text-danger">
          Could not load the dashboard
        </p>
        <p class="mt-0.5 text-fg-muted">
          The backend is not responding. Your published sites are unaffected —
          they serve from cache — but editing is unavailable until it recovers.
        </p>
      </div>
    </div>

    <!-- ───────────────────────────── Tenant author ───────────────────────── -->
    <template v-else-if="dashboard?.kind === 'author'">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">
            {{ isMine ? 'Your stories' : dashboard.tenantName }}
          </h1>
          <p class="mt-1 text-[0.8125rem] text-fg-muted">
            <template v-if="isMine">
              How your articles on {{ dashboard.tenantName }} are reading.
            </template>
            <template v-else>
              How the site is reading, and what is ready to go.
            </template>
          </p>
        </div>
        <RangeTabs v-model="range" />
      </header>

      <dl class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <StatFigure
          class="bg-panel"
          label="Views"
          :value="readership?.views.current ?? null"
          :delta="readership?.views ?? null"
          :period="PERIOD[range].prior"
          :hint="readershipState === 'loading' ? 'Loading…' : readershipState === 'ok' ? undefined : 'Analytics not available'"
        />
        <StatFigure
          class="bg-panel"
          label="Published"
          :value="analytics?.editorial.published.current ?? null"
          :delta="analytics?.editorial.published ?? null"
          :period="PERIOD[range].prior"
        />
        <StatFigure
          class="bg-panel"
          label="Views per new article"
          :value="readership?.firstWeekViewsPerNewArticle ?? null"
          :hint="readership && readership.firstWeekViewsPerNewArticle === null
            ? 'Needs an article at least a week old'
            : 'In its first 7 days'"
        />
        <StatFigure
          class="bg-panel"
          label="Ready to publish"
          :value="analytics?.editorial.pipeline.ready ?? null"
          :hint="`Of ${draftTotal} ${draftTotal === 1 ? 'draft' : 'drafts'}`"
        />
      </dl>

      <!-- The daily chart. The one place the page shows change over time. -->
      <section class="mt-4 rounded-lg border border-border bg-panel p-4" aria-labelledby="views-heading">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="views-heading" class="text-[0.8125rem] font-semibold">
            Views per day
          </h2>
          <span v-if="readership" class="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span class="inline-block size-2 rounded-full bg-fg" aria-hidden="true" />
            Article published
          </span>
        </div>

        <div class="mt-3">
          <div v-if="readershipState === 'loading'" class="h-44 animate-pulse rounded-md bg-bg-sunken" />
          <AnalyticsNotice
            v-else-if="readershipState === 'not-connected' || readershipState === 'unavailable'"
            :status="readershipState"
            @retry="refreshAnalytics()"
          />
          <ViewsChart
            v-else-if="readership && analytics"
            :days="readership.daily"
            :published="analytics.editorial.publishedByDay"
          />
        </div>

        <p v-if="readership && analytics" class="mt-3 text-xs text-fg-subtle">
          Days in {{ analytics.timezone }}. Views are counted once per article per
          browser session and filtered for bots, so they can differ slightly from
          the count shown on the site.
        </p>
      </section>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <!-- What is reading. -->
        <section class="self-start rounded-lg border border-border bg-panel" aria-labelledby="top-heading">
          <h2 id="top-heading" class="px-4 pb-2 pt-3.5 text-[0.8125rem] font-semibold">
            Top articles <span class="font-normal text-fg-subtle">· {{ PERIOD[range].last }}</span>
          </h2>
          <div v-if="readershipState === 'loading'" class="mx-4 mb-4 h-40 animate-pulse rounded-md bg-bg-sunken" />
          <p v-else-if="!readership" class="px-4 pb-4 text-[0.8125rem] text-fg-muted">
            Appears once view analytics are available.
          </p>
          <TopArticles v-else :articles="readership.topArticles" />
        </section>

        <div class="grid content-start gap-4">
          <section class="rounded-lg border border-border bg-panel p-4" aria-labelledby="category-heading">
            <h2 id="category-heading" class="mb-3 text-[0.8125rem] font-semibold">
              Views by category
            </h2>
            <div v-if="readershipState === 'loading'" class="h-24 animate-pulse rounded-md bg-bg-sunken" />
            <p v-else-if="!readership" class="text-[0.8125rem] text-fg-muted">
              Appears once view analytics are available.
            </p>
            <ShareBars v-else :items="categoryItems" empty-text="No article views in this period." />
          </section>

          <!-- Site-wide only: sources cannot be split per author honestly. -->
          <section v-if="!isMine" class="rounded-lg border border-border bg-panel p-4" aria-labelledby="sources-heading">
            <h2 id="sources-heading" class="mb-3 text-[0.8125rem] font-semibold">
              Top sources
            </h2>
            <div v-if="readershipState === 'loading'" class="h-24 animate-pulse rounded-md bg-bg-sunken" />
            <p v-else-if="!readership" class="text-[0.8125rem] text-fg-muted">
              Appears once view analytics are available.
            </p>
            <ShareBars v-else :items="sourceItems" empty-text="No views in this period." />
          </section>

          <!-- Editorial: always available, analytics or not. -->
          <section class="rounded-lg border border-border bg-panel p-4" aria-labelledby="pipeline-heading">
            <h2 id="pipeline-heading" class="mb-2 text-[0.8125rem] font-semibold">
              {{ isMine ? 'Your drafts' : 'Publishing pipeline' }}
            </h2>
            <div v-if="!analytics" class="h-24 animate-pulse rounded-md bg-bg-sunken" />
            <PipelineList v-else :pipeline="analytics.editorial.pipeline" :mine="isMine" />
          </section>

          <section v-if="analytics?.authors" class="rounded-lg border border-border bg-panel p-4" aria-labelledby="authors-heading">
            <h2 id="authors-heading" class="mb-2 text-[0.8125rem] font-semibold">
              Authors <span class="font-normal text-fg-subtle">· {{ PERIOD[range].last }}</span>
            </h2>
            <AuthorsPanel :authors="analytics.authors" />
          </section>
        </div>
      </div>

      <section class="mt-8" aria-labelledby="recent-heading">
        <h2 id="recent-heading" class="text-[0.9375rem] font-semibold">
          Recently edited
        </h2>

        <!-- Empty state. Says what will appear and what to do, rather than
             "No data". -->
        <div
          v-if="dashboard.recent.length === 0"
          class="mt-3 rounded-lg border border-dashed border-border-strong bg-panel px-6 py-10 text-center"
        >
          <p class="text-[0.8125rem] font-medium">
            Nothing written yet
          </p>
          <p class="mx-auto mt-1 max-w-sm text-[0.8125rem] text-fg-muted">
            Articles appear here as soon as anyone on this site starts one, with
            the most recently edited at the top.
          </p>
        </div>

        <!-- Wide content scrolls in its own container so the page body never
             scrolls horizontally on a narrow window. -->
        <div v-else class="mt-3 overflow-x-auto rounded-lg border border-border bg-panel">
          <table class="w-full min-w-3xl border-collapse text-[0.8125rem]">
            <thead>
              <tr class="border-b border-border text-start text-fg-muted">
                <th scope="col" class="px-4 py-2.5 text-start font-medium">Title</th>
                <th scope="col" class="px-4 py-2.5 text-start font-medium">Status</th>
                <th scope="col" class="px-4 py-2.5 text-start font-medium">Category</th>
                <th scope="col" class="px-4 py-2.5 text-start font-medium">Author</th>
                <th scope="col" class="px-4 py-2.5 text-end font-medium">Edited</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="article in dashboard.recent.slice(0, 5)"
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
                  <!-- The slug is an identifier, so it is mono. That is the
                       whole rule for mono in this app. -->
                  <span class="mt-0.5 block max-w-md truncate font-mono text-xs text-fg-subtle">
                    {{ article.slug }}
                  </span>
                </td>
                <td class="px-4 py-2.5">
                  <StatusPill :status="article.status" />
                </td>
                <td class="px-4 py-2.5 text-fg-muted">
                  {{ article.categoryName ?? '—' }}
                </td>
                <td class="px-4 py-2.5 text-fg-muted">
                  {{ article.authorName }}
                </td>
                <!-- Relative for scanning, exact on hover for when something
                     looks wrong. -->
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

        <p class="mt-3 text-[0.8125rem]">
          <NuxtLink
            to="/articles"
            class="text-fg-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
          >
            All articles →
          </NuxtLink>
        </p>
      </section>
    </template>

    <!-- ──────────────────────────── Platform admin ───────────────────────── -->
    <template v-else-if="dashboard?.kind === 'platform-admin'">
      <h1 class="text-xl font-semibold">
        Sites
      </h1>
      <p class="mt-1 text-[0.8125rem] text-fg-muted">
        Every publication on this installation.
      </p>

      <dl class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <StatFigure class="bg-panel" label="Sites" :value="dashboard.tenantCount" />
        <StatFigure
          class="bg-panel"
          label="Authors"
          :value="dashboard.authorCount"
          hint="Across all sites"
        />
      </dl>

      <div class="mt-8 overflow-x-auto rounded-lg border border-border bg-panel">
        <table class="w-full min-w-3xl border-collapse text-[0.8125rem]">
          <thead>
            <tr class="border-b border-border text-fg-muted">
              <th scope="col" class="px-4 py-2.5 text-start font-medium">Site</th>
              <th scope="col" class="px-4 py-2.5 text-start font-medium">Domain</th>
              <th scope="col" class="px-4 py-2.5 text-end font-medium">Authors</th>
              <th scope="col" class="px-4 py-2.5 text-end font-medium">Published</th>
              <th scope="col" class="px-4 py-2.5 text-end font-medium">Drafts</th>
              <th scope="col" class="px-4 py-2.5 text-end font-medium">Views · 30 days</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tenant in dashboard.tenants"
              :key="tenant.id"
              class="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle"
            >
              <td class="px-4 py-2.5">
                <span class="flex items-center gap-2 font-medium">
                  <AppIcon name="site" :size="14" class="text-fg-subtle" />
                  {{ tenant.name }}
                </span>
                <span class="mt-0.5 block ps-6 text-xs text-fg-subtle">{{ tenant.nicheLabel }}</span>
              </td>
              <!-- A domain is an identifier. Mono, and linked out, because the
                   one thing an operator actually does with it is go look. -->
              <td class="px-4 py-2.5">
                <a
                  :href="`http://${tenant.domain}`"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1.5 font-mono text-xs text-fg-muted underline-offset-2 hover:text-accent hover:underline"
                >
                  {{ tenant.domain }}
                  <AppIcon name="external" :size="12" />
                </a>
              </td>
              <td class="tnum px-4 py-2.5 text-end text-fg-muted">{{ tenant.authorCount }}</td>
              <td class="tnum px-4 py-2.5 text-end">{{ tenant.publishedCount }}</td>
              <td class="tnum px-4 py-2.5 text-end text-fg-muted">{{ tenant.draftCount }}</td>
              <!-- An aggregate like the counts beside it. A dash, not zero, when
                   analytics is not set up — "unknown" must not read as "none". -->
              <td
                class="tnum px-4 py-2.5 text-end"
                :title="tenant.views30d === null ? 'View analytics are not set up for this site, or are unavailable' : undefined"
              >
                {{ tenant.views30d === null ? '—' : tenant.views30d.toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        States the boundary rather than leaving it looking like missing
        functionality. Counts without titles is the isolation rule working.
      -->
      <p class="mt-4 max-w-prose text-xs text-fg-subtle">
        Platform accounts manage sites and their authors. They have no access to
        any site's articles, which is why only counts appear here.
      </p>
    </template>

    <!--
      Fallback. Without it this page can render NOTHING: the branches above cover
      pending, error, author and platform-admin, and any other combination — data
      resolved but null, or a `kind` this build does not know — falls through to
      an empty <div> and a blank screen with no console error to explain it.
      A page that can render nothing eventually will.
    -->
    <div
      v-else
      class="rounded-lg border border-dashed border-border-strong bg-panel px-6 py-10 text-center"
    >
      <p class="text-[0.8125rem] font-medium">
        Nothing to show
      </p>
      <p class="mx-auto mt-1 max-w-sm text-[0.8125rem] text-fg-muted">
        Your account loaded but returned no dashboard. Reloading usually fixes
        it; if it does not, sign out and back in.
      </p>
      <button
        type="button"
        class="mt-4 rounded-md border border-border bg-bg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors hover:bg-bg-sunken"
        @click="refresh()"
      >
        Reload
      </button>
    </div>
  </div>
</template>
