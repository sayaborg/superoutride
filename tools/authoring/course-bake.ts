import type { CourseChange, CourseEditResult } from './course-edits.js';
import { childPointer, valueAt, withValue, type Json } from './json-pointer.js';

/** Offsets within this many metres are the same arrangement's. */
const SAME = 1e-4;

/** One piece of a bake group: a sprite placement without a body, by its place in the course document. */
export interface BakePlacement {
  /** The placement's JSON Pointer. */
  readonly pointer: string;
  readonly image: string;
  readonly palette: string;
  /** Its lateral's offset (m) and the line it is measured from. */
  readonly offset: number;
  readonly line: string;
  readonly groundOffset: number;
}

/** A place where a group stands: its element list, its pieces in that list's order, and what they share. */
export interface BakeSite {
  /** The JSON Pointer of the element list the pieces are siblings in. */
  readonly list: string;
  readonly pieces: readonly BakePlacement[];
  readonly at: Json;
  readonly unselectedLink: Json;
  /** The first piece's lateral, which the baked placement's is measured as. */
  readonly lateral: Json;
}

/**
 * Groups of the same arrangement, wherever they stand: the same pictures in the same order at the same offsets from the
 * first piece (within 0.1 mm), their palettes free. Each site's palettes make its color combination.
 */
export interface BakeEntry {
  readonly sites: readonly BakeSite[];
}

function lateralLine(lateral: Json): { readonly line: string; readonly offset: number } | null {
  if (typeof lateral === 'number') return { line: 'centre', offset: lateral };
  if (typeof lateral !== 'object' || lateral === null || Array.isArray(lateral)) return null;
  if (typeof lateral.offset !== 'number') return null;
  if (typeof lateral.boundary === 'string') return { line: `boundary ${lateral.boundary}`, offset: lateral.offset };
  if (typeof lateral.lane === 'string') return { line: `lane ${lateral.lane} ${lateral.side}`, offset: lateral.offset };
  return null;
}

/** A lateral like `lateral` at `offset` from the same line. */
export function withLateralOffset(lateral: Json, offset: number): Json {
  return typeof lateral === 'number' ? offset : { ...(lateral as { [key: string]: Json }), offset };
}

/**
 * The bake entries of a course document: in each element list (a Section's sprites or a repeat's elements), two or
 * more sprite placements without a body at the same `at`, the same `unselectedLink` and laterals from the same line make
 * a group; groups of one arrangement are one entry, in the order they first stand.
 */
export function findBakeEntries(document: Json): readonly BakeEntry[] {
  const sites: BakeSite[] = [];
  const visit = (elements: Json | undefined, list: string) => {
    if (!Array.isArray(elements)) return;
    const groups = new Map<string, { site: Omit<BakeSite, 'pieces'>; pieces: BakePlacement[] }>();
    elements.forEach((element, i) => {
      if (typeof element !== 'object' || element === null || Array.isArray(element)) return;
      const pointer = childPointer(list, String(i));
      if (element.kind === 'repeat') return visit(element.elements, childPointer(pointer, 'elements'));
      const lateral = lateralLine(element.lateral ?? null);
      if (element.kind !== 'sprite' || element.body !== null || !lateral) return;
      const key = JSON.stringify([element.at, element.unselectedLink, lateral.line]);
      const group = groups.get(key) ?? {
        site: { list, at: element.at!, unselectedLink: element.unselectedLink ?? null, lateral: element.lateral! },
        pieces: [],
      };
      group.pieces.push({
        pointer,
        image: element.image as string,
        palette: element.palette as string,
        offset: lateral.offset,
        line: lateral.line,
        groundOffset: element.groundOffset as number,
      });
      groups.set(key, group);
    });
    for (const { site, pieces } of groups.values()) if (pieces.length >= 2) sites.push({ ...site, pieces });
  };
  const sections = valueAt(document, '/sections');
  if (Array.isArray(sections))
    sections.forEach((section, i) => visit(valueAt(section, '/sprites'), `/sections/${i}/sprites`));
  const entries: { arrangement: BakeSite; sites: BakeSite[] }[] = [];
  for (const site of sites) {
    const entry = entries.find(({ arrangement }) => sameArrangement(arrangement, site));
    if (entry) entry.sites.push(site);
    else entries.push({ arrangement: site, sites: [site] });
  }
  return entries.map(({ sites }) => ({ sites }));
}

function sameArrangement(a: BakeSite, b: BakeSite): boolean {
  const [a0, b0] = [a.pieces[0]!, b.pieces[0]!];
  return (
    a.pieces.length === b.pieces.length &&
    a.pieces.every((piece, i) => {
      const other = b.pieces[i]!;
      return (
        piece.image === other.image &&
        Math.abs(piece.offset - a0.offset - (other.offset - b0.offset)) <= SAME &&
        Math.abs(piece.groundOffset - other.groundOffset) <= SAME
      );
    })
  );
}

