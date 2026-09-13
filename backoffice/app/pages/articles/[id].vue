<script setup lang="ts">
import type { ArticleDetail } from '~/types/api'

/**
 * The article editor.
 *
 * The publish requirements (excerpt, cover image) are shown as a **visible
 * checklist while writing**, not as a 422 at the moment someone hits publish —
 * backoffice/CLAUDE.md. The API still enforces them, so the 422 is handled
 * gracefully anyway; the checklist just means nobody should ever see it.
 *
 * The body is a real TipTap editor whose extension set mirrors what the public
 * sites can render — see ArticleEditor.vue. The cover image is a real upload
 * that goes browser → storage directly, never through this app's server.
 */
const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id as string)

const { data: article, error, refresh } = useArticle(id)
const { update, publish, unpublish, remove } = useArticleActions()
const { parse } = useApiError()
const { data: me } = await useMe()
const { relative, absolute } = useRelativeTime()
const { categories } = useCategories()

/**
 * The article's saved category when it is NOT in the live list — i.e. retired.
 * Built from the article response (which keeps retired labels on purpose), so
 * no second request is needed.
 */
const retiredCurrent = computed(() => {
  const a = article.value
  if (!a?.categoryId) return null
  if (categories.value.some(c => c.id === a.categoryId)) return null
  return { id: a.categoryId, name: a.categoryName ?? 'Retired category' }
})

const EMPTY_DOC = { type: 'doc', content: [] }

/** Local edit buffer. Populated once the article loads and on every refresh. */
const form = reactive({
  title: '',
  slug: '',
  excerpt: '',
  coverImage: '',
  /** Empty string is the "no category" option — see the select below. */
  categoryId: '',
  /** TipTap document, held as an object — the editor owns its shape. */
  content: EMPTY_DOC as unknown,
})

const hydrate = (a: ArticleDetail) => {
  form.title = a.title
  form.slug = a.slug
  form.excerpt = a.excerpt ?? ''
  form.coverImage = a.coverImage ?? ''
  form.categoryId = a.categoryId ?? ''
  form.content = a.content ?? EMPTY_DOC
}

watch(article, a => a && hydrate(a), { immediate: true })

const saving = ref(false)
const busy = ref(false)
const message = ref<{ kind: 'error' | 'ok', text: string } | null>(null)

/**
 * Live checklist, computed from the FORM rather than from the server response,
 * so it clears the moment an author types an excerpt instead of after a save.
 * The server's `missingToPublish` remains the authority at publish time.
 */
const missing = computed(() => {
  const out: string[] = []
  if (!form.excerpt.trim()) out.push('an excerpt')
  if (!form.coverImage.trim()) out.push('a cover image')
  return out
})

const canPublish = computed(() => missing.value.length === 0)

/** Publishing is an editor's call. Hiding it is cosmetic — the API enforces it. */
const mayPublish = computed(
  () => me.value?.kind === 'author' && me.value.role !== 'contributor',
)

const isDirty = computed(() => {
  const a = article.value
  if (!a) return false
  return (
    form.title !== a.title
    || form.slug !== a.slug
    || form.excerpt !== (a.excerpt ?? '')
    || form.coverImage !== (a.coverImage ?? '')
    || form.categoryId !== (a.categoryId ?? '')
    || JSON.stringify(form.content) !== JSON.stringify(a.content ?? EMPTY_DOC)
  )
})

async function save() {
  if (!article.value) return
  saving.value = true
  message.value = null
  try {
    const body: Record<string, unknown> = {
      title: form.title,
      // Empty string clears the field; the aggregate collapses it to null.
      excerpt: form.excerpt.trim() || null,
      coverImage: form.coverImage.trim() || null,
      content: form.content ?? EMPTY_DOC,
    }
    // Only send the slug when it changed. Sending it unchanged on a published
    // article would trip the slug lock for no reason.
    if (form.slug !== article.value.slug) body.slug = form.slug
    // Likewise the category: an article may sit in a category retired since it
    // was chosen, and re-sending that id asks the API to validate a choice
    // nobody made. '' is the "no category" option; the API takes null to clear.
    if (form.categoryId !== (article.value.categoryId ?? '')) {
      body.categoryId = form.categoryId || null
    }

    await update(id.value, body)
    await refresh()
    message.value = { kind: 'ok', text: 'Saved.' }
  }
  catch (e) {
    message.value = { kind: 'error', text: parse(e).message }
  }
  finally {
    saving.value = false
  }
}

