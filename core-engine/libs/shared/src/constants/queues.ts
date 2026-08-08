/**
 * There is no message queue in this system.
 *
 * Background work is polled from Postgres, which is therefore the only source
 * of truth — see apps/worker/src/processors/media-sweeper.service.ts. That
 * removes the whole class of failure where a Redis restart silently drops
 * pending work while the database still believes it is scheduled.
 *
 * Redis remains in the stack, but only for Kong's ACME certificate storage
 * (DB-less mode) and future caching.
 *
 * This file is kept as the place job/worker constants would live if polled work
 * grows beyond one sweep.
 */
export {};
