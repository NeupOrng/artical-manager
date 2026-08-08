# DESIGN.md — technology-site

The visual system as **built**, not as intended. Recorded from the shipped code.

Scope: this file governs `websites/technology-site` only. `gaming-site` has its
own, and there is deliberately no shared theme package between them.

---

## Direction

**Reference-led.** The user pinned [nuxt.com](https://nuxt.com) and its system is
adopted at full fidelity: ground, typeface, brand colour, radius language, and the
discipline of reserving mono for code. The site mark and every piece of content
are ours — the reference's own mark is its identity and is not borrowed.

Supersedes an earlier direction ("the measurement record", concept seed
`b47080ab`) which was replaced wholesale, not blended. Nothing of it remains: the
graticule, calibration-stamp byline, Archivo, and certification blue were all
removed rather than softened.

### Known and accepted: resemblance to gaming-site

Both sites now run a near-black ground, a Franklin-descended grotesque, and a
green-family accent. This breaks the "must read as unrelated" rule in root
`CLAUDE.md` §1. It was raised before building and accepted by the user on
2026-08-06. See `CLAUDE.md` in this project for the full record and the cheapest
route back. **Do not treat it as a bug.**

---

## Tokens

All in `app/assets/css/main.css` under `@theme`. Tailwind v4, CSS-first — there is
no `tailwind.config.js`.

### Colour

| Token | Role |
|---|---|
| `--color-ground` | Page ground. Blue-tinted near-black. |
| `--color-surface` | Cards, code blocks, pull quotes, avatar chip. |
| `--color-surface-hi` | Raised surface. Currently shares the value of `--color-line`. |
| `--color-line` | Card and section borders. |
| `--color-line-soft` | Header/footer hairlines. Quieter than `--color-line`. |
| `--color-text` | Body text. |
| `--color-muted` | Excerpts, secondary prose. Tinted from the ground's hue, never neutral grey. |
| `--color-faint` | Dates, tertiary meta. |
| `--color-brand` | **The one accent.** Mark, links, active nav, list markers, primary button. |
| `--color-brand-deep` | Hover state for brand-filled buttons only. |

**The brand-colour discipline:** it marks the brand and interaction. It never
tints body text, and it is not a general-purpose highlight. Widening its job is
what turns this into the generic near-black-plus-neon developer blog.

### Type

| Token | Value |
|---|---|
| `--font-sans` | `Public Sans`, self-hosted |
| `--font-mono` | system mono stack |

- Weights self-hosted in `public/fonts`: 400, 500, 600, 700, plus 400 italic.
  Latin subset only, `font-display: swap`.
- `h1`–`h3` are 700 with `-0.025em` tracking and `text-wrap: balance`.
- Body 1.0625rem/1.65. Article body 1.125rem/1.75.
- **Mono appears in code, data and measurement only.** Never as a costume for
  "technical" — that is a detector rule and a real one.

### Radius

`--radius-sm` 4px · `--radius-md` 6px · `--radius-lg` 8px. **Nothing else.** A
stray 12px or a pill reads as a different system.

---

## Layout

- Container `max-w-[76rem]`, padding `px-4` / `sm:px-6`.
- **Article pages run at `max-w-[46rem]` for header, cover and body alike.** The
  cover was briefly wider; a few rem of overhang on each side reads as
  misalignment rather than as a deliberately wider image.
- Listing grid is `sm:grid-cols-2 lg:grid-cols-4`. Four tracks, not three: the
  lead is pulled out of the grid, so a three-track row leaves one orphaned card
  at the article counts this publication actually has.
- Header is sticky, translucent over the ground, with `backdrop-blur`.

---

## Components

| Component | Notes |
|---|---|
| `SiteMark.vue` | Authored glyph in a brand-filled rounded square. Reserves the slot until a real wordmark exists — the site has no name yet and one must not be invented. |
| `ArticleCard.vue` | Bordered surface, inset image well. Excerpt is `line-clamp-3` **without** `flex-1`; the meta row uses `mt-auto`. |
| `ArticleBody.vue` | Renders TipTap block JSON via a render function. Emits `.doc`. |
| `FeedError.vue` | Shown when a listing fetch fails. |

### `.doc` — the article body

The most important block in the stylesheet; it is most of the page most of the
time.

- Measure `42rem`, 1.125rem/1.75.
- `h2` carries a `border-top` and 2.4em of space above versus 0.65em below.
  **Space above a heading always exceeds space below it.**
- Ordered lists use brand-coloured tabular numerals; unordered use a small brand
  dot.
- **Pull quotes are a bordered surface panel, not a thick coloured left bar.**
  That bar is a recognisable generated-UI tell and the detector flags it;
  emphasis comes from size and weight instead.

---

## Rules that are architectural, not cosmetic

These look like design choices and are not. Breaking one degrades the system.

1. **`og:` tags are set with `useSeoMeta` in `setup`, never `onMounted`.** Social
   crawlers do not execute JavaScript. Verify with view-source, not devtools.
2. **The cover image is the share preview.** `cover_image` feeds `og:image` at
   1200×630. Art direction must survive being rendered small in a feed, so the
   aspect ratio is fixed and never re-cropped.
3. **The excerpt is a real element with a real slot.** Mandatory on the model,
   feeds `og:description`, and is never generated from body text.
4. **No render-blocking API call on an ISR path.** `/api/categories` is a
   `defineCachedEventHandler` with `swr` for exactly this reason — without the
   cache it would be a second API call on every article render.
5. **Fonts are self-hosted.** A stylesheet request to a third-party font host on
   an ISR page is a render-blocking dependency on someone else's uptime. Verified:
   zero external font references in the rendered HTML.
6. **A failed fetch is not an empty publication.** `FeedError` exists because
   `v-if="!articles.length"` cannot tell an outage from an empty tenant, and
   reporting an outage as "No published articles yet" tells a reader the
   publication is dead.

---

## Quality floor

Mobile is the primary case, not the fallback. Verified at 390px and 1440px:
responsive composition, visible keyboard focus (2px brand outline, never removed),
`prefers-reduced-motion` respected, real contrast on the dark ground.

---

## Content status

Every article, byline and cover image in the running system is **synthetic
placeholder material**, authored for design review and labelled
`PLACEHOLDER — NOT REAL IMAGERY` on the artwork itself. There is no photography,
illustration or reporting for this publication. See `PRODUCT.md`, "Evidence on
Hand". Nothing here may be presented as real coverage.

Still undecided and not to be invented: **domain, site name (`og:site_name`), and
Facebook Page.**
