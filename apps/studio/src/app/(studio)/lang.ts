import { isLanguage, type Language } from '@nkap/lingua-core';
import type { StudioUser } from '@/lib/server/auth';

/** Langue demandée dans l'URL, limitée à celles du compte. */
export function pickLang(user: StudioUser, requested: string | string[] | undefined): Language | null {
  const value = Array.isArray(requested) ? requested[0] : requested;
  if (isLanguage(value) && user.languages.includes(value)) return value;
  return user.languages[0] ?? null;
}
