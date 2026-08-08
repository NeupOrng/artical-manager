import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  compatibilityDate: '2026-08-01',
  // Matches the two tenant sites so nobody has to remember which app is
  // different — see websites/technology-site/nuxt.config.ts.
  srcDir: 'app/',
  serverDir: 'server/',

  // This is a tool, not a publication. No ISR, no prerendering: every page is
  // behind a session and shows live editorial state, so a cached admin page is
  // just a stale one. Contrast websites/*, where ISR is the whole point.
  ssr: true,

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      // Nothing here is public. Keeping crawlers out is not a security control
      // — the session is — but there is no reason for admin URLs to be indexed.
      meta: [{ name: 'robots', content: 'noindex, nofollow' }],
    },
  },

  runtimeConfig: {
    /**
     * SERVER ONLY. Both of these are outside `public` on purpose — they are the
     * addresses of internal services, and a value in `public` is compiled into
     * the client bundle where anyone can read it.
     *
     * apiBaseUrl is the gateway, NOT the API directly: requests must pass
     * through Kong and Oathkeeper to have an identity attached. Pointing this at
     * the API would bypass authentication entirely and every request would 401
     * — or worse, succeed, if the API were ever misconfigured to trust its
     * network.
     */
    apiBaseUrl: '',

    /**
     * Kratos' PUBLIC api, proxied under this app's origin at /.ory/*. Never the
     * admin api on 4434 — that one creates identities and impersonates people,
     * and it must not be reachable from a request handler that a browser can
     * trigger.
     */
    kratosPublicUrl: '',
  },

  typescript: { strict: true },

  // Vue strips template comments in production builds. The direction contract at
  // the top of app.vue is meant to survive into the emitted markup so it can be
  // audited against what actually shipped — a contract the build erases is a
  // contract nobody can check. Same reasoning as websites/technology-site.
  vue: { compilerOptions: { comments: true } },
})