/** A site's color combination: its pieces' palettes in order, as a baked picture's palette names it. */
export const siteCombination = (site: BakeSite, included: readonly boolean[]) =>
  site.pieces.filter((_, i) => included[i]).map((piece) => piece.palette);

/**
 * At every site of `entry`, the included pieces' placements give way to one placement of `image`: its palette the
 * site's combination joined by `+`, the pieces' `at` and `unselectedLink`, the first piece's lateral line at its offset
 * plus `across`, `groundOffset` `up`, and no body. It takes the first included piece's place in the list; excluded
 * pieces stay.
 */
export function bakeCoursePieces(
  document: Json,
  entry: BakeEntry,
  included: readonly boolean[],
  image: string,
  across: number,
  up: number,
): CourseEditResult {
  const changes: CourseChange[] = [];
  let edited = document;
  // Lists inside repeats first, and later sites of a list before earlier ones, so no edit moves a site still to come.
  const index = (site: BakeSite) => Number(site.pieces[0]!.pointer.slice(site.list.length + 1));
  const order = [...entry.sites].sort(
    (a, b) =>
      b.list.split('/').length - a.list.split('/').length || b.list.localeCompare(a.list) || index(b) - index(a),
  );
  for (const site of order) {
    const list = valueAt(edited, site.list);
    if (!Array.isArray(list)) return { ok: false, reason: `${site.list} is no element list` };
    const removed = new Set(site.pieces.filter((_, i) => included[i]).map((piece) => piece.pointer));
    const first = site.pieces.find((_, i) => included[i]);
    if (!first) return { ok: false, reason: 'No piece is included' };
    const placement: Json = {
      kind: 'sprite',
      image,
      palette: siteCombination(site, included).join('+'),
      at: site.at,
      lateral: withLateralOffset(site.lateral, fine(first.offset + across)),
      groundOffset: fine(up),
      unselectedLink: site.unselectedLink,
      body: null,
    };
    const next: Json[] = [];
    list.forEach((element, i) => {
      const pointer = childPointer(site.list, String(i));
      if (pointer === first.pointer) next.push(placement);
      if (!removed.has(pointer)) next.push(element);
      else changes.push({ pointer, before: element, after: undefined });
    });
    changes.push({ pointer: first.pointer, before: undefined, after: placement });
    edited = withValue(edited, site.list, next);
  }
  return { ok: true, document: edited, changes };
}

/** A baked piece put back: its picture, palette, and lateral and ground offset from the baked placement's (m). */
export interface UnbakedPiece {
  readonly image: string;
  readonly across: number;
  readonly up: number;
}

/**
 * Every placement of the baked picture `image` gives way to its pieces again, in their order and at its place: each
 * piece's picture, its palette from the placement's combination (split by `+`), the placement's `at`, `unselectedLink`
 * and lateral line at its offset plus the piece's `across`, its ground offset plus the piece's `up`, and no body.
 */
export function unbakeCoursePieces(document: Json, image: string, pieces: readonly UnbakedPiece[]): CourseEditResult {
  const changes: CourseChange[] = [];
  const restore = (elements: Json[], list: string): Json[] =>
    elements.flatMap((element, i): Json[] => {
      if (typeof element !== 'object' || element === null || Array.isArray(element)) return [element];
      const pointer = childPointer(list, String(i));
      if (element.kind === 'repeat' && Array.isArray(element.elements))
        return [{ ...element, elements: restore(element.elements, childPointer(pointer, 'elements')) }];
      if (element.kind !== 'sprite' || element.image !== image) return [element];
      const line = lateralLine(element.lateral ?? null);
      const palettes = String(element.palette).split('+');
      if (!line || palettes.length !== pieces.length) return [element];
      changes.push({ pointer, before: element, after: undefined });
      return pieces.map((piece, j) => ({
        kind: 'sprite',
        image: piece.image,
        palette: palettes[j]!,
        at: element.at!,
        lateral: withLateralOffset(element.lateral!, fine(line.offset + piece.across)),
        groundOffset: fine((element.groundOffset as number) + piece.up),
        unselectedLink: element.unselectedLink ?? null,
        body: null,
      }));
    });
  const sections = valueAt(document, '/sections');
  if (!Array.isArray(sections)) return { ok: false, reason: 'The document has no sections' };
  const restored = withValue(
    document,
    '/sections',
    sections.map((section, i) => {
      const sprites = valueAt(section, '/sprites');
      return Array.isArray(sprites)
        ? { ...(section as { [key: string]: Json }), sprites: restore(sprites, `/sections/${i}/sprites`) }
        : section;
    }),
  );
  return changes.length
    ? { ok: true, document: restored, changes }
    : { ok: false, reason: `No placement shows ${image}` };
}

/** A metre value to a billionth, so sums' last digits stay out of the document. */
function fine(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
