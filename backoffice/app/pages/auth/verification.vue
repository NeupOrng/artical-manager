<script setup lang="ts">
/**
 * Email verification. Confirms the contact address is reachable.
 *
 * Deliberately NOT a gate on signing in: `email` is contact information, not a
 * credential, so an unverified address means "we may not be able to reach you",
 * not "you may not work". Treating it as a login gate would quietly make email
 * an identity, which root CLAUDE.md §5 rules out.
 */
definePageMeta({ layout: 'auth' })

const { flow } = useKratosFlow('verification')
const isDev = import.meta.dev

useHead({ title: 'Verify your email · Artical' })
</script>

<template>
  <div>
    <h1 class="text-base font-semibold">
      Verify your email
    </h1>
    <p class="mt-1 text-[0.8125rem] text-fg-muted">
      Confirms we can reach you at this address. It does not change how you sign
      in.
    </p>

    <p v-if="!flow" class="mt-6 text-[0.8125rem] text-fg-muted">
      Starting…
    </p>

    <KratosForm v-else :flow="flow" class="mt-6" submit-label="Send the link" />

    <p v-if="isDev" class="mt-4 rounded-md border border-border bg-bg-sunken px-3 py-2 text-xs text-fg-muted">
      Development: mail is captured at
      <a
        href="http://localhost:4436"
        target="_blank"
        rel="noopener"
        class="font-mono underline underline-offset-2 hover:text-accent"
      >localhost:4436</a>
      rather than delivered.
    </p>

    <p class="mt-5 border-t border-border pt-4 text-[0.8125rem]">
      <NuxtLink
        to="/"
        class="text-fg-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
      >
        Back to the dashboard
      </NuxtLink>
    </p>
  </div>
</template>
