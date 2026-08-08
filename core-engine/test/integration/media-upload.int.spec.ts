import { describe, it, expect, beforeAll } from 'vitest';
import { deflateSync } from 'node:zlib';
import { api, signIn, SEED } from './helpers/session';

/**
 * The three-step upload, driven the way the browser drives it.
 *
 * The PUT deliberately goes STRAIGHT to storage using the signed URL, not
 * through the gateway — that is the whole design (managed hosts cap request
 * bodies around 4.5 MB), and a test that proxied it would be testing something
 * the product does not do.
 *
 * Image processing is one of the three things `fullstack-feature` calls out as
 * failing SILENTLY, so the last test waits for `ready` rather than assuming it.
 */

let cookie: string;
let gamingCookie: string;

/** A real 8×8 PNG. sharp has to be able to decode it for the sweep to work. */
function tinyPng(): Blob {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u32 = (n: number) =>
    Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const chunk = (type: string, data: Uint8Array) => {
    const t = Uint8Array.from([...type].map(c => c.charCodeAt(0)));
    const body = Uint8Array.from([...t, ...data]);
    return Uint8Array.from([...u32(data.length), ...body, ...u32(crc32(body))]);
  };

  const rows: number[] = [];
  for (let y = 0; y < 8; y++) {
    rows.push(0);
    for (let x = 0; x < 8; x++) rows.push((x * 32) % 256, (y * 32) % 256, 200);
  }
  const idat = deflateSync(Buffer.from(rows));
  const ihdr = Uint8Array.from([...u32(8), ...u32(8), 8, 2, 0, 0, 0]);

  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', new Uint8Array(idat)),
    ...chunk('IEND', new Uint8Array()),
  ]);

  // A Blob rather than the raw bytes: this TS lib's BodyInit does not accept a
  // bare Uint8Array, and a Blob carries the content type the presigned URL was
  // signed against.
  return new Blob([bytes], { type: 'image/png' });
}

interface Presigned {
  uploadUrl: string;
  publicUrl: string;
  mediaId: string;
  objectKey: string;
}

interface MediaBody {
  id: string;
  url: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  variants: Record<string, { url: string }>;
}

async function presign(as: string, over: Partial<Record<string, unknown>> = {}) {
  return api('/admin/v1/media/presign', {
    method: 'POST',
    cookie: as,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'cover.png',
      contentType: 'image/png',
      size: 110,
      ...over,
    }),
  });
}

beforeAll(async () => {
  cookie = await signIn(SEED.techAuthor);
  gamingCookie = await signIn(SEED.gamingAuthor);
}, 45_000);

describe('presign', () => {
  it('requires a session', async () => {
    const res = await api('/admin/v1/media/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'x.png', contentType: 'image/png', size: 10 }),
    });
    expect(res.status).toBe(401);
  });

  it('scopes the object key by tenant, prefix first', async () => {
    const a = (await presign(cookie).then(r => r.json())) as Presigned;
    const b = (await presign(gamingCookie).then(r => r.json())) as Presigned;

    // Tenant prefix leading, so a bucket policy could scope by prefix later.
    expect(a.objectKey.startsWith(SEED.techTenantId)).toBe(true);
    expect(b.objectKey.startsWith(SEED.gamingTenantId)).toBe(true);
    // And the tenant comes from the SESSION — two different authors cannot land
    // in the same prefix.
    expect(a.objectKey.split('/')[0]).not.toBe(b.objectKey.split('/')[0]);
  });

  it('refuses a content type outside the allowlist', async () => {
    const res = await presign(cookie, { contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });
});

describe('the full upload', () => {
  it('goes browser → storage → confirm, and the worker derives variants', async () => {
    const presigned = (await presign(cookie).then(r => r.json())) as Presigned;

    // STRAIGHT to storage with the signed URL. Not through the gateway — that
    // is the point of presigning.
    const put = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: tinyPng(),
    });
    expect(put.ok).toBe(true);

    const confirmed = (await api(
      `/admin/v1/media/${presigned.mediaId}/confirm`,
      {
        method: 'POST',
        cookie,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectKey: presigned.objectKey, filename: 'cover.png' }),
      },
    ).then(r => r.json())) as MediaBody;

    // Lands as pending; the media table IS the work list.
    expect(confirmed.status).toBe('pending');
    expect(confirmed.type).toBe('image/png');
    // Stable, absolute, no expiry — this is what og:image points at.
    expect(confirmed.url).toMatch(/^https?:\/\//);
    expect(confirmed.url).not.toContain('X-Amz-Signature');

    // Image processing fails SILENTLY, so wait for the real outcome rather than
    // assuming the sweep ran.
    //
    // Waits on pending AND processing. Waiting only on `pending` stops the
    // instant the worker claims the row and reports a half-done image as
    // finished — which is exactly what the Swagger enum used to encourage by
    // omitting `processing` from the documented states.
    let media = confirmed;
    const inFlight = (s: string) => s === 'pending' || s === 'processing';
    for (let i = 0; i < 25 && inFlight(media.status); i++) {
      await new Promise(r => setTimeout(r, 800));
      media = (await api(`/admin/v1/media/${presigned.mediaId}`, { cookie }).then(
        r => r.json(),
      )) as MediaBody;
    }

    expect(media.status).toBe('ready');
    expect(media.width).toBe(8);
    // og feeds the share card; the others back listings and avatars.
    expect(Object.keys(media.variants).sort()).toEqual([
      'avatar',
      'card',
      'og',
      'thumb',
    ]);
  }, 60_000);

  it('404s another tenant reading the media row', async () => {
    const presigned = (await presign(cookie).then(r => r.json())) as Presigned;
    await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: tinyPng(),
    });
    await api(`/admin/v1/media/${presigned.mediaId}/confirm`, {
      method: 'POST',
      cookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectKey: presigned.objectKey }),
    });

    const res = await api(`/admin/v1/media/${presigned.mediaId}`, {
      cookie: gamingCookie,
    });
    expect(res.status).toBe(404);
  });
});

describe('confirm is the enforcement point', () => {
  it('refuses to confirm an object that was never uploaded', async () => {
    // Without this, an abandoned upload leaves a row pointing at nothing and
    // og:image breaks on a live article.
    const presigned = (await presign(cookie).then(r => r.json())) as Presigned;

    const res = await api(`/admin/v1/media/${presigned.mediaId}/confirm`, {
      method: 'POST',
      cookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectKey: presigned.objectKey }),
    });
    expect(res.status).toBe(409);
  });
});
