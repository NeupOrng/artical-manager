<script setup lang="ts">
import type { Author, AuthorRole, InviteAuthorInput, InviteLink } from '~/types/api'

/**
 * Who has access to a site.
 *
 * TWO PRINCIPALS, ONE PAGE — branching on `kind`, never assuming a tenant:
 *
 *  - a site **admin** manages their own site: invite, re-issue an unaccepted
 *    link, change name / email / role, withdraw and restore access.
 *  - a **platform admin** has no site of their own, so they pick one and may
 *    only *onboard* into it. Editing and deactivating stay with the site's own
 *    admins (decision A3), which is why those controls are absent rather than
 *    disabled — a disabled button implies a permission you could acquire.
 *
 * Tenancy being chosen in the UI is normally forbidden (backoffice/CLAUDE.md).
 * The rule is about authors, who have exactly one site resolved from their
 * identity. An operator has none, and naming one is the entire job — it comes
 * from a list the API gave them, never typed.
 *
 * Every rule is the API's. This page maps error codes to the field they belong
 * to and renders what comes back.
 */
const { data: me } = await useMe()
const { parse } = useApiError()
const { relative, absolute } = useRelativeTime()

const isPlatform = computed(() => me.value?.kind === 'platform-admin')

/** Cosmetic. The API refuses regardless of what this shows. */
const can = (permission: string) =>
  computed(() => me.value?.permissions?.includes(permission as never) ?? false)
const mayInvite = can('authors.invite')
const mayUpdate = can('authors.update')
const mayDeactivate = can('authors.deactivate')

// Both composables are created, and only the relevant one is read. They are
// separate on purpose (see useAuthors.ts) and collapsing them into a
// conditional would reintroduce exactly the "maybe there's a tenantId" shape
// the API's split controller exists to avoid.
const site = useAuthorAdmin()
const platform = usePlatformAuthors()

const authors = computed<Author[]>(() =>
  isPlatform.value ? platform.authors.value : site.authors.value)

const loadState = computed(() =>
  isPlatform.value ? platform.authorStatus.value : site.status.value)

const loadError = computed(() =>
  isPlatform.value ? platform.authorError.value : site.error.value)

/** The operator must pick a site before there is anything to show. */
const awaitingSite = computed(() => isPlatform.value && !platform.selectedId.value)

const selectedSite = computed(() =>
  platform.tenants.value.find(t => t.id === platform.selectedId.value) ?? null)

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

// ── Invite ──────────────────────────────────────────────────────────────────

const ROLES: { value: AuthorRole, label: string, hint: string }[] = [
  { value: 'contributor', label: 'Contributor', hint: 'Writes drafts; cannot publish.' },
  { value: 'editor', label: 'Editor', hint: 'Publishes, and owns the sections.' },
  { value: 'admin', label: 'Admin', hint: 'All of the above, plus managing people.' },
]

const inviting = ref(false)
const submitting = ref(false)
const form = reactive<InviteAuthorInput>({
  username: '', name: '', email: '', role: 'contributor',
})
interface FieldErrors { username?: string, email?: string, form?: string }
const fieldErrors = reactive<FieldErrors>({})

/** Shown ONCE. The API cannot reproduce it and nothing here stores it. */
const issued = ref<{ link: InviteLink, who: string } | null>(null)
const copied = ref(false)

function resetForm() {
  form.username = ''
  form.name = ''
  form.email = ''
  form.role = 'contributor'
  fieldErrors.username = fieldErrors.email = fieldErrors.form = undefined
}

async function submitInvite() {
  submitting.value = true
  fieldErrors.username = fieldErrors.email = fieldErrors.form = undefined

  try {
    const created = isPlatform.value
      ? await platform.invite({ ...form })
      : await site.invite({ ...form })

    issued.value = { link: created.invite, who: created.author.name }
    copied.value = false
    inviting.value = false
    resetForm()
    say('ok', `${created.author.name} was added. Send them the link below.`)
  }
  catch (error) {
    const { code, message } = parse(error)
    // Codes land on the field they are about; the message is displayed, never
    // parsed.
    if (code === 'USERNAME_TAKEN' || code === 'AUTHOR_USERNAME_INVALID') {
      fieldErrors.username = message
    }
    else if (code === 'EMAIL_IN_USE') fieldErrors.email = message
    else fieldErrors.form = message
  }
  finally {
    submitting.value = false
  }
}

