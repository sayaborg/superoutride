/**
 * The repository's saved JSON layout, stable under the project's Prettier settings: two-space
 * indentation, a trailing newline, and 120 columns. Containers break onto one entry per line, except
 * that an array of primitives, or an object below the root holding only primitives, stays on one
 * line when it fits. Strings and numbers use JSON's own spelling.
 */
const PRINT_WIDTH = 120;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export function formatSavedJson(value: unknown): string {
  return `${format(value as Json, '', 0)}\n`;
}

function primitive(value: Json): boolean {
  return value === null || typeof value !== 'object';
}

function format(value: Json, indent: string, prefixLength: number): string {
  if (primitive(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => (primitive(item) ? JSON.stringify(item) : null));
    const allPrimitive = items.every((item) => item !== null);
    const inline = `[${items.join(', ')}]`;
    // prefixLength counts the indentation and key before the value; +1 leaves room for a comma.
    if (allPrimitive && prefixLength + inline.length + 1 <= PRINT_WIDTH) return inline;
    const lines = value.map((item) => `${inner}${format(item, inner, inner.length)}`);
    return `[\n${lines.join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as { readonly [key: string]: Json });
  if (entries.length === 0) return '{}';
  if (indent !== '' && entries.every(([, item]) => primitive(item))) {
    const inline = `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(', ')} }`;
    if (prefixLength + inline.length + 1 <= PRINT_WIDTH) return inline;
  }
  const lines = entries.map(([key, item]) => {
    const head = `${inner}${JSON.stringify(key)}: `;
    return `${head}${format(item, inner, head.length)}`;
  });
  return `{\n${lines.join(',\n')}\n${indent}}`;
}
