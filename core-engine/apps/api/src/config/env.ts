import { z } from 'zod';

/**
 * Env schema. Validated at boot — the process refuses to start on a bad config
 * rather than failing at the first request.
 *
 * New variables belong in infrastructure/env/.env.example too. Never hardcode
 * a value in application code.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

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

  /**
   * Kratos' ADMIN api, internal only (kratos:4434) — never routed through Kong.
   *
   * REQUIRED: the API provisions and deactivates authors through it, and a
   * missing value must fail at boot rather than at the moment an admin tries to
   * remove someone who left. Anything that can reach this can create logins.
   */
  KRATOS_ADMIN_URL: z.string().url(),

  /**
   * Readership analytics (Umami). All three OPTIONAL on purpose: without them
   * the API still boots and serves, and the dashboard reports analytics as
   * "not-connected". Internal URL only (umami:3000) — it is never public.
   */
  UMAMI_URL: z.string().url().optional(),
  UMAMI_USERNAME: z.string().optional(),
  UMAMI_PASSWORD: z.string().optional(),

  /** Swagger is served in non-production only. */
  SWAGGER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
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
