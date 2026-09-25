/**
 * The single admission toolkit for authored formats. Readers check JSON value shapes and throw one
 * expected-error type addressed by a JSON Pointer; `admit` attaches the document and returns a result.
 * Semantic checks stay with each format and report through the same error. Admission stops at the
 * first failure.
 */

/** Shape-level codes shared by every authored format; formats add their own semantic codes. */
export type AdmissionCode =
  | 'invalid_shape'
  | 'unsupported_feature'
  | 'invalid_numeric_domain'
  | 'invalid_value'
  | 'resource_limit'
  | 'duplicate_id'
  | 'unresolved_reference'
  | 'unsupported_format'
  | 'unsupported_version';

export interface AdmissionDiagnostic<Code extends string = AdmissionCode> {
  readonly kind: 'input';
  readonly code: Code;
  /** Delivered document path or authoring file; empty when the caller supplied none. */
  readonly document: string;
  /** JSON Pointer into the document; empty means the root. */
  readonly path: string;
  readonly message: string;
}

export type AdmissionResult<T, D = AdmissionDiagnostic<string>> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly diagnostics: readonly D[] };

/** Expected authored-content failure. Other exceptions are internal faults and propagate. */
export class AdmissionError<Code extends string = AdmissionCode> extends Error {
  readonly code: Code;
  readonly path: string;
  constructor(code: Code, path: string, message: string) {
    super(message);
    this.code = code;
    this.path = path;
  }
}

export function requireAdmission<Code extends string = AdmissionCode>(
  condition: boolean,
  code: Code,
  path: string,
  message: string,
): asserts condition {
  if (!condition) throw new AdmissionError(code, path, message);
}

/** Read one document; only admission errors become diagnostics, and no partial product is published. */
export function admit<T>(document: string, read: () => T): AdmissionResult<T, AdmissionDiagnostic<string>> {
  try {
    return Object.freeze({ ok: true as const, value: read() });
  } catch (error) {
    if (!(error instanceof AdmissionError)) throw error;
    return Object.freeze({ ok: false as const, diagnostics: Object.freeze([admissionDiagnostic(error, document)]) });
  }
}

export function admissionDiagnostic<Code extends string>(
  error: AdmissionError<Code>,
  document: string,
): AdmissionDiagnostic<Code> {
  return Object.freeze({
    kind: 'input' as const,
    code: error.code,
    document,
    path: error.path,
    message: error.message,
  });
}

/** RFC 6901 reference token. */
export function pointerToken(key: string): string {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** A slash-separated field path relative to a record, without a leading slash, as a JSON Pointer. */
export function relativePointer(path: string, base = ''): string {
  return `${base}/${path.split('/').map(pointerToken).join('/')}`;
}

// ---------------------------------------------------------------- Shape readers

/** A plain JSON object with exactly these fields. */
export function readRecord(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new AdmissionError('invalid_shape', path, 'Expected a JSON object');
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record))
    if (!fields.includes(key))
      throw new AdmissionError('unsupported_feature', `${path}/${pointerToken(key)}`, `Unknown field ${key}`);
  for (const key of fields)
    if (!Object.hasOwn(record, key))
      throw new AdmissionError('invalid_shape', `${path}/${pointerToken(key)}`, `Missing required field ${key}`);
  return record;
}

/** A JSON object used as a name-keyed dictionary; each name is a nonempty trimmed string. */
export function readDictionary<T>(
  value: unknown,
  path: string,
  read: (value: unknown, path: string, name: string) => T,
): Readonly<Record<string, T>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new AdmissionError('invalid_shape', path, 'Expected a JSON object of named entries');
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([name, entry]) => {
        const at = `${path}/${pointerToken(name)}`;
        requireAdmission(
          !!name.trim() && name === name.trim(),
          'invalid_value',
          at,
          'Expected a nonempty trimmed name',
        );
        return [name, read(entry, at, name)];
      }),
    ),
  );
}

export function readString(
  value: unknown,
  path: string,
  {
    maxLength = Infinity,
    pattern,
    patternMessage,
  }: { maxLength?: number; pattern?: RegExp; patternMessage?: string } = {},
): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim())
    throw new AdmissionError('invalid_shape', path, 'Expected a nonempty string without surrounding whitespace');
  if (value.length > maxLength)
    throw new AdmissionError('resource_limit', path, `String exceeds ${maxLength} code units`);
  if (pattern && !pattern.test(value))
    throw new AdmissionError('invalid_value', path, patternMessage ?? `Expected ${pattern}`);
  return value;
}

