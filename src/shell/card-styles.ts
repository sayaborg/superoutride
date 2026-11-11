import { TEXT_MARKS, TEXT_PALETTES, TEXT_TILE_SIZE, type OrnateStyle } from '../image/text-tiles.js';
import { CARD, type PageCanvas, type PageWords, type PixelBox, type PlainCardStyle } from './card-face.js';
import { SMALL_PRINT } from './small-print.js';

/**
 * One thing a page says of its subject: a label, its value with its unit, and a note after it. A page's own words
 * (labels, units, notes) are of the small print's characters.
 */
export interface PageFact {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly note?: string;
  /** The label's text palette where it is a chart's legend, on a dark ground; the style's color otherwise. */
  readonly ink?: number;
}

/**
 * What a page card says, whatever its style (K, 2026-11-12: a card is packed with what it is about, and a course's or a
 * vehicle's card is the same card wherever it appears): its title and a tag under it; up to eight facts under
 * `factsName`, up to eight more under `moreName`; a line of its own for a choice (a vehicle's color, between marks when
 * UP and DOWN change it); a picture; a chart, a low strip or a block beside the picture, under `chartName`; and words.
 */
export interface PageParts {
  readonly title: string;
  readonly tag: string;
  readonly factsName: string;
  readonly facts: readonly PageFact[];
  readonly moreName: string;
  readonly more: readonly PageFact[];
  readonly choice: { readonly label: string; readonly value: string; readonly changes: boolean } | null;
  readonly chart: 'strip' | 'block';
  readonly chartName: string;
  readonly words: { readonly heading: string | null; readonly description: string } | null;
}

/** Where a style left room on a face for the page's picture and chart, each on a flat ground, and the face's words. */
export interface PageLayout {
  readonly picture: { readonly box: PixelBox; readonly ground: number } | null;
  readonly chart: { readonly box: PixelBox; readonly ground: number; readonly ink: number } | null;
  readonly words: PageWords | null;
}

/** A card style: the plain cards' look, and a page card's faces laid out from its parts. */
export interface CardStyle extends PlainCardStyle {
  /** Its name on SETTINGS' CARD DESIGN card. */
  readonly name: string;
  /** How many faces a page of `parts` has in it. */
  faces(parts: PageParts): number;
  /** Paint face `face` of a page of `parts`, but for its picture and chart. */
  page(canvas: PageCanvas, parts: PageParts, face: number): PageLayout;
}

/** What a page holds at most, which every style lays out. */
export const PAGE_LIMITS = Object.freeze({ facts: 8, more: 8, titleColumns: CARD.columns - 2 });

const rgb = (red: number, green: number, blue: number) => (red << 10) | (green << 5) | blue;
const WIDTH = CARD.columns * TEXT_TILE_SIZE,
  HEIGHT = CARD.rows * TEXT_TILE_SIZE;
const WHITE = rgb(31, 31, 31),
  BLACK = 0,
  YELLOW = rgb(31, 29, 4),
  ORANGE = rgb(30, 15, 0),
  RED = rgb(25, 4, 2);
const full = (color: number, canvas: PageCanvas) => canvas.fill({ x: 0, y: 0, width: WIDTH, height: HEIGHT }, color);
const smallWidth = (line: string) => line.length * SMALL_PRINT.width;
const normalWidth = (line: string) => line.length * TEXT_TILE_SIZE;

/** A fact on one line: its label in the small print, then from `label` pixels on its value and unit, and its note. */
function inlineFact(
  canvas: PageCanvas,
  x: number,
  y: number,
  width: number,
  label: number,
  fact: PageFact,
  inks: { label: number; value: number; note: number; legend: boolean },
) {
  const legend = inks.legend && fact.ink !== undefined ? canvas.mainColor(fact.ink) : inks.label;
  canvas.small(x, y, fact.label, legend);
  const value = `${fact.value}${fact.unit ?? ''}`,
    note = fact.note ?? '',
    room = width - label;
  // The value in the normal font where it and its note fit, else all of it in the small print.
  if (normalWidth(value) + (note ? 2 + smallWidth(note) : 0) <= room) {
    canvas.ink(x + label, y, value, inks.value);
    if (note) canvas.small(x + label + normalWidth(value) + 2, y, note, inks.note);
  } else canvas.small(x + label, y, `${value.toUpperCase()}${note ? ` ${note}` : ''}`, inks.value);
}

