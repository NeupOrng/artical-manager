<script setup lang="ts">
import type { KratosFlow, UiNode } from '~/composables/useKratosFlow'
import { nodeLabel } from '~/composables/useKratosFlow'

/**
 * Renders a Kratos self-service form from its own `ui.nodes`.
 *
 * THE CREDENTIAL NEVER TOUCHES THIS APP. This emits a real <form> whose action
 * is the URL Kratos supplied, submitted natively by the browser. No fetch of a
 * password, no body assembled here, no token handling.
 *
 * That also handles CSRF for free: Kratos puts a `csrf_token` hidden node in the
 * list, and rendering the list faithfully submits it. **Never filter these nodes
 * down to the ones this component recognises** — the token disappears and every
 * submit 400s in a way that looks like a server fault.
 *
 * `groups` narrows which method's fields to draw, for flows that offer several
 * (settings offers `profile` and `password`). It filters by GROUP, which Kratos
 * defines, and always keeps `default` — that is the group the CSRF token is in.
 */
const props = withDefaults(
  defineProps<{
    flow: KratosFlow
    /** Kratos node groups to render. Omit for all of them. */
    groups?: string[]
    submitLabel?: string
  }>(),
  { groups: undefined, submitLabel: undefined },
)

const visibleNodes = computed<UiNode[]>(() => {
  const all = props.flow.ui.nodes
  if (!props.groups) return all
  // `default` carries csrf_token and is never optional.
  const keep = new Set(['default', ...props.groups])
  return all.filter(n => keep.has(n.group))
})

const messageClass = (type: string) =>
  type === 'error'
    ? 'border-border bg-danger-surface text-danger'
    : 'border-border bg-bg-sunken text-fg-muted'
</script>

<template>
  <form :action="flow.ui.action" :method="flow.ui.method" class="space-y-4">
    <!-- Flow-level messages: "invalid credentials", "a recovery link was sent". -->
    <p
      v-for="message in flow.ui.messages ?? []"
      :key="message.id"
      class="flex items-start gap-2 rounded-md border px-3 py-2 text-[0.8125rem]"
      :class="messageClass(message.type)"
      :role="message.type === 'error' ? 'alert' : 'status'"
    >
      <AppIcon
        v-if="message.type === 'error'"
        name="warning"
        :size="14"
        class="mt-0.5 shrink-0"
      />
      {{ message.text }}
    </p>

    <template v-for="(node, index) in visibleNodes" :key="index">
      <!-- Hidden inputs, csrf_token among them. Verbatim, never filtered. -->
      <input
        v-if="node.attributes.type === 'hidden'"
        type="hidden"
        :name="node.attributes.name"
        :value="node.attributes.value"
      >

      <button
        v-else-if="node.attributes.type === 'submit'"
        type="submit"
        :name="node.attributes.name"
        :value="node.attributes.value as string"
        class="w-full rounded-md bg-accent px-3 py-2 text-[0.8125rem] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        {{ submitLabel ?? node.meta?.label?.text ?? 'Continue' }}
      </button>

      <div v-else-if="node.attributes.node_type === 'input'">
        <label
          :for="`field-${node.attributes.name}`"
          class="block text-[0.8125rem] font-medium"
        >
          {{ nodeLabel(node) }}
        </label>
        <input
          :id="`field-${node.attributes.name}`"
          :name="node.attributes.name"
          :type="node.attributes.type"
          :required="node.attributes.required"
          :disabled="node.attributes.disabled"
          :autocomplete="node.attributes.autocomplete"
          :value="node.attributes.value"
          class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 text-[0.8125rem] transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent disabled:opacity-50"
        >
        <!-- Field-level messages name the problem, e.g. which rule a password
             failed. Kratos writes these; do not paraphrase them. -->
        <p
          v-for="message in node.messages ?? []"
          :key="message.id"
          class="mt-1.5 text-xs"
          :class="message.type === 'error' ? 'text-danger' : 'text-fg-muted'"
          role="alert"
        >
          {{ message.text }}
        </p>
      </div>
    </template>
  </form>
</template>
