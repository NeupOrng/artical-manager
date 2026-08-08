<script setup lang="ts">
/**
 * Password recovery. Kratos sends a link to the author's contact email.
 *
 * Note what this proves about the identity model: recovery goes to `email`, but
 * email is NOT the login identity — the username is. Email is a delivery
 * channel here and nothing more. See infrastructure/ory/kratos/README.md.
 *
 * Locally the mail lands in MailSlurper (http://localhost:4436), not a real
 * inbox, which is worth saying on the page — otherwise the flow looks broken to
 * anyone testing it.
 */
definePageMeta({ layout: 'auth' })

const { flow } = useKratosFlow('recovery')
const isDev = import.meta.dev

useHead({ title: 'Reset your password · Artical' })
</script>

<template>
  <div>
    <h1 class="text-base font-semibold">
      Reset your password
    </h1>
    <p class="mt-1 text-[0.8125rem] text-fg-muted">
      We'll email you a link. Enter the address on your account, not your
      username.
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
        to="/auth/login"
        class="text-fg-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </p>
  </div>
</template>