async function copyLink() {
  if (!issued.value) return
  try {
    await navigator.clipboard.writeText(issued.value.link.link)
    copied.value = true
    setTimeout(() => (copied.value = false), 3000)
  }
  catch {
    // Clipboard access can be refused; the link is on screen and selectable,
    // so this is a missing convenience rather than a failure.
    say('error', 'Could not copy automatically — select the link and copy it.')
  }
}

// ── Row actions (site admins only) ──────────────────────────────────────────

const busyId = ref<string | null>(null)

async function run(id: string, action: () => Promise<unknown>, ok: string) {
  busyId.value = id
  try {
    await action()
    say('ok', ok)
  }
  catch (error) {
    say('error', parse(error).message)
  }
  finally {
    busyId.value = null
  }
}

function changeRole(author: Author, role: AuthorRole) {
  if (role === author.role) return
  return run(author.id, () => site.update(author.id, { role }),
    `${author.name} is now ${role}.`)
}

function withdraw(author: Author) {
  return run(author.id, () => site.deactivate(author.id),
    `${author.name} no longer has access.`)
}

function restore(author: Author) {
  return run(author.id, () => site.reactivate(author.id),
    `${author.name} can sign in again.`)
}

async function reissue(author: Author) {
  busyId.value = author.id
  try {
    issued.value = { link: await site.reissue(author.id), who: author.name }
    copied.value = false
    say('ok', `A fresh link for ${author.name}.`)
  }
  catch (error) {
    say('error', parse(error).message)
  }
  finally {
    busyId.value = null
  }
}

