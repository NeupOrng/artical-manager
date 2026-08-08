<script setup lang="ts">
/**
 * The dashboard. Two genuinely different screens behind one route, chosen by
 * principal kind.
 *
 * Branching on `kind` rather than one layout with blanks: a platform admin has
 * no articles, and a "0 published" tile would state something false. The
 * correct answer is that the question does not apply to them.
 *
 * The TABLE is the page. The figures above it are reference values on the way
 * down, deliberately quiet — see StatFigure.
 */
const { data: dashboard, error, status, refresh } = await useDashboard()
const { relative, absolute } = useRelativeTime()

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
      <h1 class="text-xl font-semibold">
        {{ dashboard.tenantName }}
      </h1>
      <p class="mt-1 text-[0.8125rem] text-fg-muted">
        Everything written for this site, most recently edited first.
      </p>

      <dl class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <StatFigure
          class="bg-panel"
          label="Published"
          :value="dashboard.articles.published"
        />
        <StatFigure
          class="bg-panel"
          label="Drafts"
          :value="dashboard.articles.draft"
          hint="Across all authors"
        />
        <StatFigure
          class="bg-panel"
          label="Yours"
          :value="dashboard.mine.total"
          :hint="`${dashboard.mine.draft} unfinished`"
        />
        <StatFigure
          class="bg-panel"
          label="Media"
          :value="dashboard.mediaCount"
        />
      </dl>

      <section class="mt-8">
        <h2 class="text-[0.9375rem] font-semibold">
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
                v-for="article in dashboard.recent"
                :key="article.id"
                class="border-b border-border transition-colors last:border-b-0 hover:bg-bg-subtle"
              >
                <td class="px-4 py-2.5">
                  <span class="block max-w-md truncate font-medium" :title="article.title">
                    {{ article.title }}
                  </span>
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
