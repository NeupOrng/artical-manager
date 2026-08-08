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
  // dependency on someone else's uptime — see websites/CLAUDE.md. These three
  // faces are this site's alone and are not shared with technology-site.
  app: {
    head: {
      link: [
        // Only the two weights above the fold. Preloading the whole family
        // would compete with the cover image, which is the LCP element.
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/worksans-800.woff2', crossorigin: '' },
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/worksans-400.woff2', crossorigin: '' },
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
      siteName: 'Gaming Site',
    },
  },

  routeRules: {
    // Articles are static once published and invalidated explicitly by the
    // worker on publish. This is what lets the site keep serving during a
    // backend outage — do not add a render-blocking API call to these paths.
    '/': { isr: 600 },
    '/article/**': { isr: true },
    '/category/**': { isr: 600 },
  },

  typescript: { strict: true },

  // Vue strips template comments in production builds. The direction contract
  // at the top of app.vue is meant to survive into the emitted markup so it can
  // be audited against what actually shipped — a contract the build erases is a
  // contract nobody can check.
  vue: { compilerOptions: { comments: true } },
})
