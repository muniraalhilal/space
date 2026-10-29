import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://space:space@localhost:5432/space'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** 32-byte key, base64 or hex. Encrypts integration secrets at rest. */
  APP_ENCRYPTION_KEY: z.string().min(32).default('dev-only-insecure-key-change-me-0123456789abcdef'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.data/files'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('space-files'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  /** AI provider for agent runs. `none` means agent runs fail with a clear "not configured" error. */
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'none']).default('none'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  AGENT_RUN_TIMEOUT_SEC: z.coerce.number().default(180),
  AGENT_WORKER_CONCURRENCY: z.coerce.number().default(2),
  GITHUB_API_URL: z.string().default('https://api.github.com'),
  LOG_LEVEL: z.string().default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;
/** Loads `.env` from the API folder or the repo root (if present) without overriding real env vars. */
function loadDotEnv() {
  if (process.env.NODE_ENV === 'test') return;
  for (const p of [path.resolve(process.cwd(), '.env'), path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')]) {
    if (fs.existsSync(p)) {
      try {
        process.loadEnvFile(p); // existing variables win
      } catch {
        /* unreadable .env: fall back to the real environment */
      }
      return;
    }
  }
}

export function config(): AppConfig {
  if (!cached) {
    loadDotEnv();
    // Treat empty values (e.g. `APP_ENCRYPTION_KEY=` in a copied template) as unset so defaults apply.
    const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
    const parsed = envSchema.safeParse(env);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
      throw new Error('Invalid environment configuration');
    }
    cached = parsed.data;
    if (cached.NODE_ENV === 'production' && cached.APP_ENCRYPTION_KEY.startsWith('dev-only')) {
      throw new Error('APP_ENCRYPTION_KEY must be set in production');
    }
  }
  return cached;
}

/** Test helper */
export function resetConfig() {
  cached = null;
}
