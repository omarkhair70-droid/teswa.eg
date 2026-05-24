export type DolabPersistenceErrorKind = 'auth' | 'schema_missing' | 'unknown';

export type DolabPersistenceError = {
  kind: DolabPersistenceErrorKind;
  message: string;
  code?: string;
};

const SCHEMA_MISSING_CODES = new Set(['42P01', '42703', 'PGRST116']);

export function isSchemaMissingError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined): boolean {
  if (!error) return false;

  const code = error.code ?? '';
  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();

  if (SCHEMA_MISSING_CODES.has(code)) return true;

  return (
    message.includes('does not exist')
    || message.includes('relation')
    || message.includes('schema cache')
    || message.includes('could not find the table')
    || message.includes('not found in the schema')
  );
}

export function normalizeDolabPersistenceError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined): DolabPersistenceError | null {
  if (!error) return null;

  if (isSchemaMissingError(error)) {
    return {
      kind: 'schema_missing',
      message: 'الحفظ السحابي لسه غير مفعّل. شغّال محليًا مؤقتًا.',
      code: error.code ?? undefined,
    };
  }

  return {
    kind: 'unknown',
    message: 'تعذر إكمال الحفظ السحابي حاليًا. شغّال محليًا مؤقتًا.',
    code: error.code ?? undefined,
  };
}
