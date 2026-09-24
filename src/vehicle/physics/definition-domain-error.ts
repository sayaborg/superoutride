/** Expected authored-domain rejection, distinct from internal RangeErrors. Paths are JSON Pointers. */
export class DefinitionDomainError extends RangeError {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}
