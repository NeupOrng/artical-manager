# Hydra — deployed, deliberately not in the login path

Decided 2026-08-07. Root `CLAUDE.md` §5 originally deferred Hydra entirely; this
reverses that to "running and configured", but **not** to "authenticates the
backoffice".

## Why the backoffice does not log in through Hydra

Hydra is an OAuth2 **provider**, not a login form. Putting a browser login behind
it means building a login-and-consent provider in the backoffice:

1. Browser hits Hydra's `/oauth2/auth`.
2. Hydra redirects to the backoffice's `/oauth2/login?login_challenge=…`.
3. The backoffice authenticates the user — via Kratos, which is still where
   credentials live.
4. The backoffice calls Hydra's admin API to accept the login challenge.
5. Hydra redirects to `/oauth2/consent?consent_challenge=…`; the backoffice
   accepts that too.
6. Hydra issues a code; the backoffice exchanges it for tokens.

Every one of those steps is a place to get session fixation, an open redirector,
or a challenge-confusion bug wrong. What it buys for **one first-party admin app**
is nothing that a first-party Kratos session cookie doesn't already provide —
Kratos is still doing the actual authentication in step 3 either way.

Hydra earns its place when there are third-party clients to delegate to, or
several independent apps that should not share a session. There is one admin.

## What would actually change when it's needed

In `../oathkeeper/oathkeeper.yml`, `oauth2_introspection` is already written and
sits at `enabled: false`. The migration is:

1. Enable it.
2. Change the `admin-api` rule's authenticator from `cookie_session` to
   `oauth2_introspection`.
3. Register a client with Hydra.

**NestJS does not change.** It reads `X-Kratos-Identity-Id` and resolves the
principal from the database, whichever authenticator set the header. That
property is the reason this deferral is cheap, and it is worth protecting.

## The rule that must not be broken

Root `CLAUDE.md` §5: **never put `tenant_id` or `role` in a token or session
claim.** Hydra makes this easy to violate — claims are right there, and stuffing
the tenant into one looks like an optimisation.

It isn't. A token with a baked-in role stays valid after the role is revoked, for
the full 30-minute access-token TTL. Resolve from the `authors` /
`platform_admins` row every request. The subject is the only thing the token is
allowed to carry.
