<script setup lang="ts">
import type { Category, CategoryPatch } from '~/types/api'

/**
 * The site's sections. What an editor manages here is, directly, the public
 * navigation: the order on this page is the order of the nav, and every slug is
 * a live URL. So the page says what each action does to the site before it
 * happens — a slug change warns that the URL moves, a retire says how many
 * articles are filed there — rather than leaving that to be discovered.
 *
 * Every rule (slug shape, uniqueness, what a valid order is) is the API's. This
 * page maps its error codes onto the field they belong to and nothing more.
 */
const { data: me } = await useMe()
const { parse } = useApiError()
const { relative, absolute } = useRelativeTime()
const {
  live, retired, status, error, refresh,
  create, update, retire, restore, reorder,
} = useCategoryAdmin()

/** Cosmetic — the API refuses contributors (403) whatever this shows. */
const mayEdit = computed(
  () => me.value?.kind === 'author' && me.value.role !== 'contributor',
)

// ── Feedback ────────────────────────────────────────────────────────────────

const flash = ref<{ kind: 'ok' | 'error', text: string } | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined
function say(kind: 'ok' | 'error', text: string) {
  clearTimeout(flashTimer)
  flash.value = { kind, text }
  // Successes fade; errors stay until the next action, because an error that
  // disappears before it is read is an error that did not happen.
  if (kind === 'ok') flashTimer = setTimeout(() => (flash.value = null), 5000)
}

interface FieldErrors { name?: string, slug?: string, form?: string }

/**
 * Puts an API error next to the field it is about. `slugGiven` decides where an
 * unsluggable error belongs: with no explicit slug it came from the name.
 */