/** Facts in two columns of `width` pixels from (`x`, `y`), a row every `pitch`, filled a row at a time. */
function factColumns(
  canvas: PageCanvas,
  facts: readonly PageFact[],
  at: { x: number; y: number; width: number; pitch: number; label: number },
  inks: { label: number; value: number; note: number; legend: boolean },
) {
  facts.forEach((fact, i) =>
    inlineFact(canvas, at.x + (i % 2) * at.width, at.y + Math.floor(i / 2) * at.pitch, at.width, at.label, fact, inks),
  );
}

/** The choice's line on text row `row`: its label in the small print, and its value YELLOW, between marks if it changes. */
function choiceLine(canvas: PageCanvas, row: number, choice: NonNullable<PageParts['choice']>, label: number) {
  canvas.small(8, row * TEXT_TILE_SIZE, choice.label, label);
  const column = 1 + Math.ceil(smallWidth(choice.label) / TEXT_TILE_SIZE) + 1;
  if (!choice.changes) return canvas.write(column, row, choice.value, TEXT_PALETTES.YELLOW);
  canvas.write(column, row, TEXT_MARKS.up);
  canvas.write(column + 2, row, choice.value, TEXT_PALETTES.YELLOW);
  canvas.write(column + 3 + choice.value.length, row, TEXT_MARKS.down);
}

const words = (parts: PageParts, box: PixelBox, ground: number): PageWords | null =>
  parts.words && { box, ground, heading: parts.words.heading, description: parts.words.description };

/**
 * PROGRAM, a race programme's page: a navy ground, the tag on three racing stripes under the title, the picture and
 * the chart on fields a shade lighter, and the facts in ranged columns, labels in the small print.
 */
const PROGRAM: CardStyle = (() => {
  const ground = rgb(1, 2, 5),
    field = rgb(2, 4, 9),
    inks = { label: rgb(14, 19, 26), value: WHITE, note: rgb(11, 14, 20), legend: true };
  const stripes = (canvas: PageCanvas, x: number, y: number, width: number) =>
    [YELLOW, ORANGE, RED].forEach((color, i) => canvas.fill({ x, y: y + 2 * i, width, height: 2 }, color));
  return Object.freeze({
    id: 'program',
    name: 'PROGRAM',
    plain(canvas: PageCanvas, kind: 'name' | 'list'): OrnateStyle {
      full(ground, canvas);
      stripes(canvas, 52, kind === 'name' ? 92 : 28, 120);
      return 'SUNSET';
    },
    faces: () => 1,
    page(canvas: PageCanvas, parts: PageParts): PageLayout {
      full(ground, canvas);
      canvas.title(8, 4, PAGE_LIMITS.titleColumns, parts.title);
      canvas.small(8, 22, parts.tag, YELLOW);
      const from = 8 + smallWidth(parts.tag) + 6;
      if (from < 216) stripes(canvas, from, 21, 216 - from);
      if (parts.chart === 'strip') {
        const picture = { x: 8, y: 30, width: 100, height: 62 },
          chart = { x: 8, y: 96, width: 208, height: 18 };
        canvas.fill(picture, field);
        canvas.fill(chart, field);
        parts.facts.forEach((fact, i) => inlineFact(canvas, 112, 30 + i * 8, 104, 36, fact, inks));
        return {
          picture: { box: picture, ground: field },
          chart: { box: chart, ground: field, ink: inks.label },
          words: words(parts, { x: 8, y: 120, width: 208, height: 48 }, ground),
        };
      }
      const picture = { x: 8, y: 30, width: 100, height: 58 },
        chart = { x: 112, y: 30, width: 104, height: 58 };
      canvas.fill(picture, field);
      canvas.fill(chart, field);
      factColumns(canvas, parts.facts, { x: 8, y: 92, width: 104, pitch: 8, label: 32 }, inks);
      factColumns(canvas, parts.more, { x: 8, y: 126, width: 104, pitch: 8, label: 32 }, inks);
      if (parts.choice) choiceLine(canvas, 20, parts.choice, inks.label);
      return {
        picture: { box: picture, ground: field },
        chart: { box: chart, ground: field, ink: inks.label },
        words: null,
      };
    },
  });
})();

