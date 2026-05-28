import * as Sentry from '@sentry/react-native';

type HandledErrorContext = Record<string, unknown> | undefined;

const SENSITIVE_KEY_PATTERN = /(messageBody|body|description|email|phone|token|password|secret|imageUrl|imageUrls|image_url|image_urls|gps|latitude|longitude|coordinates|userGeneratedText|userText|text|content|caption|comment|note)/i;
const SENSITIVE_STRING_PATTERN = /(https?:\/\/\S+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{7,}\d)/gi;
const MAX_SANITIZE_DEPTH = 5;

let sentryInitialized = false;

function sanitizeString(value: string): string {
  return value.replace(SENSITIVE_STRING_PATTERN, '[Filtered]');
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return '[Filtered]';
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((sanitized, [key, entry]) => {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[Filtered]' : sanitizeValue(entry, depth + 1);
    return sanitized;
  }, {});
}

function sanitizeEvent<T extends Sentry.Event>(event: T): T {
  const sanitized = sanitizeValue(event) as T;

  if (sanitized.message) {
    sanitized.message = sanitizeString(sanitized.message);
  }

  if (sanitized.user) {
    const userId = typeof sanitized.user.id === 'string' ? sanitized.user.id : undefined;
    sanitized.user = userId ? { id: userId } : undefined;
  }

  return sanitized;
}

export function initSentry() {
  if (sentryInitialized) return;
  sentryInitialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  Sentry.init({
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      return sanitizeEvent(event);
    },
  });
}

export function setSentryUser(userId: string | null) {
  if (!userId) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({ id: userId });
}

export function captureHandledError(error: unknown, context?: HandledErrorContext) {
  if (!sentryInitialized) initSentry();

  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('handled_error', sanitizeValue(context) as Record<string, unknown>);
    }

    Sentry.captureException(error);
  });
}
