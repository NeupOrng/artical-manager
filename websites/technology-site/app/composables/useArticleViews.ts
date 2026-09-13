import type { Ref } from 'vue'
import type { ViewTotals } from '~~/types/api'

/**
 * View counts, loaded after paint and never during SSR.
 *
 * WHY CLIENT-SIDE. Article pages are `isr: true` — cached until the article is
 * republished. A server-rendered count would be frozen at cache time and could
 * sit at the same number for weeks. Category and home pages are `isr: 600`, so
 * they would be stale too, just less obviously. `websites/CLAUDE.md` is also
 * explicit that ISR paths must not gain render-blocking API calls, and the
 * frontend-design skill says live data loads after paint or does not ship.
 *
 * WHY BATCHED. A grid of twelve cards would otherwise issue twelve requests.
 * Cards register their id and a microtask collects everything requested in the
 * same tick into one call, so any page costs exactly one request regardless of
 * how many cards it renders.
 */

/** Nuxt payload state, so the map survives client-side navigation. */
function useCounts() {
  return useState<ViewTotals>('article-view-counts', () => ({}))
}

// Module scope is shared across SSR requests in Nuxt, which is normally a
// cross-request leak. It is safe here ONLY because every write happens behind
// an `import.meta.client` guard — this batch never runs on the server.
let pending = new Set<string>()
let scheduled = false

/**
 * Loads totals for any ids requested this tick.
 *
 * Failures are swallowed on purpose. A view counter is decoration on a reading
 * page: if the backend is unreachable the article must still render, and an
 * error banner over a missing number would be worse than no number.
 */
async function flush(counts: Ref<ViewTotals>) {
  const ids = [...pending]
  pending = new Set()
  scheduled = false

  if (!ids.length) return

  try {
    // The API caps this at 100 ids per request.
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      const totals = await $fetch<ViewTotals>('/api/views', {
        query: { articleIds: chunk.join(',') },
      })
      // Absent means zero — the API does not write rows on a read.
      counts.value = {
        ...counts.value,
        ...Object.fromEntries(chunk.map(id => [id, totals[id] ?? 0])),
      }
    }
  }
  catch {
    // Leave the ids unresolved; the component keeps its placeholder.
  }
}

export function useArticleViews() {
  const counts = useCounts()

  /** Registers an article id for the next batch. Idempotent. */
  function track(articleId: string) {
    if (!import.meta.client) return
    if (articleId in counts.value || pending.has(articleId)) return

    pending.add(articleId)
    if (scheduled) return

    scheduled = true
    // A microtask, not a timer: every card in one render registers within the
    // same tick, so they coalesce without adding latency.
    queueMicrotask(() => void flush(counts))
  }

  function countFor(articleId: string): number | null {
    return counts.value[articleId] ?? null
  }

  return { counts, track, countFor }
}

/**
 * Records a view for an article, at most once per browser session.
 *
 * Session-scoped rather than server-side deduplicated: no cookie, and nothing
 * about the reader is stored by us. It stops ordinary refreshing from inflating
 * the number. It does NOT stop someone determined — see the note on the
 * controller. The counter is an indicative signal, not an audited figure.
 *
 * The reader context sent alongside (external referrer, language, screen size)
 * feeds the backoffice's readership analytics. This site's server adds the IP
 * and user agent for geo and device detection; the analytics store keeps
 * neither raw. See docs/proposals/dashboard-analytics-umami.md.
 */
export function useRecordArticleView() {
  const counts = useCounts()

  return async function record(articleId: string) {
    if (!import.meta.client) return

    const key = `viewed:${articleId}`
    let alreadyCounted = false
    try {
      alreadyCounted = window.sessionStorage.getItem(key) === '1'
    }
    catch {
      // Private browsing and blocked storage both throw. Counting the view is
      // the right failure here: better a slight over-count than silently
      // dropping every reader whose browser locks storage down.
    }

    if (alreadyCounted) return

    try {
      const { total } = await $fetch<{ total: number }>('/api/views', {
        method: 'POST',
        body: { articleId, ...readerContext() },
      })
      // Show the number this reader just caused, rather than the value the
      // batch read a moment earlier.
      counts.value = { ...counts.value, [articleId]: total }
      window.sessionStorage.setItem(key, '1')
    }
    catch {
      // Never surface this. Failing to count a view must not affect reading.
    }
  }
}

/**
 * What the browser knows about how the reader arrived. Same-site navigation is
 * not a traffic source, so its referrer is dropped — Umami's own tracker does
 * the same, which keeps "direct" meaning what it means anywhere else.
 */
function readerContext(): { referrer?: string, language?: string, screen?: string } {
  const context: { referrer?: string, language?: string, screen?: string } = {}
  try {
    const ref = document.referrer ? new URL(document.referrer) : null
    if (ref && ref.origin !== window.location.origin) context.referrer = ref.href.slice(0, 2048)
  }
  catch {
    // A malformed referrer is no referrer.
  }
  if (navigator.language) context.language = navigator.language.slice(0, 35)
  if (window.screen?.width) context.screen = `${window.screen.width}x${window.screen.height}`
  return context
}
