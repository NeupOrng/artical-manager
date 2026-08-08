# gaming-site/CLAUDE.md

Domain knowledge for the **gaming** tenant site. Shared rules for all public sites
live in `../CLAUDE.md` — read that first; this file only covers what is specific
here.

> Several fields below are marked **TBD**. They are genuinely undecided, not
> placeholders to fill in with a guess. Ask before assuming.

## Identity

| | |
|---|---|
| Domain | **TBD** |
| Tenant `niche_label` | `gaming` |
| Site name (`og:site_name`) | **TBD** |
| Audience | **TBD** |
| Facebook Page | **TBD** — used manually in Phase 1 |

## Categories

Tenant-scoped taxonomy, owned by this tenant alone and completely independent of the
technology site's. Managed through the admin, not hardcoded — this list is context,
not configuration.

Proposed starting set (**not yet confirmed**): News, Reviews, Guides & Walkthroughs,
Esports, Hardware, Releases.

## Content shape

Article structure is fixed platform-wide — title, TipTap content, excerpt, cover
image, category. No extra fields for this site.

Two things worth flagging early, because they may turn into platform requirements
rather than local ones:

- **Review scores.** Gaming content conventionally carries a numeric or star rating.
  There is no field for it, and it is *not* in scope. If it's wanted, it's a
  platform-level schema decision — raise it, don't improvise it into the TipTap body
  or the excerpt.
- **Embargo dates.** Gaming coverage often has publisher embargoes. Scheduled
  publishing already covers the mechanics; no special handling exists or is needed
  unless someone asks for embargo-specific behaviour.

## Homepage

**TBD** — see open item 3 in the root `CLAUDE.md`. Gaming homepages typically skew
more visual and higher-density than tech, which is the main argument for the two
sites *not* sharing a layout. Not decided. Keep it simple until it is.

## Branding

Name, domain and logo are still **TBD**. The visual world is **settled** — see
`DESIGN.md` in this project for the full record, and `PRODUCT.md` for the pinned
reference and what is and is not adopted from it.

**Modern gaming publication, dark register.** The user pinned `kotaku.com` as a
reference on 2026-08-06; its *structure* is adopted, its *identity* is not.

- **Ground** — near-black neutral (`--color-pitch`). Chosen from the use scene:
  read on a phone in a dark room beside a running game as often as in daylight.
- **Two accents, one job each.** `--color-volt` (acid lime) is the site mark and
  every interactive affordance. `--color-ember` (coral) is bylines and section
  labels. A third accent means this has stopped being a system.
  Deliberately **not** the reference's yellow + magenta — see `PRODUCT.md`.
- **Type** — Work Sans alone, 400 to 800, self-hosted in `public/fonts`. Weight
  and size carry the voice; there is no second display face.
- **Images lead.** Cards have no border, no panel, no radius — the image is the
  card's edge.
- **Nothing glows.** Flat fills, hairline rules, no neon bloom, no gradient
  text, no glass.

An earlier build set this site as a penny-press broadside (newsprint, wood type,
manicules). It was replaced wholesale by the pinned reference; do not reintroduce
fragments of it.

Design tokens live in `app/assets/css/main.css`. Do not share a theme package with
`technology-site`; the sites are meant to read as unrelated publications.

## Notes

- This site knows nothing about the technology site and must never query across
  tenants. Isolation is enforced by the API, but don't write code that assumes
  otherwise even in dead paths.
- Categories, domain, and tenant identity are data, not code.