export function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new AdmissionError('invalid_shape', path, 'Expected a boolean');
  return value;
}

/** A finite number within the stated domain; negative zero reads as zero. */
export function readNumber(
  value: unknown,
  path: string,
  {
    min = -Infinity,
    max = Infinity,
    exclusiveMin = false,
    integer = false,
  }: { min?: number; max?: number; exclusiveMin?: boolean; integer?: boolean } = {},
): number {
  if (typeof value !== 'number') throw new AdmissionError('invalid_shape', path, 'Expected a number');
  if (!Number.isFinite(value) || value > max || (exclusiveMin ? value <= min : value < min))
    throw new AdmissionError(
      'invalid_numeric_domain',
      path,
      `Expected a finite number in ${exclusiveMin ? '(' : '['}${min}, ${max}]`,
    );
  if (integer && !Number.isInteger(value))
    throw new AdmissionError('invalid_numeric_domain', path, 'Expected an integer');
  return Object.is(value, -0) ? 0 : value;
}

/** RGB555 color integer. */
export function readRgb555(value: unknown, path: string): number {
  return readNumber(value, path, { min: 0, max: 0x7fff, integer: true });
}

export function readEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw new AdmissionError('invalid_value', path, `Expected one of ${allowed.join(', ')}`);
  return value as T;
}

export function readArray<T>(
  value: unknown,
  path: string,
  read: (value: unknown, path: string) => T,
  { max = Infinity, length }: { max?: number; length?: number } = {},
): readonly T[] {
  if (!Array.isArray(value)) throw new AdmissionError('invalid_shape', path, 'Expected an array');
  if (value.length > max) throw new AdmissionError('resource_limit', path, `At most ${max} entries are admitted`);
  if (length !== undefined && value.length !== length)
    throw new AdmissionError('invalid_shape', path, `Expected exactly ${length} entries`);
  return Object.freeze(Array.from(value, (item, index) => read(item, `${path}/${index}`)));
}

/** An array of records whose `id` values are unique within it. */
export function readIdentified<T extends { readonly id: string }>(
  value: unknown,
  path: string,
  read: (value: unknown, path: string) => T,
  options: { max?: number } = {},
): readonly T[] {
  const seen = new Set<string>();
  return readArray(
    value,
    path,
    (item, at) => {
      const result = read(item, at);
      if (seen.has(result.id))
        throw new AdmissionError('duplicate_id', `${at}/id`, `Duplicate ID ${JSON.stringify(result.id)} in ${path}`);
      seen.add(result.id);
      return result;
    },
    options,
  );
}

/** A versioned document root: format and version are checked before the current schema's fields. */
export function readDocument(
  value: unknown,
  fields: readonly string[],
  format: string,
  version: number,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new AdmissionError('invalid_shape', '', 'Expected a JSON object');
  readHeader(value as Record<string, unknown>, format, version);
  return readRecord(value, '', fields);
}

/** Format identity: the format field names the reader, the version field its one admitted version. */
export function readHeader(record: Record<string, unknown>, format: string, version: number): void {
  if (record.format !== format) throw new AdmissionError('unsupported_format', '/format', `Expected ${format}`);
  if (record.version !== version)
    throw new AdmissionError('unsupported_version', '/version', `Expected ${format} version ${version}`);
}

/** Admitted documents are detached plain JSON records, frozen including every nested collection. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------- Relative domain paths

/**
 * Expected authored-domain rejection raised by compilers below the document boundary. Paths are
 * slash-separated fields relative to the supplied record, without a leading slash.
 */
export class DefinitionDomainError extends RangeError {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

/** Translate nested or derived inputs to the caller's record; unexpected failures propagate. */
export function withDefinitionPath<T>(
  compile: () => T,
  locate: ((path: string) => string) | Readonly<Record<string, string>>,
): T {
  try {
    return compile();
  } catch (error) {
    if (!(error instanceof DefinitionDomainError)) throw error;
    const path = typeof locate === 'function' ? locate(error.path) : locate[error.path];
    if (!path) throw new Error(`Unmapped definition field: ${error.path}`, { cause: error });
    throw new DefinitionDomainError(path, error.message);
  }
}

/** The document boundary: a relative domain error becomes an admission error at its JSON Pointer. */
export function admitDomain<T>(
  compile: () => T,
  locate: (path: string) => string = (path) => relativePointer(path),
): T {
  try {
    return compile();
  } catch (error) {
    if (!(error instanceof DefinitionDomainError)) throw error;
    throw new AdmissionError('invalid_value', locate(error.path), error.message);
  }
}
