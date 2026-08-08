# Kratos config

Identity only. Kratos owns credentials; nothing else in this repo does.
See `../../../core-engine/docs/auth-request-flow.md` for how a session becomes a
tenant-scoped request.

## `identity.schema.json` — two things that are not obvious

**`username` is the password identifier, `email` is not.** Root `CLAUDE.md` §5:
email is contact information, not a login identity. The `email` trait carries
`recovery.via` and `verification.via` because those are *delivery channels* — where
Kratos sends a link. That is not the same as being a credential, and it must not
drift into one. There is no `identifier: true` under `email`, deliberately.

**Kratos usernames are globally unique; `authors.username` is unique per tenant.**
These do not agree, and the mismatch is a real constraint rather than an oversight:

- `authors_tenant_username_key` is `(tenant_id, username)` — two tenants may each
  legitimately have an author called `editor`, exactly as article slugs collide
  across tenants by design.
- A Kratos password identifier has no tenant to be scoped by. The login form
  collects a username and a password and nothing else, because
  `backoffice/CLAUDE.md` forbids choosing tenancy in the UI — tenancy is resolved
  server-side from the identity, which means it cannot also be an *input* to
  resolving that identity.

So in practice **usernames are globally unique across all tenants**, enforced by
Kratos rather than by Postgres. The per-tenant constraint stays because it is the
correct constraint for the data; it is simply weaker than what Kratos imposes.

The alternatives were considered and rejected: a composite `tenant/username`
identifier leaks tenancy into the login form, and a tenant selector in the UI
breaks the rule above. If global usernames ever become unacceptable, the escape
hatch is per-tenant admin subdomains — each with its own Kratos, which is a
deployment change, not a schema one.

## Registration is disabled

`selfservice.flows.registration.enabled: false`. Authors are provisioned by an
admin, never self-registered. This is the config-level counterpart of the rule in
`auth-request-flow.md`: *an unknown identity is 403, not auto-provisioned.* A valid
Kratos session with no matching `authors` row means someone got an identity without
being assigned to a tenant, and the API must refuse rather than guess.

That is also why the super admin is created through the Kratos **admin** API by
`core-engine/libs/database/src/seed/platform-admin.ts` — there is no public path
that could create one.

## Local vs production

`kratos.yml` hardcodes `http://localhost:3001` as the backoffice origin for local
development. In production every one of those URLs becomes the real admin hostname,
and `serve.public.base_url` must match the path the backoffice proxies Kratos under
(`/.ory/`) — if it doesn't, the self-service flows generate `ui.action` URLs
pointing at a host the browser can't reach, and login fails with no useful error.

The cookie is first-party for the same reason: the browser only ever talks to the
backoffice origin, so `same_site: Lax` is enough and no `SameSite=None` is involved.

## MailSlurper

The `courier.smtp` URI points at a dev SMTP catcher. Recovery and verification
emails go there, not to real inboxes. Production needs a real SMTP provider and the
URI must come from the environment, not this file.
