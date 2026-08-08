import { v7 as uuidv7 } from 'uuid';

/**
 * Branded id types.
 *
 * A bare `string` cannot be passed where one of these is expected, so an
 * `ArticleId` can never slide into a `tenantId` parameter slot by accident.
 * See docs/tenant-isolation.md — this is one of the guards that keeps
 * cross-tenant access from being one typo away.
 */
declare const brand: unique symbol;

type Branded<T, B> = T & { readonly [brand]: B };

export type TenantId = Branded<string, 'TenantId'>;
export type AuthorId = Branded<string, 'AuthorId'>;
export type CategoryId = Branded<string, 'CategoryId'>;
export type ArticleId = Branded<string, 'ArticleId'>;
export type MediaId = Branded<string, 'MediaId'>;

/** UUID v7 — time-sortable, generated in the application layer, never by the DB. */
export const newId = <T extends string>(): T => uuidv7() as T;

export const asTenantId = (value: string): TenantId => value as TenantId;
export const asAuthorId = (value: string): AuthorId => value as AuthorId;
export const asCategoryId = (value: string): CategoryId => value as CategoryId;
export const asArticleId = (value: string): ArticleId => value as ArticleId;
export const asMediaId = (value: string): MediaId => value as MediaId;