/**
 * PIT BOARD: a black ground under a red band that holds the title and the tag, two stripes under it, and the facts
 * in black on a signal-yellow board.
 */
const PIT_BOARD: CardStyle = (() => {
  const ground = rgb(1, 1, 3),
    board = rgb(31, 27, 2),
    onBoard = { label: rgb(12, 7, 0), value: BLACK, note: rgb(12, 7, 0), legend: false },
    onGround = { label: rgb(31, 27, 2), value: WHITE, note: rgb(18, 16, 6), legend: true };
  const band = (canvas: PageCanvas, y: number, height: number) => {
    canvas.fill({ x: 0, y, width: WIDTH, height }, RED);
    canvas.fill({ x: 0, y: y + height, width: WIDTH, height: 2 }, YELLOW);
    canvas.fill({ x: 0, y: y + height + 2, width: WIDTH, height: 2 }, ORANGE);
  };
  return Object.freeze({
    id: 'pit-board',
    name: 'PIT BOARD',
    plain(canvas: PageCanvas, kind: 'name' | 'list'): OrnateStyle {
      full(ground, canvas);
      if (kind === 'name') band(canvas, 44, 48);
      else band(canvas, 0, 28);
      return 'WHITE';
    },
    faces: () => 1,
    page(canvas: PageCanvas, parts: PageParts): PageLayout {
      full(ground, canvas);
      band(canvas, 0, 28);
      canvas.title(8, 3, PAGE_LIMITS.titleColumns, parts.title, 'WHITE');
      canvas.small(8, 21, parts.tag, YELLOW);
      if (parts.chart === 'strip') {
        const picture = { x: 8, y: 36, width: 100, height: 62 },
          chart = { x: 8, y: 102, width: 208, height: 16 };
        canvas.fill({ x: 112, y: 34, width: 112, height: 66 }, board);
        parts.facts.forEach((fact, i) => inlineFact(canvas, 116, 36 + i * 8, 104, 36, fact, onBoard));
        return {
          picture: { box: picture, ground },
          chart: { box: chart, ground, ink: ORANGE },
          words: words(parts, { x: 8, y: 120, width: 208, height: 48 }, ground),
        };
      }
      const picture = { x: 8, y: 34, width: 100, height: 54 },
        chart = { x: 116, y: 34, width: 100, height: 54 };
      canvas.fill({ x: 0, y: 89, width: WIDTH, height: 34 }, board);
      factColumns(canvas, parts.facts, { x: 8, y: 90, width: 106, pitch: 8, label: 32 }, onBoard);
      factColumns(canvas, parts.more, { x: 8, y: 125, width: 106, pitch: 8, label: 32 }, onGround);
      if (parts.choice) choiceLine(canvas, 20, parts.choice, onGround.label);
      return { picture: { box: picture, ground }, chart: { box: chart, ground, ink: onGround.note }, words: null };
    },
  });
})();

/**
 * DATA: the picture as large as the card allows over a board of cells, each a fact, its label and unit in the small
 * print over its value, the cells told apart by two shades; its faces turn, the facts, then the more facts, then the
 * words, each named on the tabs under the title.
 */
