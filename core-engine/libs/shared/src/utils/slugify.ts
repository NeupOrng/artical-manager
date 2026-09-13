/**
 * Title → URL segment.
 *
 * Lives in `shared`, not in one context, because a slug is a public permanent
 * identifier and the rule for what one may contain has to be byte-identical
 * wherever it is derived — an article slug and a category slug diverging would
 * mean two different definitions of a valid URL.
 *
 * Deliberately narrow: lowercase latin, digits and hyphens. Anything needing
 * percent-encoding is a problem in a shared link, and a case-sensitive slug
 * makes /article/Foo and /article/foo two different pages.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    // Strip diacritics so "café" becomes "cafe" rather than losing the word.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}
