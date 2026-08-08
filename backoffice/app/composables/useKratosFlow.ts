/**
 * Kratos self-service flows, shared across login / recovery / verification /
 * settings.
 *
 * All four are the same shape — create a flow, read `ui.nodes`, render the
 * fields, submit natively to `ui.action` — so the fetching and restart logic
 * lives once. What differs is only the flow name and the page around it.
 *
 * THE CREDENTIAL NEVER TOUCHES THIS APP. Nothing here reads a password field or
 * assembles a body; the browser posts the form to Kratos directly.
 */

export interface UiNode {
  type: string
  group: string
  attributes: {
    name?: string
    type?: string
    value?: unknown
    required?: boolean
    disabled?: boolean
    autocomplete?: string
    node_type: string
  }
  meta?: { label?: { text?: string } }
  messages?: UiMessage[]
}

export interface UiMessage {
  id: number
  text: string
  /** Kratos uses `error`, `info`, and `success`. */
  type: string
}

export interface KratosFlow {
  id: string
  ui: {
    action: string
    method: string
    nodes: UiNode[]
    messages?: UiMessage[]
  }
}

export type FlowName = 'login' | 'recovery' | 'verification' | 'settings'

export function useKratosFlow(name: FlowName) {
  const route = useRoute()
  const requestFetch = useRequestFetch()

  const flowId = computed(() => route.query.flow as string | undefined)

  const { data: flow, error } = useAsyncData<KratosFlow | null>(
    () => `${name}-flow-${flowId.value ?? 'none'}`,
    async () => {
      if (!flowId.value) return null
      // useRequestFetch, not $fetch: during SSR the browser's cookies are not
      // carried into internal calls, and Kratos ties a flow to the anonymous
      // cookie it set when the flow was created. Without this it 403s on a hard
      // refresh only — invisible until someone reloads.
      return requestFetch<KratosFlow>(`/.ory/self-service/${name}/flows`, {
        params: { id: flowId.value },
      })
    },
    { watch: [flowId] },
  )

  /** Full-page redirect, so Kratos can set its own cookie on this origin. */
  const start = () => {
    window.location.href = `/.ory/self-service/${name}/browser`
  }

  onMounted(() => {
    if (!flowId.value) start()
  })

  // An expired or already-used flow comes back 410/404. Restarting is the only
  // useful response — "flow not found" explains nothing to someone who left the
  // tab open, and offers no way forward.
  watchEffect(() => {
    if (import.meta.client && error.value && flowId.value) start()
  })

  /**
   * Rendered verbatim, hidden nodes included — `csrf_token` is one of them.
   * Filtering this list to "the fields I recognise" drops the token and every
   * submit starts failing with a 400 that looks like a server problem.
   */
  const nodes = computed(() => flow.value?.ui.nodes ?? [])

  const messages = computed(() => flow.value?.ui.messages ?? [])

  return { flow, error, nodes, messages, flowId, start }
}

/**
 * Kratos omits a label on some fields. Ours is a username rather than an email —
 * see infrastructure/ory/kratos/README.md for why that is the login identity.
 */
export function nodeLabel(node: UiNode): string {
  const text = node.meta?.label?.text
  if (text) return text
  if (node.attributes.name === 'identifier') return 'Username'
  if (node.attributes.name === 'email') return 'Email address'
  return node.attributes.name ?? ''
}
