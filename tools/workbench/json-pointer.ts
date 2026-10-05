/** RFC 6901 JSON Pointers over plain JSON values. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The reference tokens of a pointer. */
export function pointerTokens(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** The pointer of a child of `pointer`. */
export function childPointer(pointer: string, key: string | number): string {
  return `${pointer}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function child(value: Json | undefined, token: string): Json | undefined {
  if (Array.isArray(value)) return /^(0|[1-9][0-9]*)$/.test(token) ? value[Number(token)] : undefined;
  if (value !== null && typeof value === 'object') return Object.hasOwn(value, token) ? value[token] : undefined;
  return undefined;
}

/** The value at a pointer, or undefined where it names nothing. */
export function valueAt(root: Json, pointer: string): Json | undefined {
  let value: Json | undefined = root;
  for (const token of pointerTokens(pointer)) value = child(value, token);
  return value;
}

/** The longest prefix of a pointer that names a value. */
export function nearestPointer(root: Json, pointer: string): string {
  let value: Json | undefined = root,
    found = '';
  for (const token of pointerTokens(pointer)) {
    value = child(value, token);
    if (value === undefined) break;
    found = childPointer(found, token);
  }
  return found;
}

/** A copy of `root` with the value at an existing pointer replaced. */
export function withValue(root: Json, pointer: string, value: Json): Json {
  const tokens = pointerTokens(pointer);
  const replace = (node: Json, depth: number): Json => {
    if (depth === tokens.length) return value;
    const token = tokens[depth]!;
    if (Array.isArray(node)) return node.map((item, i) => (String(i) === token ? replace(item, depth + 1) : item));
    const record = node as { [key: string]: Json };
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, key === token ? replace(item, depth + 1) : item]),
    );
  };
  return replace(root, 0);
}
