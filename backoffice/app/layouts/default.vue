<script setup lang="ts">
import type { IconName } from '~/components/AppIcon.vue'
import type { AuthorRole } from '~/types/api'

const { data: me } = await useMe()

/**
 * Navigation is filtered by role. COSMETIC ONLY — the API enforces every one of
 * these and a hidden link is not a permission check. Repeated here because this
 * file is exactly where someone would be tempted to believe otherwise.
 *
 * A platform admin has no tenant, so none of these apply to them at all: the
 * API would 403 every one. They get no tabs rather than tabs that fail.
 */
const TENANT_NAV: { to: string, label: string, icon: IconName, minimum: AuthorRole }[] = [
  { to: '/articles', label: 'Articles', icon: 'article', minimum: 'contributor' },
  { to: '/categories', label: 'Categories', icon: 'category', minimum: 'editor' },
  { to: '/media', label: 'Media', icon: 'media', minimum: 'contributor' },
  { to: '/authors', label: 'Authors', icon: 'author', minimum: 'admin' },
]

const RANK: Record<AuthorRole, number> = { contributor: 1, editor: 2, admin: 3 }

const nav = computed(() => {
  if (me.value?.kind !== 'author' || !me.value.role) return []
  const role = me.value.role
  return TENANT_NAV.filter(item => RANK[role] >= RANK[item.minimum])
})

/**
 * Kratos' browser logout is two steps and skipping the first does not work:
 * GET /self-service/logout/browser returns JSON carrying a single-use
 * `logout_url`, and navigating to THAT is what revokes the session.
 *
 * Hence a real fetch then a full navigation — `window.location`, not
 * `navigateTo`, because the target is Kratos rather than a Vue route and the
 * response is a redirect the browser must follow for the session-clearing
 * Set-Cookie to land.
 */
const signingOut = ref(false)
const menuOpen = ref(false)

async function signOut() {
  signingOut.value = true
  try {
    const { logout_url: logoutUrl } = await $fetch<{ logout_url: string }>(
      '/.ory/self-service/logout/browser',
    )
    window.location.href = logoutUrl
  }
  catch {
    // Already signed out — the endpoint 401s. That is the desired end state, so
    // go to the login page rather than reporting a failure to do something that
    // is already done.
    window.location.href = '/auth/login'
  }
}

/** Close the account menu on Escape and on any navigation. */
const route = useRoute()
watch(() => route.fullPath, () => { menuOpen.value = false })
onMounted(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') menuOpen.value = false }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
})
</script>

<template>
  <div class="min-h-dvh">
    <header class="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-sm">
      <!-- Row one: identity and account. -->
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <NuxtLink
          to="/"
          class="text-[0.9375rem] font-semibold tracking-tight"
        >
          Artical
        </NuxtLink>

        <!--
          Which site you are working in, shown as a static label rather than a
          switcher: an author belongs to exactly one tenant and never chooses
          it. A dropdown here would imply a capability that does not exist and
          that the API would refuse.
        -->
        <template v-if="me?.kind === 'author' && me.tenantName">
          <span class="select-none text-border-strong" aria-hidden="true">/</span>
          <span class="truncate text-[0.8125rem] font-medium">{{ me.tenantName }}</span>
          <span class="hidden rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted sm:inline">
            {{ me.role }}
          </span>
        </template>

        <div class="ms-auto flex items-center gap-2">
          <span
            v-if="me?.kind === 'platform-admin'"
            class="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg-muted"
          >
            Platform
          </span>

          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.8125rem] text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg"
              :aria-expanded="menuOpen"
              aria-haspopup="menu"
              @click="menuOpen = !menuOpen"
            >
              <span
                class="grid size-6 place-items-center rounded-full bg-bg-sunken text-[0.6875rem] font-semibold text-fg"
                aria-hidden="true"
              >{{ (me?.name ?? '?').charAt(0).toUpperCase() }}</span>
              <span class="hidden sm:inline">{{ me?.username ?? me?.name }}</span>
              <AppIcon name="chevron-down" :size="14" />
            </button>

            <!-- Click-away catcher. A transparent full-screen button rather than
                 a document listener: it is keyboard-reachable and disappears
                 with the menu, so there is no listener to leak. -->
            <button
              v-if="menuOpen"
              type="button"
              class="fixed inset-0 z-10 cursor-default"
              aria-label="Close menu"
              @click="menuOpen = false"
            />

            <div
              v-if="menuOpen"
              role="menu"
              class="absolute end-0 z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-border bg-panel shadow-md"
            >
              <div class="border-b border-border px-3 py-2.5">
                <p class="truncate text-[0.8125rem] font-medium">
                  {{ me?.name }}
                </p>
                <p class="truncate font-mono text-xs text-fg-muted">
                  {{ me?.username }}
                </p>
              </div>
              <NuxtLink
                to="/auth/settings"
                role="menuitem"
                class="block px-3 py-2 text-[0.8125rem] text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg"
              >
                Account settings
              </NuxtLink>
              <button
                type="button"
                role="menuitem"
                :disabled="signingOut"
                class="w-full px-3 py-2 text-start text-[0.8125rem] text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg disabled:opacity-50"
                @click="signOut"
              >
                {{ signingOut ? 'Signing out…' : 'Sign out' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!--
        Row two: section tabs. Separate row rather than inline with the
        wordmark so the active tab can sit on the header's bottom edge — the
        underline reads as "you are inside this section" rather than as
        decoration on a link.
      -->
      <nav v-if="nav.length" class="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Sections">
        <ul class="-mb-px flex gap-1 overflow-x-auto">
          <li v-for="item in nav" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="group flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2.5 pb-2.5 pt-1 text-[0.8125rem] text-fg-muted transition-colors hover:text-fg"
              active-class="!border-accent !text-fg font-medium"
            >
              <AppIcon :name="item.icon" :size="14" class="opacity-70 group-hover:opacity-100" />
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
      <div v-else class="pb-2" />
    </header>

    <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <slot />
    </main>
  </div>
</template>
