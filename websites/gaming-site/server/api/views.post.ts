/**
 * Records that a published article was read.
 *
 * Ported from technology-site: every site records views the same way (decision
 * D4 in docs/proposals/dashboard-analytics-umami.md). A Nitro route rather than
 * the browser calling the gateway, because the tenant key must never reach
 * client code — see server/utils/publicApi.ts.
 *
 * It also passes the reader's IP and user agent to the API as X-Reader-*
 * headers, for readership analytics (geo, device, bot filtering). This server
 * is the only party that sees the real values; neither is stored by us.
 */
export default defineEventHandler(async (event): Promise<{ total: number }> => {
  const body = await readBody<Record<string, unknown>>(event)
  const articleId = body?.articleId

  if (typeof articleId !== 'string' || !articleId) {
    throw createError({ statusCode: 400, statusMessage: 'articleId is required' })
  }

  // Reader context is best effort: anything malformed is dropped rather than
  // failing the view, which must count regardless.
  const text = (value: unknown, max: number) =>
    typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined
  const screen = typeof body.screen === 'string' && /^\d{2,5}x\d{2,5}$/.test(body.screen)
    ? body.screen
    : undefined

  const forward: Record<string, unknown> = { articleId }
  if (text(body.referrer, 2048)) forward.referrer = body.referrer
  if (text(body.language, 35)) forward.language = body.language
  if (screen) forward.screen = screen

  const headers: Record<string, string> = {}
  const ip = getRequestIP(event, { xForwardedFor: true })
  const userAgent = getRequestHeader(event, 'user-agent')
  if (ip) headers['X-Reader-Ip'] = ip
  if (userAgent) headers['X-Reader-User-Agent'] = userAgent.slice(0, 512)

  try {
    return await publicApiPost<{ total: number }>('/views', forward, headers)
  }
  catch (error) {
    // A 404 means the article is unknown, another tenant's, or unpublished.
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 404) {
      throw createError({ statusCode: 404, statusMessage: 'Article not found' })
    }
    throw error
  }
})