function toFieldErrors(e: unknown, slugGiven: boolean): FieldErrors {
  const { code, message } = parse(e)
  switch (code) {
    case 'CATEGORY_SLUG_TAKEN':
      return { slug: 'Another live category already uses this slug.' }
    case 'CATEGORY_NAME_EMPTY':
      return { name: 'A category needs a name.' }
    case 'CATEGORY_NAME_UNSLUGGABLE':
      return slugGiven
        ? { slug: 'Needs at least one letter or digit.' }
        : { name: 'Needs at least one letter or digit to make a URL from.' }
    case 'CATEGORY_NOT_FOUND':
      return { form: 'This category no longer exists — a colleague may have retired it. Reload to see the current list.' }
    default:
      return { form: message }
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

const creating = ref(false)
const createBusy = ref(false)
const createErrors = ref<FieldErrors>({})
const draft = reactive({ name: '', slug: '', description: '' })
const createName = ref<HTMLInputElement | null>(null)

async function openCreate() {
  creating.value = true
  await nextTick()
  createName.value?.focus()
}

function closeCreate() {
  creating.value = false
  createErrors.value = {}
  Object.assign(draft, { name: '', slug: '', description: '' })
}

async function submitCreate() {
  createBusy.value = true
  createErrors.value = {}
  const slug = draft.slug.trim()
  try {
    const created = await create({
      name: draft.name,
      slug: slug || undefined,
      description: draft.description.trim() || undefined,
    })
    closeCreate()
    say('ok', `Created “${created.name}” at /category/${created.slug}. It is last in the nav.`)
  }
  catch (e) {
    createErrors.value = toFieldErrors(e, !!slug)
  }
  finally {
    createBusy.value = false
  }
}

// ── Edit ────────────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null)
const editBusy = ref(false)
const editErrors = ref<FieldErrors>({})
const edit = reactive({ name: '', slug: '', description: '' })

const editing = computed(() => live.value.find(c => c.id === editingId.value) ?? null)

/** The URL is about to move. Shown before saving, not discovered after. */
const slugMoving = computed(() => {
  const next = edit.slug.trim()
  return !!editing.value && !!next && next !== editing.value.slug
})

function openEdit(c: Category) {
  confirmingId.value = null
  editingId.value = c.id
  editErrors.value = {}
  Object.assign(edit, { name: c.name, slug: c.slug, description: c.description ?? '' })
}

function closeEdit() {
  editingId.value = null
  editErrors.value = {}
}

async function submitEdit() {
  const c = editing.value
  if (!c) return

  // Send only what changed. PATCH semantics make that correct either way, but a
  // minimal body keeps "renamed" from also looking like "moved" in the logs.
  const patch: CategoryPatch = {}
  if (edit.name.trim() !== c.name) patch.name = edit.name
  if (edit.slug.trim() !== c.slug) patch.slug = edit.slug.trim()
  const description = edit.description.trim() || null
  if (description !== c.description) patch.description = description

  if (!Object.keys(patch).length) return closeEdit()

  editBusy.value = true
  editErrors.value = {}
  try {
    const updated = await update(c.id, patch)
    closeEdit()
    say('ok', patch.slug
      ? `Saved. “${updated.name}” now lives at /category/${updated.slug}; the old URL redirects there.`
      : `Saved “${updated.name}”.`)
  }
  catch (e) {
    editErrors.value = toFieldErrors(e, patch.slug !== undefined)
  }
  finally {
    editBusy.value = false
  }
}

// ── Retire ──────────────────────────────────────────────────────────────────

const confirmingId = ref<string | null>(null)
const retireBusy = ref(false)

function askRetire(c: Category) {
  editingId.value = null
  confirmingId.value = c.id
}

async function confirmRetire(c: Category) {
  retireBusy.value = true
  try {
    await retire(c.id)
    confirmingId.value = null
    say('ok', `Retired “${c.name}”. It is listed under Retired below if you need it back.`)
  }
  catch (e) {
    say('error', parse(e).message)
  }
  finally {
    retireBusy.value = false
  }
}

// ── Restore ─────────────────────────────────────────────────────────────────

const restoringId = ref<string | null>(null)

async function doRestore(c: Category) {
  restoringId.value = c.id
  try {
    await restore(c.id)
    say('ok', `Restored “${c.name}” to the end of the nav, with its ${c.articleCount} ${c.articleCount === 1 ? 'article' : 'articles'}.`)
  }
  catch (e) {
    const { code, message } = parse(e)
    say('error', code === 'CATEGORY_SLUG_TAKEN'
      ? `Cannot restore “${c.name}”: a live category now uses /category/${c.slug}. Change that one’s slug first.`
      : message)
  }
  finally {
    restoringId.value = null
  }
}

// ── Reorder ─────────────────────────────────────────────────────────────────

/**
 * The server's order, overridden by a pending move so it shows at once.
 *
 * A computed, NOT a ref kept in sync by `watch`: watchers do not run during
 * SSR, so a watched copy rendered every server response as "No categories
 * yet" — then hydrated into a mismatch. A failure simply drops the override.
 */
const pendingOrder = ref<string[] | null>(null)
const rows = computed<Category[]>(() => {
  if (!pendingOrder.value) return live.value
  const byId = new Map(live.value.map(c => [c.id, c]))
  return pendingOrder.value.flatMap(id => byId.get(id) ?? [])
})
const reordering = ref(false)

async function move(index: number, delta: -1 | 1) {
  const to = index + delta
  if (to < 0 || to >= rows.value.length) return

  const next = rows.value.map(c => c.id)
  const [id] = next.splice(index, 1)
  next.splice(to, 0, id!)
  pendingOrder.value = next

  reordering.value = true
  try {
    await reorder(next)
  }
  catch (e) {
    const { code, message } = parse(e)
    if (code === 'CATEGORY_ORDER_STALE') {
      await refresh()
      say('error', 'The categories changed since this page loaded. The list is updated — try the move again.')
    }
    else {
      say('error', message)
    }
  }
  finally {
    // Success refreshed `live` to the new order; failure falls back to it.
    pendingOrder.value = null
    reordering.value = false
  }
}

const articlesLink = (c: Category) => ({ path: '/articles', query: { categoryId: c.id } })

useHead({ title: 'Categories · Artical' })
</script>

<template>
  <div class="max-w-5xl">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          Categories
        </h1>
        <p class="mt-1 text-[0.8125rem] text-fg-muted">
          The sections of the site. The order here is the order of its navigation.
        </p>
      </div>

      <button
        v-if="mayEdit && !creating"
        type="button"
        class="rounded-md bg-accent px-3 py-2 text-[0.8125rem] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
        @click="openCreate"
      >
        New category
      </button>
    </header>

    <p
      v-if="me?.kind === 'author' && !mayEdit"
      class="mt-4 rounded-md border border-border bg-panel px-3 py-2 text-[0.8125rem] text-fg-muted"
    >
      Only editors and admins can change categories. You can file articles under any of these.
    </p>

    <!-- Live region: announces results of actions taken on rows that may
         have just moved or disappeared. -->
    <div aria-live="polite" class="mt-4 empty:hidden">
      <p
        v-if="flash"
        class="flex items-start gap-2 rounded-md border px-3 py-2 text-[0.8125rem]"
        :class="flash.kind === 'error'
          ? 'border-border bg-danger-surface text-danger'
          : 'border-border bg-panel text-fg'"
        :role="flash.kind === 'error' ? 'alert' : undefined"
      >
        <AppIcon v-if="flash.kind === 'error'" name="warning" class="mt-0.5 shrink-0" />
        <span>{{ flash.text }}</span>
      </p>
    </div>

    <!-- Create -->
    <form
      v-if="creating"
      class="mt-4 rounded-lg border border-border bg-panel p-4"
      novalidate
      @submit.prevent="submitCreate"
    >
      <h2 class="text-[0.8125rem] font-semibold">
        New category
      </h2>

      <div class="mt-3 grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="text-[0.8125rem] font-medium">Name</span>
          <input
            ref="createName"
            v-model="draft.name"
            required
            maxlength="80"
            :aria-invalid="!!createErrors.name"
            aria-describedby="create-name-error"
            class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] transition-colors hover:border-border-strong focus:border-accent"
          >
          <span v-if="createErrors.name" id="create-name-error" class="mt-1 block text-xs text-danger">
            {{ createErrors.name }}
          </span>
        </label>

        <label class="block">
          <span class="text-[0.8125rem] font-medium">
            Slug <span class="font-normal text-fg-subtle">optional</span>
          </span>
          <div class="mt-1.5 flex rounded-md border border-border bg-bg transition-colors focus-within:border-accent hover:border-border-strong">
            <span class="select-none py-2 ps-3 font-mono text-xs leading-[1.35rem] text-fg-subtle">/category/</span>
            <input
              v-model="draft.slug"
              maxlength="120"
              pattern="[a-z0-9\-]+"
              title="Lowercase letters, digits and hyphens"
              placeholder="from the name"
              :aria-invalid="!!createErrors.slug"
              aria-describedby="create-slug-error"
              class="min-w-0 flex-1 rounded-e-md bg-transparent py-2 pe-3 font-mono text-xs placeholder:font-sans placeholder:text-fg-subtle"
            >
          </div>
          <span v-if="createErrors.slug" id="create-slug-error" class="mt-1 block text-xs text-danger">
            {{ createErrors.slug }}
          </span>
        </label>

        <label class="block sm:col-span-2">
          <span class="text-[0.8125rem] font-medium">
            Description <span class="font-normal text-fg-subtle">optional</span>
          </span>
          <textarea
            v-model="draft.description"
            rows="2"
            maxlength="300"
            class="mt-1.5 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] transition-colors hover:border-border-strong focus:border-accent"
          />
          <span class="mt-1 flex justify-between gap-3 text-xs text-fg-subtle">
            <span>Shown under the section heading and in link previews.</span>
            <span class="tnum">{{ draft.description.length }}/300</span>
          </span>
        </label>
      </div>

      <p v-if="createErrors.form" class="mt-3 text-[0.8125rem] text-danger" role="alert">
        {{ createErrors.form }}
      </p>

      <div class="mt-4 flex gap-2">
        <button
          type="submit"
          :disabled="createBusy || !draft.name.trim()"
          class="rounded-md bg-accent px-3 py-1.5 text-[0.8125rem] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {{ createBusy ? 'Creating…' : 'Create category' }}
        </button>
        <button
          type="button"
          class="rounded-md border border-border px-3 py-1.5 text-[0.8125rem] transition-colors hover:bg-bg-sunken"
          @click="closeCreate"
        >
          Cancel
        </button>
      </div>
    </form>

    <!-- States -->
    <div v-if="status === 'pending'" class="mt-4 animate-pulse space-y-2">
      <div v-for="n in 4" :key="n" class="h-14 rounded-md border border-border bg-panel" />
    </div>

    <div
      v-else-if="error"
      class="mt-4 flex items-start gap-3 rounded-lg border border-border bg-danger-surface px-4 py-3.5"
      role="alert"
    >
      <AppIcon name="warning" class="mt-0.5 text-danger" />
      <div class="text-[0.8125rem]">
        <p class="font-medium text-danger">
          Could not load categories
        </p>
        <button type="button" class="mt-1 text-fg-muted underline underline-offset-2" @click="refresh()">
          Try again
        </button>
      </div>
    </div>

    <div
      v-else-if="!rows.length"
      class="mt-4 rounded-lg border border-dashed border-border-strong bg-panel px-6 py-12 text-center"
    >
      <p class="text-[0.8125rem] font-medium">
        No categories yet
      </p>
      <p class="mx-auto mt-1 max-w-sm text-[0.8125rem] text-fg-muted">
        Articles can be published uncategorised, but the site’s navigation is
        built from this list, so it stays empty until there is one.
      </p>
    </div>

    <!-- Live categories -->
    <ol v-else class="mt-4 divide-y divide-border rounded-lg border border-border bg-panel" aria-label="Categories in navigation order">
      <li v-for="(c, i) in rows" :key="c.id" class="px-4 py-3">
        <!-- Editing -->
        <form v-if="editingId === c.id" novalidate @submit.prevent="submitEdit">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="text-[0.8125rem] font-medium">Name</span>
              <input
                v-model="edit.name"
                required
                maxlength="80"
                :aria-invalid="!!editErrors.name"
                class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] transition-colors hover:border-border-strong focus:border-accent"
              >
              <span v-if="editErrors.name" class="mt-1 block text-xs text-danger">{{ editErrors.name }}</span>
            </label>

            <label class="block">
              <span class="text-[0.8125rem] font-medium">Slug</span>
              <div class="mt-1.5 flex rounded-md border border-border bg-bg transition-colors focus-within:border-accent hover:border-border-strong">
                <span class="select-none py-2 ps-3 font-mono text-xs leading-[1.35rem] text-fg-subtle">/category/</span>
                <input
                  v-model="edit.slug"
                  required
                  maxlength="120"
                  pattern="[a-z0-9\-]+"
                  title="Lowercase letters, digits and hyphens"
                  :aria-invalid="!!editErrors.slug"
                  class="min-w-0 flex-1 rounded-e-md bg-transparent py-2 pe-3 font-mono text-xs"
                >
              </div>
              <span v-if="editErrors.slug" class="mt-1 block text-xs text-danger">{{ editErrors.slug }}</span>
            </label>

            <label class="block sm:col-span-2">
              <span class="text-[0.8125rem] font-medium">
                Description <span class="font-normal text-fg-subtle">optional</span>
              </span>
              <textarea
                v-model="edit.description"
                rows="2"
                maxlength="300"
                class="mt-1.5 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] transition-colors hover:border-border-strong focus:border-accent"
              />
              <span class="mt-1 block text-end text-xs text-fg-subtle tnum">{{ edit.description.length }}/300</span>
            </label>
          </div>

          <p
            v-if="slugMoving"
            class="mt-3 flex items-start gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2 text-[0.8125rem] text-fg-muted"
          >
            <AppIcon name="warning" class="mt-0.5 shrink-0" />
            <span>
              The section moves to
              <span class="font-mono text-xs text-fg">/category/{{ edit.slug.trim() }}</span>.
              Links to <span class="font-mono text-xs text-fg">/category/{{ c.slug }}</span>
              will redirect there, so shared links keep working.
            </span>
          </p>

          <p v-if="editErrors.form" class="mt-3 text-[0.8125rem] text-danger" role="alert">
            {{ editErrors.form }}
          </p>

          <div class="mt-4 flex gap-2">
            <button
              type="submit"
              :disabled="editBusy || !edit.name.trim() || !edit.slug.trim()"
              class="rounded-md bg-accent px-3 py-1.5 text-[0.8125rem] font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {{ editBusy ? 'Saving…' : 'Save' }}
            </button>
            <button
              type="button"
              class="rounded-md border border-border px-3 py-1.5 text-[0.8125rem] transition-colors hover:bg-bg-sunken"
              @click="closeEdit"
            >
              Cancel
            </button>
          </div>
        </form>

        <!-- Viewing -->
        <div v-else class="flex items-center gap-3">
          <div v-if="mayEdit" class="flex shrink-0 flex-col">
            <button
              type="button"
              :disabled="i === 0 || reordering"
              :aria-label="`Move ${c.name} up`"
              class="rounded px-1 text-fg-subtle transition-colors hover:bg-bg-sunken hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
              @click="move(i, -1)"
            >
              <AppIcon name="chevron-down" class="rotate-180" />
            </button>
            <button
              type="button"
              :disabled="i === rows.length - 1 || reordering"
              :aria-label="`Move ${c.name} down`"
              class="rounded px-1 text-fg-subtle transition-colors hover:bg-bg-sunken hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
              @click="move(i, 1)"
            >
              <AppIcon name="chevron-down" />
            </button>
          </div>

          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span class="text-[0.8125rem] font-medium">{{ c.name }}</span>
              <span class="font-mono text-xs text-fg-subtle">/category/{{ c.slug }}</span>
            </p>
            <p
              class="mt-0.5 truncate text-[0.8125rem]"
              :class="c.description ? 'text-fg-muted' : 'text-fg-subtle'"
              :title="c.description ?? undefined"
            >
              {{ c.description ?? 'No description — the site uses a generic line.' }}
            </p>
          </div>

          <NuxtLink
            :to="articlesLink(c)"
            class="shrink-0 whitespace-nowrap text-[0.8125rem] text-fg-muted underline-offset-2 hover:text-accent hover:underline"
            :title="`Articles filed under ${c.name}, drafts included`"
          >
            <span class="tnum">{{ c.articleCount }}</span> {{ c.articleCount === 1 ? 'article' : 'articles' }}
          </NuxtLink>

          <div v-if="mayEdit" class="flex shrink-0 gap-1">
            <button
              type="button"
              class="rounded-md px-2 py-1 text-[0.8125rem] text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg"
              @click="openEdit(c)"
            >
              Edit
            </button>
            <button
              type="button"
              class="rounded-md px-2 py-1 text-[0.8125rem] text-fg-muted transition-colors hover:bg-danger-surface hover:text-danger"
              @click="askRetire(c)"
            >
              Retire
            </button>
          </div>
        </div>

        <!-- Retire confirmation, in place, so the count it quotes is visibly
             about THIS row. -->
        <div
          v-if="confirmingId === c.id"
          class="mt-3 rounded-md border border-border bg-danger-surface px-3 py-2.5 text-[0.8125rem]"
          role="alertdialog"
          :aria-label="`Retire ${c.name}?`"
        >
          <p class="font-medium text-danger">
            Retire “{{ c.name }}”?
          </p>
          <p class="mt-1 text-fg-muted">
            <template v-if="c.articleCount">
              {{ c.articleCount }} {{ c.articleCount === 1 ? 'article is' : 'articles are' }}
              filed here, drafts included. They stay filed but stop appearing under
              this section, and
            </template>
            <template v-else>
              Nothing is filed here.
            </template>
            <span class="font-mono text-xs">/category/{{ c.slug }}</span> will stop
            working. Restoring it later brings everything back.
          </p>
          <div class="mt-2.5 flex gap-2">
            <button
              type="button"
              :disabled="retireBusy"
              class="rounded-md bg-danger px-3 py-1.5 font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              @click="confirmRetire(c)"
            >
              {{ retireBusy ? 'Retiring…' : 'Retire' }}
            </button>
            <button
              type="button"
              class="rounded-md border border-border bg-panel px-3 py-1.5 transition-colors hover:bg-bg-sunken"
              @click="confirmingId = null"
            >
              Keep it
            </button>
          </div>
        </div>
      </li>
    </ol>

    <!-- Retired -->
    <section v-if="retired.length" class="mt-10" aria-labelledby="retired-heading">
      <h2 id="retired-heading" class="text-[0.8125rem] font-semibold">
        Retired
      </h2>
      <p class="mt-1 text-[0.8125rem] text-fg-muted">
        Hidden from the site and the article picker. Articles keep their category,
        so restoring one brings the section back as it was.
      </p>

      <ul class="mt-3 divide-y divide-border rounded-lg border border-border">
        <li v-for="c in retired" :key="c.id" class="flex items-center gap-3 px-4 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-2.5">
              <span class="text-[0.8125rem] text-fg-muted">{{ c.name }}</span>
              <span class="font-mono text-xs text-fg-subtle">/category/{{ c.slug }}</span>
            </p>
            <p v-if="c.retiredAt" class="mt-0.5 text-xs text-fg-subtle" :title="absolute(c.retiredAt)">
              Retired {{ relative(c.retiredAt) }}
            </p>
          </div>

          <NuxtLink
            :to="articlesLink(c)"
            class="shrink-0 whitespace-nowrap text-[0.8125rem] text-fg-muted underline-offset-2 hover:text-accent hover:underline"
          >
            <span class="tnum">{{ c.articleCount }}</span> {{ c.articleCount === 1 ? 'article' : 'articles' }}
          </NuxtLink>

          <button
            v-if="mayEdit"
            type="button"
            :disabled="restoringId === c.id"
            class="shrink-0 rounded-md border border-border bg-panel px-2.5 py-1 text-[0.8125rem] transition-colors hover:bg-bg-sunken disabled:opacity-50"
            @click="doRestore(c)"
          >
            {{ restoringId === c.id ? 'Restoring…' : 'Restore' }}
          </button>
        </li>
      </ul>
    </section>

    <p class="mt-8 text-xs text-fg-subtle">
      The public sites cache their navigation for five minutes and section pages
      for ten, so changes can take that long to appear there.
    </p>
  </div>
</template>
