import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull } from 'drizzle-orm';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { tenants, authors, categories, articles } from '../schema';
import {
  TECHNOLOGY_ARTICLES,
  GAMING_ARTICLES,
  type FixtureArticle,
} from './articles.fixture';

/**
 * Development seed. Never run against production — this is not a migration.
 *
 * The two tenants mirror the projects in /websites. Domains are LOCAL
 * PLACEHOLDERS: the real ones are still TBD in each site's CLAUDE.md, and
 * nothing public depends on these yet.
 *
 * Each tenant gets published AND non-published articles on purpose, so that
 * "the public surface never returns a draft" is something you can actually
 * verify rather than assume.
 *
 * Article bodies come from `articles.fixture.ts` and are ENTIRELY SYNTHETIC —
 * they exist so the public sites can be designed against realistic long-form
 * content instead of a single lorem paragraph. Nothing in them is reported.
 */
const TENANTS = [
  {
    id: '0198f000-0000-7000-8000-000000000001',
    name: 'Technology Site',
    domain: 'technology-site.localhost',
    nicheLabel: 'technology',
    categories: ['reviews', 'guides', 'news'],
    articles: TECHNOLOGY_ARTICLES,
    // The FIRST author is the lead: an admin who authors every fixture
    // article. The second is a contributor, seeded so the role split (write
    // but not publish, delete, or manage categories) can be tested by hand and
    // by the integration suite. Usernames are globally unique in Kratos, so no
    // two entries anywhere in this file may share one.
    authors: [
      {
        username: 'mara-okonkwo',
        name: 'Mara Okonkwo',
        email: 'mara@technology-site.localhost',
        quote:
          'I take things apart to find out what the spec sheet left out. Fifteen years of that, and the answer is usually the hinge.',
        telegram: '@maraokonkwo',
        contactPublic: true,
        role: 'admin',
      },
      {
        username: 'nina-sato',
        name: 'Nina Sato',
        email: 'nina@technology-site.localhost',
        quote: null,
        telegram: null,
        contactPublic: false,
        role: 'contributor',
      },
    ],
  },
  {
    id: '0198f000-0000-7000-8000-000000000002',
    name: 'Gaming Site',
    domain: 'gaming-site.localhost',
    nicheLabel: 'gaming',
    categories: ['reviews', 'guides', 'news', 'esports'],
    articles: GAMING_ARTICLES,
    authors: [
      {
        username: 'devin-hartley',
        name: 'Devin Hartley',
        email: 'devin@gaming-site.localhost',
        quote:
          'Forty hours in before I write a word. If a game is worth covering it is worth getting lost in first.',
        telegram: '@devinhartley',
        contactPublic: true,
        role: 'admin',
      },
      {
        username: 'leo-marsh',
        name: 'Leo Marsh',
        email: 'leo@gaming-site.localhost',
        quote: null,
        telegram: null,
        contactPublic: false,
        role: 'contributor',
      },
    ],
  },
] as const;

/**
 * The non-published rows, identical in shape for both tenants. These are the
 * reason the seed exists: they prove the public surface cannot return them.
 * Drafts legitimately lack excerpt and coverImage — that is the invariant.
 *
 * There is no scheduled fixture: scheduling was removed and publishing is
 * immediate, so `draft` is the only non-published state.
 */
const UNPUBLISHED: FixtureArticle[] = [
  {
    slug: 'a-draft-nobody-should-see',
    title: 'DRAFT — must never appear publicly',
    status: 'draft',
    category: 'news',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Unfinished draft body.' }],
        },
      ],
    },
  },
];

/**
 * Per-article placeholder cover, 1200x630. One image per article rather than
 * one per tenant: `cover_image` doubles as `og:image`, so a listing where every
 * row shares a picture hides exactly the thing the design has to get right.
 *
 * These are authored synthetic images and are stamped as such. Uploaded to
 * MinIO under `media/seed/`; regenerate with the covers script if they go
 * missing (a 404 here is why the sites render broken images).
 */
