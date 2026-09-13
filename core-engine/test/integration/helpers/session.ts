/**
 * Integration-test helpers. These drive the REAL stack.
 *
 * Everything here goes through the GATEWAY (`:8000`), never the API port
 * directly. Hitting `:3000` skips Kong and Oathkeeper — the exact layer where
 * this project's auth bugs live — and worse, it passes: the API trusts an
 * identity header the gateway would have stripped, so a test written that way
 * proves nothing and reports success.
 *
 * Requires a running stack and a seeded database:
 *   task dev  (or: task up && task db:seed && task db:seed:authors)
 */

export const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8000';

/**
 * The backoffice origin. Kratos flows must be driven through it rather than
 * against Kratos directly, because `serve.public.base_url` advertises this
 * origin and the session cookie is scoped to it.
 */
export const BACKOFFICE = process.env.BACKOFFICE_URL ?? 'http://localhost:3001';

/** Matches the default in libs/database/src/seed/authors.ts. */
const SEED_PASSWORD
  = process.env.SEED_AUTHOR_PASSWORD ?? 'seed-author-password-2026';

/**
 * A logged-in session, expressed as the Cookie header to send.
 *
 * Drives the real Kratos password flow: create, read `ui.nodes` for the CSRF
 * token, submit. That is deliberately the same path a browser takes — a helper
 * that minted a session through Kratos' admin API would bypass the login and
 * stop catching login regressions.
 */
export async function signIn(username: string, password = SEED_PASSWORD): Promise<string> {
  const jar = new Map<string, string>();

  const collect = (res: Response) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (pair && eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };

  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const created = await fetch(`${BACKOFFICE}/.ory/self-service/login/browser`, {
    headers: { Accept: 'application/json' },
    redirect: 'follow',
  });
  collect(created);

  if (!created.ok) {
    throw new Error(
      `could not start a login flow (${created.status}). Is the stack up? `
      + 'Run `task dev`.',
    );
  }

  const flow = (await created.json()) as {
    ui: { action: string, nodes: { attributes: { name?: string, value?: unknown } }[] }
  };

  const csrf = flow.ui.nodes.find(n => n.attributes.name === 'csrf_token')
    ?.attributes.value as string | undefined;

  const submitted = await fetch(flow.ui.action, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cookie': cookieHeader(),
    },
    body: JSON.stringify({
      method: 'password',
      identifier: username,
      password,
      csrf_token: csrf,
    }),
    redirect: 'manual',
  });
  collect(submitted);

  if (submitted.status !== 200) {
    throw new Error(
      `login failed for "${username}" (${submitted.status}). `
      + 'Run `task db:seed:authors` to give the seeded authors identities.',
    );
  }

  const cookie = cookieHeader();
  if (!cookie.includes('ory_kratos_session')) {
    throw new Error('login returned 200 but set no session cookie');
  }
  return cookie;
}

/** A request through the gateway, optionally carrying a session. */
export function api(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const { cookie, headers, ...rest } = init;
  return fetch(`${GATEWAY}${path}`, {
    ...rest,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    redirect: 'manual',
  });
}

/** The seeded fixtures. Keep in sync with libs/database/src/seed. */
export const SEED = {
  techAuthor: 'mara-okonkwo',
  gamingAuthor: 'devin-hartley',
  /** Contributor role: may write, may NOT publish, delete, or manage categories. */
  techContributor: 'nina-sato',
  gamingContributor: 'leo-marsh',
  techTenantId: '0198f000-0000-7000-8000-000000000001',
  gamingTenantId: '0198f000-0000-7000-8000-000000000002',
  /** Exists in BOTH tenants — that is what makes it useful for isolation tests. */
  sharedSlug: 'shared-slug-across-tenants',
} as const;
