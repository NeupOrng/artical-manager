# Design — Gaming Site

Recorded from the built world, not from intention. Product truth lives in
`PRODUCT.md`; shared rules for all public sites live in `../CLAUDE.md`.

**This system is this site's alone.** There is no shared preset or theme package
with `technology-site`, and there must not be one.

## Direction

A modern gaming publication in a dark register: images lead, the named author is
visible on every story, and the page is dense and scannable.

`kotaku.com` is a **pinned reference** (user, 2026-08-06). Its *structure* is
adopted; its *identity* is not. See `PRODUCT.md` → Brand Commitments for the
exact line between the two. In short: ground, typeface and both accents together
are that publication's identity, so the accent pair here is deliberately
different.

A previous build set this site as a penny-press broadside — newsprint, wood
type, manicules, two justified columns. It was replaced wholesale. Do not
reintroduce fragments of it; half a broadside on a dark ground reads as an
unresolved world rather than a considered one.

## Tokens

All in `app/assets/css/main.css` under `@theme`. Semantic names only.

| Token | Role |
|---|---|
| `--color-pitch` | Near-black ground. Chosen from the use scene, not category habit |
| `--color-raise` | Raised surface — image wells, code |
| `--color-hair` | Hairline rules |
| `--color-paper` | Primary text |
| `--color-mute`, `--color-dim` | Secondary and tertiary text |
| `--color-volt` | **Acid lime.** Site mark and every interactive affordance |
| `--color-volt-deep` | Volt on light fills |
| `--color-ember` | **Coral.** Bylines and section labels — the "who and what" colour |
| `--font-sans` | Work Sans, 400–800. The only face |

## Rules that hold the world together

1. **Two accents, one job each.** Volt = interaction and the mark. Ember =
   people and sections. A third accent means this has stopped being a system.
2. **Images carry the page.** Type is the frame, not the subject.
3. **Nothing glows.** Flat fills, hairline rules — no neon bloom, no gradient
   text, no glass.
4. **One typeface.** Weight and size carry the voice; a second display face
   would dilute it.

## Components

| Component | Notes |
|---|---|
| `ArticleCard.vue` | Image on top, headline below. **No container** — no border, no panel, no radius. The image is the card's edge |
| `SiteMark.vue` | Authored placeholder glyph holding the wordmark slot. The site has no name or logo yet and neither may be invented |
| `ArticleBody.vue` | TipTap block JSON → `.story` via a render function. No `v-html`; unknown node types are dropped |
| `FeedError.vue` | Shown when a listing fetch fails. Exists because an empty array and an error are otherwise indistinguishable, and "nothing published yet" during an outage reports infrastructure failure as an editorial fact |

## Article body (`.story`)

Single column, 40rem measure, 1.125rem/1.7. Ordered-list markers are
volt-filled squares carrying the step number at real weight — on a walkthrough
the step number is what the reader is hunting for, often one-handed, mid-game.

Pull quotes use size and weight with a short ember rule above. Deliberately
**not** a thick coloured left bar: that is the single most recognisable
generated-UI tell and the impeccable detector flags it.

## Layout

Sticky bar under a volt hairline — this is a browsing site, unlike
`technology-site` where the masthead is passed once. Five sections do not earn a
hamburger; the rank scrolls horizontally on small screens instead.

Home: lead story plus a timestamped "Latest" rail, then a uniform card grid.
The grid is uniform on purpose — an earlier pass gave the first card a larger
size and an excerpt, which made row heights ragged and read as a bug rather than
as hierarchy. The lead above already carries the ranking.

Article: headline block, cover and body all run at the reading measure. A
1300px-wide headline over a 40rem body makes a story page feel like a landing
page.

## Fonts

Self-hosted woff2 in `public/fonts`, declared with `@font-face`,
`display: swap`. Not fetched from a font CDN at build time: that makes every
build depend on a third party, and a cross-origin stylesheet on an ISR page is a
render-blocking dependency on someone else's uptime. Only the two above-the-fold
weights are preloaded so they do not compete with the cover image, which is the
LCP element.

## Open

- No review score exists in the data model and none may be improvised
  (`PRODUCT.md`). Any design that needs a score badge is the wrong design.
- The rail shows category rather than author: `authorName` is not on the public
  list DTO, only on the detail DTO.