const COVER = (niche: string, slug: string) =>
  `http://localhost:9000/media/seed/${niche}--${slug}.jpg`;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('refusing to seed a production database');
    process.exit(1);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    for (const t of TENANTS) {
      await db
        .insert(tenants)
        .values({
          id: t.id,
          name: t.name,
          domain: t.domain,
          nicheLabel: t.nicheLabel,
        })
        .onConflictDoNothing();

      // Keyed by (tenant, username), NOT "the tenant's author". Each tenant now
      // seeds two authors, so the previous lookup — the first author row in the
      // tenant — would update whichever one Postgres returned first and quietly
      // turn the contributor into Mara.
      let resolvedAuthorId: string | null = null;

      for (const [index, a] of t.authors.entries()) {
        const [byUsername] = await db
          .select({ id: authors.id })
          .from(authors)
          .where(and(eq(authors.tenantId, t.id), eq(authors.username, a.username)))
          .limit(1);

        // Databases seeded before the profile feature hold the lead author with
        // a NULL username. Adopt that row for the lead instead of inserting a
        // second copy of the same person.
        const [legacy] = !byUsername && index === 0
          ? await db
              .select({ id: authors.id })
              .from(authors)
              .where(and(eq(authors.tenantId, t.id), isNull(authors.username)))
              .limit(1)
          : [];

        const existing = byUsername ?? legacy;

        // SYNTHETIC. These people do not exist. `contact_public` is true for the
        // lead only so the opt-in path is visible locally — it is NOT the
        // production default, which is false (see schema/authors.ts).
        //
        // `role` is re-applied on every run: fixtures are reset to their
        // documented roles, so a role changed by hand while testing comes back.
        const profile = {
          username: a.username,
          name: a.name,
          email: a.email,
          quote: a.quote,
          telegram: a.telegram,
          contactPublic: a.contactPublic,
          role: a.role,
        };

        let id: string;
        if (existing) {
          id = existing.id;
          await db
            .update(authors)
            .set(profile)
            .where(and(eq(authors.tenantId, t.id), eq(authors.id, id)));
        }
        else {
          id = uuidv7();
          await db.insert(authors).values({
            id,
            tenantId: t.id,
            // Placeholder — replaced with a real identity by `task db:seed:authors`.
            kratosIdentityId: uuidv7(),
            ...profile,
          });
        }

        if (index === 0) resolvedAuthorId = id;
      }

      if (!resolvedAuthorId) throw new Error(`no lead author seeded for ${t.name}`);

      const categoryIds: Record<string, string> = {};
      for (const [position, slug] of t.categories.entries()) {
        await db
          .insert(categories)
          .values({
            id: uuidv7(),
            tenantId: t.id,
            name: slug.charAt(0).toUpperCase() + slug.slice(1),
            slug,
            // Required since categories.position became NOT NULL. The fixture's
            // array order is the nav order a fresh database starts with.
            position,
          })
          .onConflictDoNothing();

        // Scoped by tenant AND slug. Both tenants own a 'reviews' and a
        // 'guides' category, so a slug-only lookup here resolves to whichever
        // row Postgres returns first and can hand this tenant the other
        // tenant's category id. See docs/tenant-isolation.md.
        const [row] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(eq(categories.tenantId, t.id), eq(categories.slug, slug)),
          )
          .limit(1);

        if (!row) throw new Error(`category ${slug} missing for ${t.name}`);
        categoryIds[slug] = row.id;
      }

      // The published fixtures deliberately reuse `shared-slug-across-tenants`
      // across both tenants — that is legal, and it is what proves tenant
      // scoping actually works. The isolation spec and the Bruno environment
      // both depend on that slug existing in both tenants; do not rename it.
      const rows: FixtureArticle[] = [...t.articles, ...UNPUBLISHED];

      for (const r of rows) {
        const published = r.status === 'published';

        const publishedAt = published
          ? new Date(Date.now() - (r.agedDays ?? 0) * 86_400_000)
          : null;

        const values = {
          tenantId: t.id,
          authorId: resolvedAuthorId,
          categoryId: categoryIds[r.category] ?? null,
          title: r.title,
          content: r.content,
          // Drafts legitimately lack these; published rows must have them.
          excerpt: published ? (r.excerpt ?? null) : null,
          coverImage: published ? COVER(t.nicheLabel, r.slug) : null,
          status: r.status,
          publishedAt,
        };

        // Update on re-run rather than skipping: this is fixture content that
        // gets edited while designing, and onConflictDoNothing would silently
        // leave the previous body in place.
        await db
          .insert(articles)
          .values({ id: uuidv7(), slug: r.slug, ...values })
          .onConflictDoUpdate({
            target: [articles.tenantId, articles.slug],
            set: values,
          });
      }

      console.log(`seeded ${t.name} (${t.id})`);
    }

    console.log('\nTenant ids — use these as Kong consumer custom_id values:');
    for (const t of TENANTS) console.log(`  ${t.nicheLabel.padEnd(12)} ${t.id}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('seed failed:', error);
  process.exit(1);
});