const DATA: CardStyle = (() => {
  const ground = rgb(1, 2, 4),
    shades = [rgb(3, 5, 10), rgb(2, 3, 7)] as const,
    label = rgb(30, 20, 4),
    note = rgb(13, 16, 22),
    dim = rgb(9, 11, 15);
  const CELL = Object.freeze({ width: 56, height: 16, columns: 4, top: 136 });
  const cells = (canvas: PageCanvas, facts: readonly PageFact[]) => {
    for (let i = 0; i < 2 * CELL.columns; i++) {
      const [column, row] = [i % CELL.columns, Math.floor(i / CELL.columns)],
        x = column * CELL.width,
        y = CELL.top + row * CELL.height;
      canvas.fill({ x, y, width: CELL.width, height: CELL.height }, shades[(column + row) % 2]!);
      const fact = facts[i];
      if (!fact) continue;
      canvas.small(
        x + 2,
        y + 1,
        `${fact.label}${fact.unit ? ` ${fact.unit.toUpperCase()}` : ''}`,
        fact.ink === undefined ? label : canvas.mainColor(fact.ink),
      );
      const room = CELL.width - 4;
      if (normalWidth(fact.value) > room) canvas.small(x + 2, y + 9, fact.value.toUpperCase(), WHITE);
      else {
        canvas.ink(x + 2, y + 8, fact.value, WHITE);
        if (fact.note && normalWidth(fact.value) + 2 + smallWidth(fact.note) <= room)
          canvas.small(x + 2 + normalWidth(fact.value) + 2, y + 9, fact.note, note);
      }
    }
  };
  // The faces a page of `parts` has, by name: the facts, the more facts where it has any, and the words where it has.
  const facesOf = (parts: PageParts) => [
    parts.factsName,
    ...(parts.more.length > 0 ? [parts.moreName] : []),
    ...(parts.words ? ['ABOUT'] : []),
  ];
  return Object.freeze({
    id: 'data',
    name: 'DATA',
    plain(canvas: PageCanvas): OrnateStyle {
      full(ground, canvas);
      for (let column = 0; column < CELL.columns; column++)
        canvas.fill({ x: column * CELL.width, y: 152, width: CELL.width, height: CELL.height }, shades[column % 2]!);
      return 'SUNSET';
    },
    faces: (parts: PageParts) => facesOf(parts).length,
    page(canvas: PageCanvas, parts: PageParts, face: number): PageLayout {
      full(ground, canvas);
      canvas.title(8, 4, PAGE_LIMITS.titleColumns, parts.title);
      canvas.small(8, 22, parts.tag, YELLOW);
      // The tabs, ranged right: the shown face's name WHITE, the others dim.
      const names = facesOf(parts),
        shown = names[face]!;
      let x = 216;
      for (const name of [...names].reverse()) {
        x -= smallWidth(name);
        if (x >= 8 + smallWidth(parts.tag) + 8) canvas.small(x, 22, name, name === shown ? WHITE : dim);
        x -= 8;
      }
      cells(canvas, shown === parts.moreName ? parts.more : parts.facts);
      const strip = { box: { x: 8, y: 110, width: 208, height: 22 }, ground, ink: note };
      if (shown === 'ABOUT')
        return {
          picture: null,
          chart: parts.chart === 'strip' ? strip : null,
          words: words(parts, { x: 8, y: 32, width: 208, height: parts.chart === 'strip' ? 72 : 96 }, ground),
        };
      if (parts.chart === 'strip')
        return { picture: { box: { x: 8, y: 30, width: 208, height: 76 }, ground }, chart: strip, words: null };
      if (parts.choice) choiceLine(canvas, 15, parts.choice, label);
      return {
        picture: { box: { x: 8, y: 30, width: 100, height: 86 }, ground },
        chart: { box: { x: 112, y: 30, width: 104, height: 86 }, ground, ink: note },
        words: null,
      };
    },
  });
})();

/** The card styles to choose among while the cards' design is tried (K, 2026-11-12), the first the default. */
export const CARD_STYLES: readonly CardStyle[] = Object.freeze([PROGRAM, PIT_BOARD, DATA]);
