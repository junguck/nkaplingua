import { z } from 'zod';

const csv = z
  .string()
  .transform((value) => value.split(',').map((item) => item.trim()).filter((item) => item.length > 0));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  SAFINUM_TEAM_KEY: z.string().regex(/^sbx_[A-Za-z0-9_-]{8,}$/, 'clé sbx_... attendue'),
  SAFINUM_BANK_URL: z.string().url().default('https://safinum.cm/api/v1'),
  /** Origines bancaires acceptées. Tout `bank_api.base_url` reçu hors liste est ignoré. */
  BANK_ALLOWED_ORIGINS: csv.default('https://safinum.cm'),

  /**
   * Secret de l'URL déclarée (`/hook/<secret>`). Seule la sandbox connaît l'URL déclarée :
   * c'est l'authentification de la passerelle. Obligatoire en production.
   */
  HOOK_SECRET: z.string().min(24).optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),

  MONGO_URL: z.string().default('mongodb://127.0.0.1:27017'),
  MONGO_DB: z.string().default('nkaplingua'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  TTS_URL: z.string().url().optional(),

  BANK_KEEPALIVE_MS: z.coerce.number().int().positive().default(60_000),
  BANK_WARM_INTERVAL_MS: z.coerce.number().int().nonnegative().default(20_000),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
});

export type Config = Readonly<z.infer<typeof envSchema>>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuration invalide : ${issues}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === 'production' && config.HOOK_SECRET === undefined) {
    throw new Error('HOOK_SECRET est obligatoire en production (URL déclarée non devinable).');
  }
  const bankOrigin = new URL(config.SAFINUM_BANK_URL).origin;
  if (!config.BANK_ALLOWED_ORIGINS.includes(bankOrigin)) {
    throw new Error(`SAFINUM_BANK_URL (${bankOrigin}) hors de BANK_ALLOWED_ORIGINS.`);
  }
  return config;
}
