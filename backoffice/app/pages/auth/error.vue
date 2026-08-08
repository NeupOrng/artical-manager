<script setup lang="ts">
/**
 * The states that are NOT "please log in".
 *
 * Worth its own page because the alternative — bouncing everything to the login
 * form — produces an infinite loop for the case that matters most: a valid
 * Kratos session belonging to an identity nobody provisioned. Logging in again
 * succeeds, returns here, and fails again, with nothing on screen explaining
 * why.
 *
 * Each message names the problem AND the recovery, because "something went
 * wrong" leaves the reader with no next move.
 */
definePageMeta({ layout: 'auth' })

const route = useRoute()

const REASONS = {
  'not-provisioned': {
    title: 'Account not set up',
    body:
      'You signed in successfully, but this account has not been assigned to a '
      + 'site yet. An administrator needs to finish setting it up.',
    action: 'Ask an administrator to assign your account, then sign in again.',
  },
  'unavailable': {
    title: 'Service unavailable',
    body:
      'The backend is not responding. Your published sites are unaffected — '
      + 'they serve from cache — but editing is unavailable.',
    action: 'Try again in a few minutes.',
  },
} as const

const reason = computed(() => {
  const key = route.query.reason as keyof typeof REASONS
  return REASONS[key] ?? {
    title: 'Something went wrong',
    body: 'That did not work, and we do not have more detail to offer.',
    action: 'Try signing in again.',
  }
})

useHead({ title: () => `${reason.value.title} · Artical` })
</script>

<template>
  <div>
    <div class="flex items-start gap-2.5">
      <AppIcon name="warning" class="mt-0.5 shrink-0 text-draft" />
      <h1 class="text-base font-semibold">
        {{ reason.title }}
      </h1>
    </div>

    <p class="mt-2 text-[0.8125rem] text-fg-muted">
      {{ reason.body }}
    </p>
    <p class="mt-2 text-[0.8125rem] text-fg-muted">
      {{ reason.action }}
    </p>

    <NuxtLink
      to="/auth/login"
      class="mt-6 block w-full rounded-md border border-border bg-bg px-3 py-2 text-center text-[0.8125rem] font-medium transition-colors hover:border-border-strong hover:bg-bg-sunken"
    >
      Back to sign in
    </NuxtLink>
  </div>
</template>
