export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export const USERNAME_RULES_AR =
  'استخدم من 3 إلى 20 حرفًا إنجليزيًا أو رقمًا، ومسموح بعلامة _ فقط.';

const USERNAME_ALLOWED_PATTERN = /^[a-z0-9_]+$/;

export type UsernameValidationResult =
  | {
      ok: true;
      normalized: string;
      message: null;
    }
  | {
      ok: false;
      normalized: string;
      message: string;
    };

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): UsernameValidationResult {
  const normalized = normalizeUsername(value);

  if (!normalized) {
    return {
      ok: false,
      normalized,
      message: 'اكتب اسم المستخدم للمتابعة.',
    };
  }

  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      normalized,
      message: 'اسم المستخدم لازم يكون 3 حروف على الأقل.',
    };
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      normalized,
      message: 'اسم المستخدم لا يمكن أن يتجاوز 20 حرفًا.',
    };
  }

  if (!USERNAME_ALLOWED_PATTERN.test(normalized)) {
    return {
      ok: false,
      normalized,
      message: 'استخدم حروفًا إنجليزية أو أرقامًا، ومسموح بعلامة _ فقط.',
    };
  }

  return {
    ok: true,
    normalized,
    message: null,
  };
}