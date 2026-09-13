/**
 * What stands between a draft and publishing — defined ONCE.
 *
 * The aggregate's `missingToPublish()`, the admin list's `missingToPublish`
 * field, the dashboard pipeline counts and the `readiness` list filter all
 * answer the same question. If any of them computed it separately, the
 * dashboard could say "2 ready" while the filtered list showed three. The
 * repository's SQL mirrors `missingToPublishFrom` exactly; the integration suite
 * checks that the two agree.
 */

export type PublishBlocker = 'excerpt' | 'coverImage';

/** A draft's state as the pipeline and the list filter see it. Blockers overlap. */
export type Readiness = 'ready' | 'needs-excerpt' | 'needs-cover';

export const READINESS_VALUES: readonly Readiness[] = ['ready', 'needs-excerpt', 'needs-cover'];

/** Both fields feed the share preview (og:description, og:image). Blank counts as missing. */
export function missingToPublishFrom(fields: {
  excerpt: string | null | undefined;
  coverImage: string | null | undefined;
}): PublishBlocker[] {
  const missing: PublishBlocker[] = [];
  if (!fields.excerpt) missing.push('excerpt');
  if (!fields.coverImage) missing.push('coverImage');
  return missing;
}

export function hasReadiness(
  fields: { excerpt: string | null | undefined; coverImage: string | null | undefined },
  readiness: Readiness,
): boolean {
  const missing = missingToPublishFrom(fields);
  if (readiness === 'ready') return missing.length === 0;
  if (readiness === 'needs-excerpt') return missing.includes('excerpt');
  return missing.includes('coverImage');
}
