/**
 * A platform operator. Sits OUTSIDE the tenant model — see
 * libs/database/src/schema/platform-admins.ts for why this is a separate table
 * rather than a role on `authors`.
 *
 * Thin by design, in the same spirit as `libs/author`: there is no aggregate
 * here because a platform admin has no state machine. Deactivation is a boolean,
 * not a transition. See core-engine/CLAUDE.md, "Intentional asymmetry" — empty
 * ceremony is worse than no ceremony.
 *
 * Note what is ABSENT: no `tenantId`, and no `role`. Both are deliberate.
 * A platform admin has no tenant, so no tenant-scoped repository can be called
 * on their behalf — there is nothing to pass. And there is exactly one kind of
 * platform admin, so a role column would be a field with one legal value.
 */
export interface PlatformAdmin {
  id: string;
  /** Login identity handle, matching the Kratos `username` trait. */
  username: string;
  name: string;
  /** Contact address. NOT a credential — same rule as authors.email. */
  email: string;
  /**
   * Checked on every request. Resolving the principal per request rather than
   * trusting a token claim is precisely what makes a deactivation take effect
   * immediately instead of at the next token expiry.
   */
  isActive: boolean;
}
