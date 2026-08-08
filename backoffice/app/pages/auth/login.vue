<script setup lang="ts">
/**
 * Sign in.
 *
 * The form itself is `KratosForm`, shared with recovery, verification and
 * settings — all four flows are the same `ui.nodes` contract, and one renderer
 * means the csrf handling cannot drift between them.
 *
 * THE CREDENTIAL NEVER TOUCHES THIS APP. The browser posts the form to Kratos
 * directly; nothing here reads a password field.
 */
definePageMeta({ layout: 'auth' })

const { flow } = useKratosFlow('login')

useHead({ title: 'Sign in · Artical' })
</script>

<template>
  <div>
    <h1 class="text-base font-semibold">
      Sign in
    </h1>
    <p class="mt-1 text-[0.8125rem] text-fg-muted">
      Use your username, not your email address.
    </p>

    <p v-if="!flow" class="mt-6 text-[0.8125rem] text-fg-muted">
      Starting sign-in…
    </p>

    <KratosForm v-else :flow="flow" class="mt-6" />

    <p class="mt-5 border-t border-border pt-4 text-[0.8125rem]">
      <NuxtLink
        to="/auth/recovery"
        class="text-fg-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
      >
        Forgot your password?
      </NuxtLink>
    </p>

    <!--
      No "create an account" link, deliberately. Self-service registration is
      disabled in Kratos: authors are provisioned by an admin and assigned to a
      tenant, and an identity without that assignment gets a 403 from the API.
    -->
  </div>
</template>
