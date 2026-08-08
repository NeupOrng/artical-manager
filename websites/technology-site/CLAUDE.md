# technology-site/CLAUDE.md

Domain knowledge for the **technology** tenant site. Shared rules for all public
sites live in `../CLAUDE.md` — read that first; this file only covers what is
specific here.

> Several fields below are marked **TBD**. They are genuinely undecided, not
> placeholders to fill in with a guess. Ask before assuming.

## Identity

| | |
|---|---|
| Domain | **TBD** |
| Tenant `niche_label` | `technology` |
| Site name (`og:site_name`) | **TBD** |
| Audience | **Settled** — people working in technology *and* general readers following tech news. Both, deliberately. Depth a practitioner respects, phrased so a general reader is never locked out. |
| Facebook Page | **TBD** — used manually in Phase 1 |

## Categories

Tenant-scoped taxonomy, owned by this tenant alone. Categories are managed through
the admin, not hardcoded here — this list is context, not configuration.

Proposed starting set (**not yet confirmed**): Reviews, How-to / Guides, News,
Hardware, Software & Apps, AI.

Do not add a category in code. If a page needs one that doesn't exist, that's a
content decision for the tenant admin.

## Content shape

Article structure is fixed platform-wide (see root `CLAUDE.md`) — title, TipTap
content, excerpt, cover image, category. This site does not get extra fields; if it
seems to need one, that's a platform-level conversation, not a local change.

Where this site differs from gaming is **presentation**: what the homepage
prioritises, how dense the listing is, how prominent images are.

## Homepage

**TBD.** Open item 3 in the root `CLAUDE.md` is whether the two sites' homepages
diverge enough to justify separate layouts. Until that's decided, keep the layout
simple and avoid building elaborate homepage machinery that may be discarded.

Candidate blocks under discussion (none approved): per-category preview rows,
"Popular this month" ranking, author bio cards with article counts, ad/banner slots.
The ranking one depends on view recording, which is also undecided.

## Branding

Name, domain and logo are still **TBD**. The visual world is **settled** — see
`DESIGN.md` in this project for the full record.

**Reference-led, pinned by the user to [nuxt.com](https://nuxt.com).** Its system
is adopted at full fidelity; the mark and all content are ours.

- **Ground** — blue-tinted near-black (`--color-ground`), with `--color-surface`
  for cards and `--color-line` for hairlines.
- **One brand colour** — the reference's green (`--color-brand`). It marks the
  brand and interaction. It never tints body text and is not a general-purpose
  highlight.
- **Type** — Public Sans throughout, self-hosted in `public/fonts`. Display is
  set heavy and tight (`-0.025em`). **Mono is for code, data and measurement
  only** — never as a costume for "technical".
- **Radii are 4/6/8px and nothing else.** A stray 12px or a pill reads as a
  different system.
- The byline is a real element with the author's initial, because a named human
  on every piece is what separates this from an aggregator.

Design tokens live in `app/assets/css/main.css`. Do not extract a shared theme
package with `gaming-site` — each site owns its own `@theme` block, and that is
exactly what keeps re-diverging cheap (see below).

### The two sites now resemble each other — known and accepted

`websites/CLAUDE.md` and root `CLAUDE.md` §1 require the two public sites to read
as **unrelated publications**. As of **2026-08-06 they no longer fully do**:

| | technology-site | gaming-site |
|---|---|---|
| Ground | near-black, blue-tinted | near-black, neutral |
| Typeface | Public Sans | Work Sans |
| Accent | brand green | acid lime + coral |

Both are open-source Franklin-descended grotesques; both accents sit in the green
family. The collision was raised with the user **before** building, with the
mechanism spelled out, and building it anyway was their explicit decision.

**Do not "fix" this resemblance as if it were a bug.** It is a recorded trade.

The mitigation that was offered and declined was re-accenting `gaming-site` off
green. If the sites are ever to be pulled apart again that is the cheapest lever,
and it stays cheap precisely because there is no shared theme package: divergence
is a one-file change per site.

> Note: this relaxation is recorded here and at the top of this site's
> `main.css`. `gaming-site` was explicitly out of scope for that pass, so **its**
> `CLAUDE.md` does not yet carry the same note — worth adding when someone next
> touches that project.

## Author profiles

Built 2026-08-07. Bylines link to `/author/:username`; the article page carries an
end-of-article author card; listing cards carry the author name.

- **Contact details (`email`, `telegram`) are opt-in per author** and arrive
  already redacted from the API — null means "not opted in", so a `v-if` here is
  the last step of a server-side decision, not a display preference. Never work
  around a null by fetching the value another way.
- **`telegram` is free text by decision.** It may hold an `@handle` *or* a phone
  number, so it renders as plain text. Do not construct a `t.me` link from it —
  that produces a broken link for half the possible values.
- **The byline renders unlinked when `authorUsername` is null.** Authors created
  before this feature have no username; linking would produce `/author/null`.
- `/author/**` is `isr: 300`, deliberately shorter than an article's cache,
  because the page carries contact details an author can withdraw. **This does
  not fully solve withdrawal** — the end-of-article card lives on an `isr: true`
  article page that is cached until republished. See the "Withdrawing contact
  consent is NOT immediate" section in `core-engine/docs/api-conventions.md`.

## Notes

- Nothing about tenancy is configured in code beyond the tenant API key in env. This
  project does not know it is "tenant 1" and should not encode that.
- The `Tenant` row, its domain, and its categories are data. This project renders
  whatever the API returns for its key.
