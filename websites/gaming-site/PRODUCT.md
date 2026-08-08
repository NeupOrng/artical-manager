# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Confirmed by the user as "all" — deliberately the whole gaming audience, not a
segment. In practice that spans people who read patch notes for fun and people who
play two games a year, reading the same article.

The situation is the load-bearing fact. **Readers arrive from a shared link —
Facebook first — and land on one article.** Phone, no prior relationship with the
publication, seconds to decide whether to keep scrolling. A homepage visit means
someone already came back on purpose.

A second situation matters here more than it does on a news site: **guides and
walkthroughs are read while playing.** That reader is task-driven, often
one-handed, scanning for one specific answer, and will leave the moment they find
it. They are not reading; they are looking something up.

## Product Purpose

A gaming publication: news, reviews, guides and walkthroughs, esports, hardware,
releases. Success is a stranger finishing the piece they were linked to, and the
guide reader finding their answer without fighting the page.

## Positioning

No name or domain claimed yet (see Capabilities and Constraints). Structurally: a
small edited publication with a named author on every piece — not a wiki, not an
aggregator, not a feed.

## Operating Context

- Roughly ten authors platform-wide, writing in a WYSIWYG editor, scheduling
  pieces to publish at a set time. Scheduled publishing is what covers publisher
  embargoes; nothing embargo-specific exists or is planned.
- Distribution is a manually managed Facebook Page in Phase 1, so the **link
  preview card is seen before the site is** — for many readers it is the whole
  first impression.
- Read on phones more than anything else, including while a game is running.

## Capabilities and Constraints

Fixed article shape, platform-wide: title, TipTap block JSON content, `excerpt`,
`cover_image`, one category, one author, published timestamp. No extra fields for
this site.

- `excerpt` and `cover_image` are **mandatory** on anything published — they feed
  `og:description` and `og:image`, and are never generated from body text.
- `cover_image` is ~1200×630 and doubles as the social card. Art direction has to
  survive being rendered small in a feed.
- Pages are ISR-cached and revalidated on publish. **No render-blocking API call on
  an article or category path.**
- `og:` tags must be server-rendered; crawlers do not run JavaScript.
- **There is no review score field, and adding one is out of scope.** The
  conventional gaming-press number or star rating does not exist in the data model
  and must not be improvised into the excerpt or the article body. Any design that
  needs a score badge to work is the wrong design. If a score is genuinely wanted,
  it is a platform schema decision to raise, not a local one.
- No view counts, no comments, no tags, no platform/genre metadata, no release
  dates as structured data, no related-article API.
- Categories are tenant data managed through the admin, never hardcoded.
  Proposed but unconfirmed: News, Reviews, Guides & Walkthroughs, Esports,
  Hardware, Releases.

**Undecided, must not be invented:** domain, site name (`og:site_name`), Facebook
Page. Placeholder naming for this pass; a real name must drop in later without a
redesign.

## Brand Commitments

**kotaku.com is a pinned visual reference**, chosen by the user on 2026-08-06.
It is binding on *structure and register*, not on identity:

- Adopt: near-black neutral ground, a single grotesque worked from regular to
  extra-bold, title-case headlines set tight, a dense image-led card grid, a
  timestamped "latest" rail, and a coloured uppercase byline.
- Do not adopt: the reference's accent pair (yellow + magenta), its logo, its
  wordmark, its name, or its content. Ground plus typeface plus both accents
  together is that publication's identity — copying the set is where "same
  register" becomes "indistinguishable from", which is a brand exposure rather
  than a taste question.

This site's own accents are **volt** (acid lime — the site mark and every
interactive affordance) and **ember** (coral — bylines and section labels). Two
accents, one job each.

The site still has no name, no wordmark, and no logo. `SiteMark.vue` is an
authored placeholder glyph holding that slot.

## Evidence on Hand

None. No published articles, no logo, no key art, no screenshots, no review
material, no brand assets. Every article, headline, byline, and image used to build
and evaluate this design is authored placeholder material and must be labeled as
such. Real game titles, publishers, scores, and release dates are claims and must
not be fabricated as though this site had covered them.

## Product Principles

1. **The article page is the product**, because that is where strangers land.
2. **Two reading postures, one page system.** A review is read; a walkthrough is
   consulted. The page has to serve someone scanning for one line as well as
   someone reading straight through.
3. **The share card is designed, not derived.**
4. **No score, ever.** The publication's judgment lives in prose and in the
   excerpt, which is a stronger position than a number anyway.
5. **Nothing on the page may depend on live data.** The cache is a feature.

## Accessibility & Inclusion

Mobile is the primary case. Read in a dark room next to a screen at least as often
as in daylight — the use scene, not the category convention, decides the ground.
