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

/** Whether two entries are one arrangement (the same pictures at the same offsets), as a later reading finds it again. */
export const sameBakeEntry = (a: BakeEntry, b: BakeEntry) => sameArrangement(a.sites[0]!, b.sites[0]!);

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
 * Where a site's included pieces do not stand side by side in their list (another element between them), which a
 * Revert could not put back in their order: the first such site's list, or null.
 */
export function bakeRefusal(entry: BakeEntry, included: readonly boolean[]): string | null {
  for (const site of entry.sites) {
    const indices = site.pieces.filter((_, i) => included[i]).map((piece) => elementIndex(site, piece));
    if (indices.some((index, i) => i && index !== indices[i - 1]! + 1))
      return `The pieces at ${site.list} have other elements between them, which Revert could not put back in order`;
  }
  return null;
}

const elementIndex = (site: BakeSite, piece: BakePlacement) => Number(piece.pointer.slice(site.list.length + 1));

/**
 * At every site of `entry` (found in `document`), the included pieces' placements give way to one placement of
 * `image`: its palette the site's combination joined by `+`, the pieces' `at` and `unselectedLink`, the first piece's
 * lateral line at its offset plus `across`, `groundOffset` `up`, and no body. It takes the first included piece's place
 * in the list; excluded pieces and every other element stay. Each list is rebuilt once from its elements as read, so no
 * site's edit moves another's; a site whose included pieces are not side by side is refused (`bakeRefusal`).
 */
export function bakeCoursePieces(
  document: Json,
  entry: BakeEntry,
  included: readonly boolean[],
  image: string,
  across: number,
  up: number,
): CourseEditResult {
  const refusal = bakeRefusal(entry, included);
  if (refusal) return { ok: false, reason: refusal };
  if (!included.some(Boolean)) return { ok: false, reason: 'No piece is included' };
  const changes: CourseChange[] = [];
  let edited = document;
  // Each list's sites, the lists inside repeats first (an outer list's edit keeps the inner lists it holds as edited).
  const lists = new Map<string, BakeSite[]>();
  for (const site of entry.sites) lists.set(site.list, [...(lists.get(site.list) ?? []), site]);
  const order = [...lists.keys()].sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
  for (const list of order) {
    const elements = valueAt(edited, list);
    if (!Array.isArray(elements)) return { ok: false, reason: `${list} is no element list` };
    // Each included piece's element by its index in the list as read, and the placement its site's first one becomes.
    const removed = new Set<number>(),
      placed = new Map<number, Json>();
    for (const site of lists.get(list)!) {
      const kept = site.pieces.filter((_, i) => included[i]);
      const first = kept[0]!;
      for (const piece of kept) removed.add(elementIndex(site, piece));
      placed.set(elementIndex(site, first), {
        kind: 'sprite',
        image,
        palette: siteCombination(site, included).join('+'),
        at: site.at,
        lateral: withLateralOffset(site.lateral, fine(first.offset + across)),
        groundOffset: fine(up),
        unselectedLink: site.unselectedLink,
        body: null,
      });
    }
    const next: Json[] = [];
    elements.forEach((element, i) => {
      const placement = placed.get(i);
      if (placement !== undefined) {
        next.push(placement);
        changes.push({ pointer: childPointer(list, String(next.length - 1)), before: undefined, after: placement });
      }
      if (!removed.has(i)) next.push(element);
      else changes.push({ pointer: childPointer(list, String(i)), before: element, after: undefined });
    });
    edited = withValue(edited, list, next);
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
