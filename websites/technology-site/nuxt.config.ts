import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  // Tailwind is the styling system for every site — see websites/CLAUDE.md.
  // v4 is CSS-first: tokens live in assets/css/main.css, not a JS config.
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  // Faces are committed as woff2 under public/fonts and declared with
  // @font-face in main.css. Deliberately NOT fetched at build time from a font
  // CDN: that would make every build depend on a third party being up, and a
  // stylesheet request to another origin on an ISR page is a render-blocking
  // dependency on someone else's uptime — see websites/CLAUDE.md.
  app: {
    head: {
      link: [
        // Only the two faces above the fold are preloaded. Preloading all six
        // would compete with the cover image, which is the LCP element.
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/publicsans-700.woff2', crossorigin: '' },
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/publicsans-400.woff2', crossorigin: '' },
      ],
      htmlAttrs: { lang: 'en' },
    },
  },

  compatibilityDate: '2026-08-01',
  // Nuxt 4 default: app code lives in app/. Applied to all three apps in this
  // repo so nobody has to remember which one is different.
  srcDir: 'app/',
  serverDir: 'server/',

  runtimeConfig: {
    // SERVER ONLY. Anything outside `public` never reaches the browser — and
    // the tenant key must never reach the browser, or it is published.
    apiBaseUrl: '',
    tenantKey: '',
    revalidateSecret: '',
    public: {
      siteUrl: '',
      siteName: 'Technology Site',
    },
  },

  routeRules: {
    // Articles are static once published and invalidated explicitly by the
    // worker on publish. This is what lets the site keep serving during a
    // backend outage — do not add a render-blocking API call to these paths.
    '/': { isr: 600 },
    '/article/**': { isr: true },
    '/category/**': { isr: 600 },
    // Shorter than an article's cache on purpose. An author page carries
    // contact details that the author can withdraw, and a long-lived cache
    // keeps a withdrawn address readable after consent is gone. See the note
    // in websites/technology-site/CLAUDE.md.
    '/author/**': { isr: 300 },
  },

  typescript: { strict: true },

  // Vue strips template comments in production builds. The direction contract
  // at the top of app.vue is meant to survive into the emitted markup so it can
  // be audited against what actually shipped — a contract the build erases is a
  // contract nobody can check.
  vue: { compilerOptions: { comments: true } },
})