async function runTransition(action: 'publish' | 'unpublish') {
  busy.value = true
  message.value = null
  try {
    // Save first so the transition acts on what is on screen — publishing an
    // article while unsaved edits sit in the form is the worst kind of
    // surprise, because the live page then differs from what the author saw.
    if (isDirty.value) await save()
    await (action === 'publish' ? publish(id.value) : unpublish(id.value))
    await refresh()
    message.value = {
      kind: 'ok',
      text: action === 'publish' ? 'Published — it is live now.' : 'Returned to draft.',
    }
  }
  catch (e) {
    message.value = { kind: 'error', text: parse(e).message }
  }
  finally {
    busy.value = false
  }
}

async function destroy() {
  // eslint-disable-next-line no-alert
  if (!confirm('Delete this article? This cannot be undone.')) return
  busy.value = true
  try {
    await remove(id.value)
    await router.push('/articles')
  }
  catch (e) {
    message.value = { kind: 'error', text: parse(e).message }
    busy.value = false
  }
}

/**
 * ⌘S / Ctrl-S saves.
 *
 * This is a tool people use all day, and the muscle memory is universal — without
 * it the browser's own "save page" dialog fires over the editor, which is both
 * useless and alarming. `preventDefault` is the point of the handler.
 */
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (isDirty.value && !saving.value && !busy.value) save()
  }
}

/**
 * Unsaved-work guards. An article body is real work and losing it is the worst
 * thing this screen can do.
 *
 * Two are needed because they cover different exits: `beforeunload` catches a
 * closed tab or a typed URL, and the router guard catches in-app navigation,
 * which never triggers `beforeunload` in an SPA.
 */
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!isDirty.value) return
  e.preventDefault()
  // Browsers ignore custom text now, but assigning returnValue is still what
  // arms the prompt in several of them.
  e.returnValue = ''
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (!isDirty.value) return true
  // eslint-disable-next-line no-alert
  return confirm('You have unsaved changes. Leave without saving?')
})

useHead({ title: () => `${article.value?.title ?? 'Article'} · Artical` })
</script>

