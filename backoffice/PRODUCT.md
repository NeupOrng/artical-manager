# Product

<!-- impeccable:product-schema 1 -->

Scope: `backoffice` only — the internal admin tool. The two public tenant sites
have their own records in `websites/*`. Requirements and platform-wide decisions
live in the repo root `CLAUDE.md`.

## Platform

web

## Users

Roughly ten people, all internal, all of whom already know the tool. Three roles,
ranked, held per tenant:

- **contributor** — writes and drafts their own articles
- **editor** — reviews others' work, manages the taxonomy, publishes
- **admin** — the above, plus managing the tenant's authors

An author belongs to **exactly one tenant** and never chooses it — tenancy is
resolved server-side from their identity. There is no cross-tenant view for them.

Separately and outside that model: the **platform admin**, an operator who creates
tenants. They have no tenant and, deliberately, no access to any tenant's article
content. They are a different user with a different screen, not a super-user.

Confirmed 2026-08-09: the workflow is a **newsroom with a review flow** —
contributors submit, editors review and publish. Volume is high enough that
finding *what needs attention* matters more than a calm single-writer editor.

## Product Purpose

One backoffice managing several independently-branded publications. Authors write
in a rich editor and publish immediately; the public sites are separate Nuxt
projects that read from the same API.

Success is throughput: an editor should be able to open this and know within a few
seconds what is waiting on them.

## Operating Context

- **Desktop-first, usable on tablet.** Confirmed 2026-08-09. Designed for a
  laptop; degrades to tablet. A phone should render a readable dashboard, but
  writing and reviewing on one is not a supported path.
- Used daily by the same people. **Novelty is a cost and familiarity is the
  feature.**
- The backoffice runs on managed hosting, separate from the API. During a backend
  outage the public sites keep serving from cache while this tool is unavailable —
  so "the admin is down" never means "the sites are down", and the UI should not
  imply otherwise.
- Uploads go from the browser straight to object storage, never through this app's
  server routes.

## Capabilities and Constraints

Built today: login (Kratos), session, sign-out, principal resolution, and a
read-only dashboard. **Nothing editorial exists yet** — articles, categories,
media, and authors are unbuilt.

Durable constraints, all from the repo root `CLAUDE.md`:

- **No business logic here.** It renders, validates for UX, and calls the API. If
  it needs to know whether an article can be published, it asks.
- **Role-based hiding is cosmetic.** The API enforces permissions; a hidden button
  is a courtesy, not a control.
- **Article structure is fixed platform-wide.** Only the category taxonomy differs
  per tenant. There is no content-type builder.
- `excerpt` and `cover_image` are **mandatory to publish** — they feed the social
  share preview. This must read as a visible requirement while writing, not as an
  error at the moment of publishing.
- Content is TipTap block JSON, not HTML. A custom node needs a matching renderer
  in every site project, so adding one is a platform change.
- Preview renders on the tenant's own site, not here — building a second renderer
  guarantees preview drifts from live output.
- **Publishing is immediate.** Scheduled publishing was removed by decision; there
  is no future-dated state.

### Open decision — the review flow has no state to stand on

Raised 2026-08-09, **not resolved.** The confirmed workflow is contributors
submitting for editorial review, but `articles.status` is `draft | published` and
nothing else. There is no `in_review`, no submitted-at, and no reviewer.

So "submit for review" currently has to be a social act — a contributor stops
editing and tells someone. The dashboard can surface *drafts by other authors* for
an editor, which is a useful approximation, but it cannot distinguish "unfinished"
from "waiting on you", and those are different queues.

Making it real is a schema change (a status value plus a timestamp, at minimum)
and touches the status lifecycle doc, the aggregate, and the public/admin split.
**Do not add it as a UI-only state** — a review queue the API does not know about
is a lie the moment two editors use it.

## Brand Commitments

- **"Artical"** is the product name and wordmark. Confirmed intentional
  2026-08-09, not a misspelling of "Article".
- **This tool must not read like the publications it manages.** Both tenant sites
  run a near-black ground with a grotesque and a green-family accent. An admin
  that looks like a third sibling of them is the failure mode: it is a tool, and
  the sites are where brand and aesthetic risk belong.
- No shared theme package or component library with the sites, in either
  direction.

### Standing preference: the category standard — chosen 2026-08-09

Offered a rolled visual direction (letterpress composing-room machinery) and its
alternates, the user chose **the category standard**: the admin convention every
CMS ships, executed at full craft. This is a durable preference, not a one-off —
future surfaces inherit it, and "make it more distinctive" is not a licence to
reopen it.

Executed straight. No irony, no smuggled quirk, no distinctive flourish
compensating for the conventional choice. The convention IS the commitment; a
half-subverted admin is worse than either honest option.

**Craft bar: the Vercel dashboard.** Their level is the standard this must reach:

- high-contrast **light** ground, geometric restraint, minimal ornament
- crisp **monospace for identifiers** — ids, domains, slugs, keys — and nowhere
  else, never as a costume for "technical"
- clean cards and real borders over shadow-heavy elevation
- a tight neutral palette with one accent that carries meaning rather than
  decoration

Light-ground also happens to satisfy the constraint above: both publications are
near-black, so a light tool cannot be mistaken for a third one of them.

## Evidence on Hand

- Real seeded content: two tenants, one author each, five published and two draft
  articles per tenant, four media rows. Enough to design against real densities
  rather than lorem.
- The two live sites at `websites/*`, each with their own `DESIGN.md` recording
  what they actually look like — the anti-reference for this project.
- No production usage, no analytics, no real editorial volume yet. **Do not
  fabricate throughput numbers, user counts, or performance claims.**

## Product Principles

1. **Throughput over impression.** The same ten people every day. Time-to-answer
   beats delight; a screen that is merely pleasant has failed.
2. **Say what state something is in, plainly.** Status confusion means the wrong
   thing goes public. Never convey status by colour alone.
3. **The editor is the product; everything else is navigation to it.**
4. **Density is a feature.** These are lists to scan, not content to be sold.
5. **Never imply an authority this tool does not have.** It is a client of the
   API. Hidden buttons, optimistic states, and client-side filters are not
   controls.

## Accessibility & Inclusion

No externally required standard established. Product-specific needs that follow
from daily all-day use: visible keyboard focus throughout, keyboard paths for
repeated actions (save, publish), status never carried by colour alone, and real
contrast in both light and dark.
