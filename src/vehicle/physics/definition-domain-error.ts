/** Expected authored-domain rejection, distinct from internal RangeErrors. Paths are slash-separated fields relative to the supplied definition, without a leading slash. */
export class DefinitionDomainError extends RangeError {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

/** Translate nested or derived inputs to the caller's definition; unexpected failures propagate. */
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