useHead({ title: 'Authors' })
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <header class="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Authors
        </h1>
        <p class="mt-1 text-sm text-muted">
          <template v-if="isPlatform">
            Onboard someone into any site. Once a site has an admin, they manage
            their own people.
          </template>
          <template v-else>
            Everyone with access to {{ me?.tenantName ?? 'this site' }}. Invites
            create a login with no password — you send them a link to set one.
          </template>
        </p>
      </div>

      <button
        v-if="mayInvite || isPlatform"
        type="button"
        class="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        :disabled="awaitingSite"
        @click="inviting = !inviting"
      >
        {{ inviting ? 'Cancel' : 'Invite an author' }}
      </button>
    </header>

    <!-- Site picker. Operators only: an author has exactly one site and never
         chooses it. -->
    <section v-if="isPlatform" class="mt-6">
      <label for="site" class="block text-sm font-medium">Site</label>
      <select
        id="site"
        v-model="platform.selectedId.value"
        class="mt-1.5 w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm"
      >
        <option :value="null">
          Choose a site…
        </option>
        <option v-for="t in platform.tenants.value" :key="t.id" :value="t.id">
          {{ t.name }} — {{ t.domain }} ({{ t.authorCount }})
        </option>
      </select>
    </section>

    <p
      v-if="flash"
      class="mt-6 rounded-md border px-3 py-2 text-sm"
      :class="flash.kind === 'ok'
        ? 'border-border bg-live-surface text-live'
        : 'border-border bg-surface text-danger'"
      role="status"
    >
      {{ flash.text }}
    </p>

    <!-- The link appears once. There is no way to retrieve it again, so it is
         given its own panel rather than a toast that can be dismissed early. -->
    <section
      v-if="issued"
      class="mt-6 rounded-md border border-accent bg-surface p-4"
    >
      <h2 class="text-sm font-semibold">
        Sign-up link for {{ issued.who }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        Send this to them. It works once, expires
        {{ relative(issued.link.expiresAt) }}, and
        <strong>cannot be shown again</strong> — re-issue a new one if it is lost.
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <code class="min-w-0 flex-1 overflow-x-auto rounded border border-border bg-bg px-2 py-1.5 text-xs">
          {{ issued.link.link }}
        </code>
        <button
          type="button"
          class="rounded-md border border-border px-3 py-1.5 text-sm font-medium"
          @click="copyLink"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1.5 text-sm text-muted"
          @click="issued = null"
        >
          Dismiss
        </button>
      </div>
    </section>

    <!-- Invite form -->
    <section v-if="inviting" class="mt-6 rounded-md border border-border p-4">
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="submitInvite">
        <div class="sm:col-span-2">
          <p v-if="fieldErrors.form" class="mb-2 text-sm text-danger">
            {{ fieldErrors.form }}
          </p>
          <p v-if="isPlatform && selectedSite" class="mb-2 text-sm text-muted">
            Adding to <strong>{{ selectedSite.name }}</strong>.
          </p>
        </div>

        <div>
          <label for="name" class="block text-sm font-medium">Name</label>
          <input
            id="name" v-model="form.name" required maxlength="120"
            class="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
        </div>

        <div>
          <label for="username" class="block text-sm font-medium">Username</label>
          <input
            id="username" v-model="form.username" required minlength="3" maxlength="64"
            class="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            :aria-invalid="!!fieldErrors.username"
          >
          <p class="mt-1 text-xs" :class="fieldErrors.username ? 'text-danger' : 'text-muted'">
            {{ fieldErrors.username
              ?? 'Their sign-in name and public page address. Cannot be changed later.' }}
          </p>
        </div>

        <div>
          <label for="email" class="block text-sm font-medium">Email</label>
          <input
            id="email" v-model="form.email" type="email" required maxlength="254"
            class="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            :aria-invalid="!!fieldErrors.email"
          >
          <p class="mt-1 text-xs" :class="fieldErrors.email ? 'text-danger' : 'text-muted'">
            {{ fieldErrors.email ?? 'Contact address. Not used to sign in.' }}
          </p>
        </div>

        <div>
          <label for="role" class="block text-sm font-medium">Role</label>
          <select
            id="role" v-model="form.role"
            class="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option v-for="r in ROLES" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
          <p class="mt-1 text-xs text-muted">
            {{ ROLES.find(r => r.value === form.role)?.hint }}
          </p>
        </div>

        <div class="sm:col-span-2">
          <button
            type="submit"
            class="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
            :disabled="submitting"
          >
            {{ submitting ? 'Adding…' : 'Add and get link' }}
          </button>
        </div>
      </form>
    </section>

    <!-- List -->
    <section class="mt-8">
      <p v-if="awaitingSite" class="py-16 text-center text-sm text-muted">
        Choose a site to see who has access to it.
      </p>

      <p v-else-if="loadError" class="py-16 text-center text-sm text-danger">
        Could not load this list. {{ parse(loadError).message }}
      </p>

      <p v-else-if="loadState === 'pending'" class="py-16 text-center text-sm text-muted">
        Loading…
      </p>

      <p v-else-if="!authors.length" class="py-16 text-center text-sm text-muted">
        Nobody has access yet.
      </p>

      <ul v-else class="divide-y divide-border">
        <li
          v-for="author in authors"
          :key="author.id"
          class="flex flex-wrap items-start justify-between gap-4 py-4"
          :class="{ 'opacity-60': author.status === 'deactivated' }"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ author.name }}</span>
              <AuthorStatusPill :status="author.status" />
            </div>
            <p class="mt-0.5 text-sm text-muted">
              <span v-if="author.username">@{{ author.username }} · </span>{{ author.email }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ author.publishedCount }} published · {{ author.draftCount }} draft<!--
              --><template v-if="author.lastSeenAt">
                · last seen
                <time :datetime="author.lastSeenAt" :title="absolute(author.lastSeenAt)">
                  {{ relative(author.lastSeenAt) }}
                </time>
              </template>
              <template v-else-if="author.status === 'invited'">
                · has not signed in yet
              </template>
            </p>
          </div>

          <!--
            Operators get no row actions at all. Editing and withdrawing access
            belong to the site's own admins (A3); rendering them disabled would
            imply a permission the operator could be granted.
          -->
          <div v-if="!isPlatform" class="flex flex-wrap items-center gap-2">
            <select
              v-if="mayUpdate && author.status !== 'deactivated'"
              :value="author.role"
              :disabled="busyId === author.id"
              class="rounded-md border border-border bg-surface px-2 py-1 text-sm"
              :aria-label="`Role for ${author.name}`"
              @change="changeRole(author, ($event.target as HTMLSelectElement).value as AuthorRole)"
            >
              <option v-for="r in ROLES" :key="r.value" :value="r.value">
                {{ r.label }}
              </option>
            </select>

            <button
              v-if="mayInvite && author.status === 'invited'"
              type="button"
              class="rounded-md border border-border px-2.5 py-1 text-sm"
              :disabled="busyId === author.id"
              @click="reissue(author)"
            >
              New link
            </button>

            <button
              v-if="mayDeactivate && author.status !== 'deactivated'"
              type="button"
              class="rounded-md border border-border px-2.5 py-1 text-sm text-danger"
              :disabled="busyId === author.id"
              @click="withdraw(author)"
            >
              Withdraw access
            </button>

            <button
              v-if="mayDeactivate && author.status === 'deactivated'"
              type="button"
              class="rounded-md border border-border px-2.5 py-1 text-sm"
              :disabled="busyId === author.id"
              @click="restore(author)"
            >
              Restore
            </button>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
