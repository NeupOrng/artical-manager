import { z } from 'zod';

/** Worker env. Narrower than the API's — no HTTP port, no Swagger. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),

  // No Redis here: there is no queue. Background work is polled from Postgres.

  /** Internal endpoint for server-side reads and writes (minio:9000 in Docker). */
  MINIO_ENDPOINT: z.string().url(),
  /**
   * Browser-reachable endpoint used ONLY for signing upload URLs. A presigned
   * signature is bound to the host it was signed against, so signing with the
   * internal hostname produces a URL no browser can use.
   */
  MINIO_PUBLIC_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string().default('media'),
  MINIO_REGION: z.string().default('us-east-1'),
  /**
   * Browser-reachable base for stored objects. Deliberately separate from
   * MINIO_ENDPOINT: the API talks to minio:9000 inside Docker, while og:image
   * must be an absolute URL a crawler on the public internet can fetch.
   */
  MEDIA_PUBLIC_BASE_URL: z.string().url(),
  MEDIA_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(300),


  /** Health endpoint so Uptime Kuma can watch the worker too. */
  WORKER_PORT: z.coerce.number().int().positive().default(3001),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
};
