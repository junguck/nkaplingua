import 'server-only';
import { z } from 'zod';

const schema = z.object({
  MONGO_URL: z.string().default('mongodb://127.0.0.1:27017'),
  MONGO_DB: z.string().default('nkaplingua'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  /** Secret HMAC des sessions : 32 caractères au moins, jamais commité. */
  STUDIO_SECRET: z.string().min(32),
  /** Service audio (torch TTS + transcodage) ; facultatif. */
  TTS_URL: z.string().url().optional(),
});

export type StudioEnv = z.infer<typeof schema>;

let cached: StudioEnv | null = null;

export function env(): StudioEnv {
  if (cached === null) cached = schema.parse(process.env);
  return cached;
}
