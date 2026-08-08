# Background work

Read before touching the worker.

## There is no queue

BullMQ was removed by decision. Background work is **polled from Postgres**, which
means Postgres is the only source of truth and there is nothing that can fall out
of sync with it.

That deletes an entire class of failure the previous design had to defend against:
with a queue, Redis held the timer while the database held the truth, so a Redis
restart or a restored snapshot silently dropped pending work with no error and no
failed job. A boot reconciler existed purely to paper over that. Polling makes the
reconciler unnecessary — work that was never picked up is simply a row that is
still `pending`.

Redis remains in the stack, but only for Kong's ACME certificate storage in DB-less
mode. Nothing in the application connects to it except the API's health check.

## Publishing is immediate

There is no scheduled publishing. An article goes live the moment an editor
publishes it, so there is no future-dated state, no timer, and no worker
involvement in publishing at all. The status machine is `draft ⇄ published` — see
`article-status-lifecycle.md`.

## The one polled job: image processing

Uploads go browser → MinIO directly, so the API never holds the bytes and
derivatives have to be produced afterwards. `apps/worker/src/processors/media-sweeper.service.ts`
runs every 15 seconds.

**The `media` table is the work list.** Claiming is a single atomic statement:

```sql
UPDATE media SET status = 'processing', updated_at = now()
WHERE id IN (
  SELECT id FROM media
  WHERE status = 'pending' AND deleted_at IS NULL
  ORDER BY created_at LIMIT $1
  FOR UPDATE SKIP LOCKED
)
RETURNING id, tenant_id
```

`FOR UPDATE SKIP LOCKED` is what makes this safe to run from more than one worker:
two sweeps never claim the same row. The transaction is short — it only claims.
Processing happens afterwards, outside any transaction, because holding one open
for seconds of image work would pin a connection and block vacuum.

### Rules that hold it together

- **Nothing blocks on processing.** `media.url` points at the original and is valid
  the moment the row exists, so an article can publish and share correctly while
  derivatives are still pending. Failure degrades quality; it never breaks a page.
- **Idempotent.** Re-running writes the same variant keys and rewrites the same
  row, so a reclaimed or repeated sweep is safe.
- **Stuck rows are reclaimed.** A row left in `processing` for more than ten
  minutes means a worker died mid-job; the next boot returns it to `pending`.
  Without that they are stranded forever and nobody notices, because the original
  still renders.
- **An overlapping tick is skipped**, guarded by an in-process flag, so a slow
  batch can't pile up on itself.
- **One bad image must not stop the batch** — a failure marks that row `failed`
  with a reason and the loop continues.

### The worker has no identity

It serves every tenant. `claimPending` is deliberately **not** tenant-scoped — it
cannot be, since it decides which tenants' work to do. `tenantId` comes back with
each claimed row and is passed to every subsequent repository call exactly as a job
payload would have been. See `tenant-isolation.md`.

## If polled work grows

One sweep is cheap. If several kinds of polled work appear, resist adding a queue
back before asking what it buys: the reason to reach for one is genuine fan-out
across machines or delayed execution measured in seconds, neither of which applies
to a content site with ten authors.

## Related

- `article-status-lifecycle.md` — the two-state machine
- `media-and-uploads.md` — the upload flow this processing follows
- `tenant-isolation.md` — why `tenantId` still scopes every call
