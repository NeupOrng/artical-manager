---
name: frontend-design
description: Design and build the UI for this platform's three Nuxt apps — the two public tenant sites and the backoffice admin — delegating general design craft to impeccable while enforcing the project constraints it can't know about. Use this whenever the user asks to design, style, lay out, theme, or visually improve anything in websites/ or admin/, including "build the article page", "make the homepage look good", "design the editor", "the site looks generic". Also use it before writing the first component in any of these apps, since the two sites are required to look unrelated and that's expensive to unpick later.
---

# Frontend design

Three Nuxt 4 apps, two very different design problems:

- **`websites/technology-site`, `websites/gaming-site`** — public publications.
  Read by strangers arriving from a shared link. Design carries the brand.
- **`admin`** — a tool. Used daily by roughly ten people who already know it.
  Design carries throughput.

Applying publication thinking to the admin, or tool thinking to the sites, is the
most common way to get this wrong.

## Delegate the craft to impeccable

[impeccable](https://impeccable.style/) is the design vocabulary layer — detector
rules for AI design defaults, design worlds to push past model defaults, and
commands for steering.

| Use | For |
|---|---|
| `/impeccable init` | Once per app, before designing. Writes the design context. |
| `/impeccable audit` | Check existing UI against the detector rules. |
| `/impeccable polish` | Tighten spacing, type, and detail on built UI. |
| `/impeccable critique` | Review a direction before committing to it. |
| `npx impeccable detect src/` | Deterministic pass, no LLM. Good for CI. |

If it isn't installed (`npx impeccable install`), design as well as you can without
it and say so — don't silently substitute generic advice and call it done.

**What impeccable can't know is everything below.** That's the entire reason this
skill exists; don't restate its guidance here.

## The constraint that overrides design instinct

**The two sites must look unrelated.**

They are separate publications with separate audiences and separate brands. A
reader who visits both should not be able to tell they share a backend.

This runs against what every design tool wants to do, and against good instincts —
shared tokens, a common component library, one theme package with two colour sets.
Resist all of it:

- **Tailwind CSS v4 is the styling system**, and each site owns its own
  `app/assets/css/main.css` `@theme` block. No shared preset, no shared theme
  package — stock Tailwind across both sites is exactly how they end up looking
  like siblings.
- Design tokens live **inside each site project**. No shared theme package.
- No shared component library across the two sites until there's a real second
  case for a specific component — and even then, prefer duplication over a
  premature abstraction that makes divergence expensive.
- Different type pairings, different spacing rhythm, different layout logic. Not
  the same skeleton with a hue rotation.

The admin is exempt — it's internal, and consistency there is a virtue.

## Constraints that are architectural, not cosmetic

These look like design choices and aren't. Breaking one degrades the system.

**No render-blocking API calls on ISR paths.** Article and category pages are
cached and revalidated on publish, which is what lets the public sites keep serving
during a VPS outage. A "live view count" or "trending now" strip fetched during SSR
on every article page quietly destroys that property. If a design needs live data,
it loads client-side after paint, or it doesn't ship.

**The cover image is the share preview.** `cover_image` feeds `og:image` at roughly
1200×630. It isn't only a design element — art direction, crops, and any overlay
treatment have to survive being rendered as a Facebook card at small size. Design
the card and the page together.

**The excerpt is design material and metadata.** It feeds `og:description` and is
mandatory on the model. Treat it as a real element with a real slot, not filler
under the headline. Never generate a fallback from body text — that hides a
content problem behind worse output.

**`og:` tags must be server-rendered.** Set them with `useSeoMeta` in the page's
`setup`. Crawlers don't run JavaScript, so a tag set in `onMounted` looks perfect
in devtools and is invisible when the link is shared. Verify with **view-source**.

**Nuxt 4 puts app code in `app/`.** `~/components` resolves to `app/components/`.
The current skeletons use the flat Nuxt 3 layout, so fix that when initialising
rather than fighting the framework default. See
`.claude/skills/fullstack-feature/references/nuxt-patterns.md` for the rest of the
Nuxt specifics.

## Designing the public sites

They're reading experiences first. What earns attention:

- **Long-form typography** — measure, leading, and the rhythm between headings and
  body across a 1500-word article. Get this right before anything else; it's most
  of the page most of the time.
- **The article page over the homepage.** Most readers arrive from a shared link
  and land on an article, not the front page. Design that path first.
- **Category listings** — density and scanability. Tech and gaming reasonably want
  different answers here.
- **Author attribution** — a byline is a small design problem with real trust
  implications on a content site.

Whether the two homepages diverge enough to justify separate layouts is an open
question in root `CLAUDE.md` §9. Don't settle it by building — raise it.

## Designing the admin

A different job. The people using it are the same ten every day, so novelty is a
cost and familiarity is the feature.

- Density over whitespace. They're scanning lists of articles, not being sold to.
- The editor is the product. Everything else is navigation to it.
- Keyboard paths for the repeated actions — save, publish, schedule.
- Show state plainly: draft, scheduled with its timestamp, published. Status
  confusion here means an article goes live at the wrong time.
- Missing `excerpt` or `cover_image` blocks scheduling. Surface that as a visible
  requirement while writing, not as a validation error at the moment of publishing.
  The API still enforces it, so handle the 422 gracefully anyway.
- Role-based hiding is cosmetic. The API enforces permissions; a hidden button is a
  courtesy, not a control.

Don't spend an aesthetic risk here. Spend it on the sites.

## Before designing anything: get the brief

A design skill can't invent a brand. These are `TBD` in the site `CLAUDE.md` files
and are the actual inputs:

- domain and site name
- audience — consumer tech vs practitioner changes everything about tone and density
- editorial voice
- any existing brand direction, references, or sites the user admires

Ask for them. Following `fullstack-feature` step 3: a plausible guess here is
indistinguishable from a decision until the brand is in front of readers, and by
then it's expensive. `/impeccable init` is a good vehicle for pinning them down.

If the user wants exploration before committing, say that's what you're doing and
label the output as direction rather than a decision.

## Quality floor

Non-negotiable, and not worth announcing in the output: responsive to mobile,
visible keyboard focus, reduced motion respected, real contrast ratios. Content
sites are read on phones more than anything else — mobile is the primary case, not
the fallback.

Verify by looking. Run the app, resize it, tab through it, and view-source the
`og:` tags. A design reviewed only as code is not reviewed.
