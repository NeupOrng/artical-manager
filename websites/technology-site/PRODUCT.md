# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences reading the same publication, confirmed by the user as "all in tech
industry and anyone interested in tech news":

- **People working in technology** — they already know the vocabulary and are
  reading to stay current. They skim, they arrive with context, and they resent
  being explained to.
- **Generally interested readers** — no industry background, following technology
  the way one follows any beat. They need the same article to be legible without
  a glossary.

The situation matters more than the segment. **Most readers arrive from a shared
link — Facebook first — and land on a single article, not the homepage.** They are
on a phone, they did not choose this publication, and the article has a few seconds
to earn the rest of the scroll. The homepage is a second-order surface reached by
people who already decided to come back.

## Product Purpose

A technology publication: news, reviews, and guides. Success is a stranger
finishing the article they were linked to, and a portion of them coming back
directly.

## Positioning

Not yet claimed in market terms — the site has no name or domain (see Capabilities
and Constraints). What is structurally true: it is a small, edited publication with
a named human author on every piece, not an aggregator and not a feed. Attribution
is real and per-article.

## Operating Context

- Roughly ten authors across the whole platform, writing in a WYSIWYG editor and
  scheduling pieces to publish at a set time.
- Articles reach readers through a manually managed Facebook Page in Phase 1.
  The **link preview card is therefore the publication's real front door** — for
  many readers it is the entire first impression, seen before any page loads.
- Read on phones more than anything else.

## Capabilities and Constraints

Fixed article shape, platform-wide, not negotiable per site: title, TipTap block
JSON content, `excerpt`, `cover_image`, one category, one author, published
timestamp. No extra fields.

- `excerpt` and `cover_image` are **mandatory** on anything published, because they
  feed `og:description` and `og:image`. Neither is ever generated from body text.
- `cover_image` is ~1200×630 and does double duty as the social card image. Any
  art direction has to survive being rendered small in a Facebook feed.
- Pages are ISR-cached and revalidated on publish. **No render-blocking API call on
  an article or category path** — that property is what keeps the site serving
  during a backend outage.
- `og:` tags must be server-rendered. Crawlers do not run JavaScript.
- No view counts, no ratings, no comments, no related-article API, no tags. If a
  design needs one, it is a platform schema decision, not a local one.
- Categories are tenant data managed through the admin, never hardcoded here.
  Proposed but unconfirmed: Reviews, How-to / Guides, News, Hardware,
  Software & Apps, AI.

**Undecided, must not be invented:** domain, site name (`og:site_name`), Facebook
Page. The user chose placeholder naming for this pass; the design must let a real
name drop in later without a redesign.

## Evidence on Hand

None. There are no published articles, no logo, no photography, no author photos,
and no brand assets of any kind. Every article, headline, byline, and image used
to build and evaluate this design is authored placeholder material and must be
labeled as such — nothing here may be presented as real coverage.

## Product Principles

1. **The article page is the product.** It is where strangers land and where the
   publication is judged. Everything else is navigation to it.
2. **Legible to both audiences at once.** Depth that a practitioner respects,
   phrased so a general reader is never locked out.
3. **The share card is designed, not derived.** Cover image and excerpt are
   composed for the feed and the page together, because the feed is seen first.
4. **Nothing on the page may depend on live data.** The cache is a feature.
5. **The byline is a trust element.** A named author on every piece is the main
   thing separating this from an aggregator.

## Accessibility & Inclusion

Mobile is the primary case, not the fallback. Long-form reading on a phone sets the
floor for type size, measure, and contrast.
