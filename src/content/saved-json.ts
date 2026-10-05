/**
 * The repository's saved JSON layout, stable under the project's Prettier settings: two-space
 * indentation, a trailing newline, and 120 columns. A value below the root stays on one line when it
 * fits, unless it is an object holding more than primitives or an array Prettier always breaks (two or
 * more objects of two or more fields, or two or more arrays of two or more entries); otherwise its
 * container breaks onto one entry per line, and an array of numbers fills each line with as many as
 * fit. Strings and numbers use JSON's own spelling.
 */
const PRINT_WIDTH = 120;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export function formatSavedJson(value: unknown): string {
  return `${format(value as Json, '', 0, 0)}\n`;
}

/** Numbers fill each line in turn, as many as fit with their commas, as Prettier prints an array of numbers. */
function fill(items: readonly string[], indent: string): string {
  let text = `${indent}${items[0]}`,
    column = text.length;
  for (let i = 1; i < items.length; i++) {
    const item = `${items[i]}${i < items.length - 1 ? ',' : ''}`;
    text += ',';
    column += 1;
    if (column + 1 + item.length <= PRINT_WIDTH) {
      text += ` ${items[i]}`;
      column += 1 + items[i]!.length;
    } else {
      text += `\n${indent}${items[i]}`;
      column = indent.length + items[i]!.length;
    }
  }
  return text;
}

function primitive(value: Json): boolean {
  return value === null || typeof value !== 'object';
}

/**
 * Prettier breaks an array of two or more entries that are all objects with two or more fields, or all arrays with
 * two or more entries.
 */
function breaksArray(value: readonly Json[]): boolean {
  if (value.length < 2) return false;
  const objects = value.every((item) => !primitive(item) && !Array.isArray(item) && Object.keys(item!).length > 1);
  const arrays = value.every((item) => Array.isArray(item) && item.length > 1);
  return objects || arrays;
}

/** The one-line form of a value, or null when it breaks: objects holding anything but primitives always break. */
function flat(value: Json): string | null {
  if (primitive(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (breaksArray(value)) return null;
    const items = value.map(flat);
    return items.every((item) => item !== null) ? `[${items.join(', ')}]` : null;
  }
  const entries = Object.entries(value as { readonly [key: string]: Json });
  if (entries.length === 0) return '{}';
  if (!entries.every(([, item]) => primitive(item))) return null;
  return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(', ')} }`;
}

// prefixLength counts the indentation and key before the value, suffixLength the comma after it, if any.
function format(value: Json, indent: string, prefixLength: number, suffixLength: number): string {
  if (primitive(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  const comma = (index: number, length: number) => (index < length - 1 ? 1 : 0);
  // The root object always breaks; any other value stays on one line when it can and fits.
  const inline = indent === '' && !Array.isArray(value) ? null : flat(value);
  if (inline !== null && prefixLength + inline.length + suffixLength <= PRINT_WIDTH) return inline;
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'number'))
      return `[\n${fill(
        value.map((item) => JSON.stringify(item)),
        inner,
      )}\n${indent}]`;
    const lines = value.map(
      (item, index) => `${inner}${format(item, inner, inner.length, comma(index, value.length))}`,
    );
    return `[\n${lines.join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as { readonly [key: string]: Json });
  const lines = entries.map(([key, item], index) => {
    const head = `${inner}${JSON.stringify(key)}: `;
    return `${head}${format(item, inner, head.length, comma(index, entries.length))}`;
  });
  return `{\n${lines.join(',\n')}\n${indent}}`;
}
