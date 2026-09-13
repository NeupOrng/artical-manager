/**
 * Records a view for an article, at most once per browser session.
 *
 * Ported from technology-site's useArticleViews.ts — every site records views
 * the same way (decision D4 in docs/proposals/dashboard-analytics-umami.md).
 * Only the RECORDING half is here: this site does not show view counts to
 * readers, so the batched count loader was not ported. Add it from
 * technology-site if that changes, rather than writing a second version.
 *
 * Session-scoped rather than server-side deduplicated: no cookie, and nothing
 * about the reader is stored by us. It stops ordinary refreshing from inflating
 * the number; it does not stop someone determined. The reader context sent
 * alongside feeds the backoffice's readership analytics.
 */
export function useRecordArticleView() {
  return async function record(articleId: string) {
    if (!import.meta.client) return

    const key = `viewed:${articleId}`
    let alreadyCounted = false
    try {
      alreadyCounted = window.sessionStorage.getItem(key) === '1'
    }
    catch {
      // Private browsing and blocked storage both throw. Counting the view is
      // the right failure: better a slight over-count than silently dropping
      // every reader whose browser locks storage down.
    }

    if (alreadyCounted) return

    try {
      await $fetch('/api/views', {
        method: 'POST',
        body: { articleId, ...readerContext() },
      })
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
