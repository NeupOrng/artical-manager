<script setup lang="ts">
/**
 * Account settings — the author's own profile traits and password.
 *
 * Uses the signed-in layout, not the auth one: this is a page you reach while
 * working, not a door you pass through.
 *
 * Split into two forms by Kratos GROUP (`profile`, `password`) rather than one
 * combined form, because Kratos treats them as separate methods with separate
 * submissions and separate validation. Merging them means one form posting a
 * `method` the other half's fields do not belong to.
 *
 * Kratos requires a recently-authenticated session here
 * (`privileged_session_max_age: 15m`). Past that it redirects to login and
 * returns — expected, not an error to handle.
 */
const { flow } = useKratosFlow('settings')

/** Only render a section when Kratos actually offered that method. */
const hasGroup = (group: string) =>
  computed(() => flow.value?.ui.nodes.some(n => n.group === group) ?? false)

const hasProfile = hasGroup('profile')
const hasPassword = hasGroup('password')

useHead({ title: 'Account · Artical' })
</script>

<template>
  <div class="max-w-xl">
    <h1 class="text-xl font-semibold">
      Account
    </h1>
    <p class="mt-1 text-[0.8125rem] text-fg-muted">
      Your sign-in details. Editorial profile — your byline quote and contact
      visibility — lives with your author record.
    </p>

    <p v-if="!flow" class="mt-8 text-[0.8125rem] text-fg-muted">
      Loading…
    </p>

    <template v-else>
      <section v-if="hasProfile" class="mt-8 rounded-lg border border-border bg-panel p-5">
        <h2 class="text-[0.9375rem] font-semibold">
          Profile
        </h2>
        <p class="mt-1 mb-4 text-[0.8125rem] text-fg-muted">
          Your username is your sign-in identity and appears in your public
          author URL. Email is contact information — it is not how you sign in.
        </p>
        <KratosForm :flow="flow" :groups="['profile']" submit-label="Save profile" />
      </section>

      <section v-if="hasPassword" class="mt-6 rounded-lg border border-border bg-panel p-5">
        <h2 class="text-[0.9375rem] font-semibold">
          Password
        </h2>
        <p class="mt-1 mb-4 text-[0.8125rem] text-fg-muted">
          At least 12 characters. Kratos also checks it against known breached
          passwords and will reject a match.
        </p>
        <KratosForm :flow="flow" :groups="['password']" submit-label="Change password" />
      </section>
    </template>
  </div>
</template>