<template>
  <div>
    <NuxtLink
      to="/articles"
      class="text-[0.8125rem] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
    >
      ← Articles
    </NuxtLink>

    <div
      v-if="error"
      class="mt-4 rounded-lg border border-border bg-danger-surface px-4 py-3.5 text-[0.8125rem] text-danger"
      role="alert"
    >
      That article does not exist, or it belongs to another site.
    </div>

    <template v-else-if="article">
      <header class="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <StatusPill :status="article.status" />
            <span class="text-xs text-fg-subtle" :title="absolute(article.updatedAt)">
              edited {{ relative(article.updatedAt) }}
            </span>
          </div>
          <p class="mt-1.5 text-[0.8125rem] text-fg-muted">
            by {{ article.authorName }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="saving || busy || !isDirty"
            class="rounded-md border border-border bg-panel px-3 py-2 text-[0.8125rem] font-medium transition-colors hover:bg-bg-sunken disabled:opacity-40"
            @click="save"
          >
            {{ saving ? 'Saving…' : isDirty ? 'Save' : 'Saved' }}
          </button>

          <button
            v-if="mayPublish && article.status === 'draft'"
            type="button"
            :disabled="busy || !canPublish"
            :title="canPublish ? undefined : `Still needs ${missing.join(' and ')}`"
            class="rounded-md bg-accent px-3 py-2 text-[0.8125rem] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
            @click="runTransition('publish')"
          >
            Publish
          </button>

          <button
            v-else-if="mayPublish"
            type="button"
            :disabled="busy"
            class="rounded-md border border-border bg-panel px-3 py-2 text-[0.8125rem] font-medium transition-colors hover:bg-bg-sunken disabled:opacity-40"
            @click="runTransition('unpublish')"
          >
            Unpublish
          </button>
        </div>
      </header>

      <p
        v-if="message"
        class="mt-3 rounded-md border border-border px-3 py-2 text-[0.8125rem]"
        :class="message.kind === 'error'
          ? 'bg-danger-surface text-danger'
          : 'bg-live-surface text-live'"
        :role="message.kind === 'error' ? 'alert' : 'status'"
      >
        {{ message.text }}
      </p>

      <!--
        The requirement, stated while writing. Both fields feed the social share
        preview, which is the reason they are mandatory — saying that is more
        useful than "required field".
      -->
      <div
        v-if="missing.length && article.status === 'draft'"
        class="mt-4 flex items-start gap-2.5 rounded-lg border border-border bg-draft-surface px-4 py-3 text-[0.8125rem]"
      >
        <AppIcon name="warning" class="mt-0.5 shrink-0 text-draft" />
        <p class="text-draft">
          Needs {{ missing.join(' and ') }} before it can be published. Both feed
          the preview people see when the link is shared.
        </p>
      </div>

      <!--
        The editor column is CAPPED at 38rem rather than taking all remaining
        width, and the text fills it edge to edge with no inner max-width.

        Sizing the CONTAINER rather than the text is what fixes this. Capping
        the measure inside a full-width panel left ~40% dead space and read as
        broken layout; centring that narrow measure read as a stray indent. The
        container is the thing that was wrong.

        40rem lands the measure at ~68ch — measured with a real glyph probe, not
        guessed. 46rem was the first attempt and produced ~95ch, well past the
        65–75ch band and tiring to read across.
      -->
      <div class="mt-6 grid justify-center gap-6 lg:grid-cols-[minmax(0,40rem)_19rem] lg:items-start">
        <!-- Writing surface -->
        <div class="space-y-4">
          <label class="block">
            <span class="text-[0.8125rem] font-medium">Title</span>
            <input
              v-model="form.title"
              type="text"
              maxlength="300"
              class="mt-1.5 w-full rounded-md border border-border bg-panel px-3 py-2 text-[0.9375rem] font-medium transition-colors hover:border-border-strong focus:border-accent"
            >
          </label>

          <div>
            <span class="text-[0.8125rem] font-medium">Body</span>
            <!--
              The editor emits exactly the node set the public sites can render.
              Adding a node type is a platform change — see ArticleEditor.vue.
            -->
            <ArticleEditor v-model="form.content" class="mt-1.5" />
          </div>
        </div>

        <!-- Metadata. A sidebar because these are set once and then left alone,
             while the title and body are worked on continuously. -->
        <aside class="space-y-4 rounded-lg border border-border bg-panel p-4">
          <label class="block">
            <span class="text-[0.8125rem] font-medium">Category</span>
            <!--
              A native <select>. The taxonomy is a handful of entries, so a
              custom listbox would add keyboard and screen-reader surface for
              nothing — and this is the one control an author touches on a
              phone, where the native picker is strictly better.
            -->
            <select
              v-model="form.categoryId"
              class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] transition-colors hover:border-border-strong focus:border-accent"
            >
              <!-- Uncategorised is a real, reachable state: category_id is
                   nullable and publishing does not require one. -->
              <option value="">
                Uncategorised
              </option>
              <option v-for="c in categories" :key="c.id" :value="c.id">
                {{ c.name }} ({{ c.articleCount }})
              </option>
              <!-- The article's current category, when it has been retired.
                   The picker only lists live ones, so without this the select
                   would have no matching option and render blank — reading as
                   "Uncategorised" when the article is still filed elsewhere. -->
              <option v-if="retiredCurrent" :value="retiredCurrent.id" disabled>
                {{ retiredCurrent.name }} (retired)
              </option>
            </select>
            <span v-if="retiredCurrent && form.categoryId === retiredCurrent.id" class="mt-1 block text-xs text-fg-muted">
              This category was retired. The article no longer appears under it on
              the site; pick another to re-file it.
            </span>
            <span v-else-if="!categories.length" class="mt-1 block text-xs text-fg-subtle">
              This site has no categories yet.
            </span>
          </label>

          <label class="block">
            <span class="text-[0.8125rem] font-medium">Excerpt</span>
            <textarea
              v-model="form.excerpt"
              rows="4"
              maxlength="500"
              placeholder="One or two sentences. Shown under the headline and in the share preview."
              class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent"
            />
            <span class="tnum mt-1 block text-xs text-fg-subtle">
              {{ form.excerpt.length }}/500
            </span>
          </label>

          <CoverImageField v-model="form.coverImage" />

          <label class="block">
            <span class="text-[0.8125rem] font-medium">Slug</span>
            <input
              v-model="form.slug"
              type="text"
              :disabled="article.status === 'published'"
              class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs transition-colors hover:border-border-strong focus:border-accent disabled:opacity-60"
            >
            <span class="mt-1 block text-xs text-fg-subtle">
              <template v-if="article.status === 'published'">
                Locked — this is a live URL that is already shared and cached.
                Unpublish first to change it.
              </template>
              <template v-else>
                The public URL segment.
              </template>
            </span>
          </label>

          <div v-if="mayPublish" class="border-t border-border pt-4">
            <button
              type="button"
              :disabled="busy"
              class="text-[0.8125rem] text-danger underline-offset-2 hover:underline disabled:opacity-40"
              @click="destroy"
            >
              Delete article
            </button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
