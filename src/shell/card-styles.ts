import { ornatePalette, TEXT_MARKS, TEXT_PALETTES, TEXT_TILE_SIZE, type OrnateStyle } from '../image/text-tiles.js';
import {
  CARD,
  wrappedLines,
  type PageCanvas,
  type PageWords,
  type PixelBox,
  type PlainCardStyle,
} from './card-face.js';
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
  /** Whether its value is one of the page's main values, which SHEET writes in the normal font. */
  readonly main?: boolean;
}

/** A table of front and rear values: its columns' heads, and rows each of a label, two values and their unit. */
export interface PageTable {
  readonly heads: readonly [string, string];
  readonly rows: readonly {
    readonly label: string;
    readonly values: readonly [string, string];
    readonly unit: string;
  }[];
}

/**
 * What a page says in SHEET (K, 2026-11-20: no decoration, as much as the card holds), on one face, each part in the
 * order of what matters most: `line`, facts along the line under the title; `beside`, facts in a column beside the
 * picture; `table`, front and rear values or none; and `rest`, the other facts. A page has its title, choice, picture,
 * chart and words as in every style.
 */
export interface PageSheet {
  readonly line: readonly PageFact[];
  readonly beside: readonly PageFact[];
  readonly table: PageTable | null;
  readonly rest: readonly PageFact[];
}

/**
 * What a page card says, whatever its style (K, 2026-11-12: a card is packed with what it is about, and a course's or a
 * vehicle's card is the same card wherever it appears): its title and a tag under it; up to eight facts under
 * `factsName`, up to eight more under `moreName`; a line of its own for a choice (a vehicle's color, between marks when
 * UP and DOWN change it); a picture; a chart, a low strip or a block beside the picture, under `chartName`; and words.
 * A page without a chart (a class's) has the picture across the card over its facts, a row each, and neither more facts,
 * a choice nor words.
 */
export interface PageParts {
  readonly title: string;
  readonly tag: string;
  readonly factsName: string;
  readonly facts: readonly PageFact[];
  readonly moreName: string;
  readonly more: readonly PageFact[];
  readonly choice: { readonly label: string; readonly value: string; readonly changes: boolean } | null;
  readonly chart: 'strip' | 'block' | null;
  readonly chartName: string;
  readonly words: { readonly heading: string | null; readonly description: string } | null;
  /** What SHEET writes in place of the tag and the facts. */
  readonly sheet: PageSheet;
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

/**
 * What a page holds at most, which every style lays out; a fact in a row across the card, on a page without a chart,
 * holds its value and note together in `rowCharacters`, which the row's 168 pixels beyond its label take in the small
 * print.
 */
export const PAGE_LIMITS = Object.freeze({ facts: 8, more: 8, titleColumns: CARD.columns - 2, rowCharacters: 40 });
/** A row's label: this many pixels before its value. */
const ROW_LABEL = 40;

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

/** Facts in rows across the card from `y`, a row every 8 pixels, each `ROW_LABEL` pixels to its value. */
function factRows(
  canvas: PageCanvas,
  facts: readonly PageFact[],
  y: number,
  inks: { label: number; value: number; note: number; legend: boolean },
) {
  facts.forEach((fact, i) => inlineFact(canvas, 8, y + i * 8, WIDTH - 16, ROW_LABEL, fact, inks));
}

/**
 * The choice's line on text row `row`: its label in the small print from `x`, and its value YELLOW from the second tile
 * after it, between marks if it changes;
 * the value in the normal font when the line then ends a tile inside the card, else in the small print (K, 2026-11-19).
 */
function choiceLine(canvas: PageCanvas, row: number, choice: NonNullable<PageParts['choice']>, label: number, x = 8) {
  canvas.small(x, row * TEXT_TILE_SIZE, choice.label, label);
  const column = Math.ceil((x + smallWidth(choice.label)) / TEXT_TILE_SIZE) + 1;
  const start = column + (choice.changes ? 2 : 0);
  // The columns the value takes in the normal font, and the last column the line uses with it.
  const normal = choice.value.length;
  const fits = start + normal - 1 + (choice.changes ? 2 : 0) <= CARD.columns - 2;
  const columns = fits ? normal : Math.ceil(smallWidth(choice.value) / TEXT_TILE_SIZE);
  if (fits) canvas.write(start, row, choice.value, TEXT_PALETTES.YELLOW);
  else canvas.small(start * TEXT_TILE_SIZE, row * TEXT_TILE_SIZE, choice.value, YELLOW);
  if (!choice.changes) return;
  canvas.write(column, row, TEXT_MARKS.up);
  canvas.write(start + columns + 1, row, TEXT_MARKS.down);
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
      if (parts.chart === null) {
        const picture = { x: 8, y: 30, width: 208, height: 62 };
        canvas.fill(picture, field);
        factRows(canvas, parts.facts, 96, inks);
        return { picture: { box: picture, ground: field }, chart: null, words: null };
      }
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
      if (parts.chart === null) {
        canvas.fill({ x: 0, y: 98, width: WIDTH, height: 62 }, board);
        factRows(canvas, parts.facts, 101, onBoard);
        return { picture: { box: { x: 8, y: 36, width: 208, height: 58 }, ground }, chart: null, words: null };
      }
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
 * print over its value, the cells told apart by two shades (on a page without a chart, rows across the card); its faces
 * turn, the facts, then the more facts, then the words, each named on the tabs under the title.
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
      if (parts.chart === null) {
        // The facts in rows across the card, told apart by the two shades.
        parts.facts.forEach((_, i) => canvas.fill({ x: 0, y: 94 + i * 8, width: WIDTH, height: 8 }, shades[i % 2]!));
        factRows(canvas, parts.facts, 94, { label, value: WHITE, note, legend: true });
        return { picture: { box: { x: 8, y: 30, width: 208, height: 60 }, ground }, chart: null, words: null };
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

/**
 * SHEET (K, 2026-11-20: no decorated part, as much on the card as it holds): one ground and nothing drawn on it but
 * text, the picture and the chart, everything on one face. Parts are told apart by where they stand and their colors
 * alone: labels dim, values WHITE and the title SUNSET in the small ornate font. The page's main values are in the
 * normal font and everything else in the small print. A value too long for its room goes on in the rows under it,
 * broken at spaces; a part's facts that the rows it has cannot hold are left out from its last.
 */
const SHEET: CardStyle = (() => {
  /** A unit after its value: after a space, but a percent sign at once. */
  const unitOf = (unit: string | undefined) => (!unit ? '' : unit === '%' ? unit : ` ${unit}`);
  const ground = rgb(1, 2, 4),
    dim = rgb(13, 16, 22),
    MARGIN = 4,
    ROW = TEXT_TILE_SIZE,
    INNER = WIDTH - 2 * MARGIN;
  /** Words of `color` to be set in lines. */
  type Run = { readonly text: string; readonly color: number };
  /**
   * `runs` set in the small print from (`x`, `y`) in lines of `width` pixels, a line a row, breaking at spaces; how many
   * rows they take, at most `rows`, or 0 when they need more.
   */
  const setRuns = (
    canvas: PageCanvas | null,
    runs: readonly Run[],
    x: number,
    y: number,
    width: number,
    rows: number,
  ) => {
    const columns = Math.floor(width / SMALL_PRINT.width);
    // Each word with its color, then the lines as the words fill them.
    const words = runs.flatMap((run) =>
      wrappedLines(run.text, columns).flatMap((line) => line.split(' ').map((word) => ({ word, color: run.color }))),
    );
    const lines: (typeof words)[] = [[]];
    let used = 0;
    for (const word of words) {
      const length = word.word.length;
      if (used > 0 && used + 1 + length > columns) {
        lines.push([]);
        used = 0;
      }
      lines.at(-1)!.push(word);
      used += (used > 0 ? 1 : 0) + length;
    }
    if (lines.length > rows) return 0;
    if (canvas)
      lines.forEach((line, row) => {
        let at = x;
        for (const { word, color } of line) {
          canvas.small(at, y + row * ROW, word, color);
          at += (word.length + 1) * SMALL_PRINT.width;
        }
      });
    return lines.length;
  };
  /**
   * A fact from (`x`, `y`) in `width` pixels, its label in the first `label`: its value in the normal font where it is
   * main and fits with its unit and note, else all in the small print; how many rows it takes, or 0 when it needs more
   * than `rows`.
   */
  const fact = (
    canvas: PageCanvas | null,
    item: PageFact,
    x: number,
    y: number,
    width: number,
    label: number,
    rows: number,
  ) => {
    const room = width - label,
      unit = unitOf(item.unit),
      after = `${unit}${item.note ? ` ${item.note}` : ''}`.trimStart();
    if (rows < 1) return 0;
    if (item.main && normalWidth(item.value) + (after ? 2 + smallWidth(after) : 0) <= room) {
      if (canvas) {
        canvas.small(x, y, item.label, item.ink === undefined ? dim : canvas.mainColor(item.ink));
        canvas.ink(x + label, y, item.value, WHITE);
        if (unit) canvas.small(x + label + normalWidth(item.value) + 2, y, unit.trimStart(), WHITE);
        if (item.note) canvas.small(x + label + normalWidth(item.value) + 2 + smallWidth(unit), y, item.note, dim);
      }
      return 1;
    }
    const runs = [
      { text: `${item.value}${unit}`.toUpperCase(), color: WHITE },
      ...(item.note ? [{ text: item.note, color: dim }] : []),
    ];
    const taken = setRuns(null, runs, x + label, y, room, rows);
    if (taken === 0 || !canvas) return taken;
    canvas.small(x, y, item.label, item.ink === undefined ? dim : canvas.mainColor(item.ink));
    return setRuns(canvas, runs, x + label, y, room, rows);
  };
  /** `facts` in a column from (`x`, `y`) of `rows` rows, as many as it holds from the first. */
  const column = (
    canvas: PageCanvas,
    facts: readonly PageFact[],
    x: number,
    y: number,
    width: number,
    label: number,
    rows: number,
  ) => {
    let row = 0;
    for (const item of facts) {
      const taken = fact(null, item, x, y + row * ROW, width, label, rows - row);
      if (taken === 0) return;
      fact(canvas, item, x, y + row * ROW, width, label, rows - row);
      row += taken;
    }
  };
  /** `facts` along row `y`, each its label and value, as many as the row holds from the first. */
  const line = (canvas: PageCanvas, facts: readonly PageFact[], y: number) => {
    let x = MARGIN;
    for (const item of facts) {
      const value = `${item.value}${unitOf(item.unit)}`.toUpperCase(),
        width = smallWidth(`${item.label} ${value}`);
      if (x + width > MARGIN + INNER) return;
      canvas.small(x, y, item.label, dim);
      canvas.small(x + smallWidth(`${item.label} `), y, value, WHITE);
      x += width + 3 * SMALL_PRINT.width;
    }
  };
  /** A table from (`x`, `y`): its heads over its two columns, `at` and `at` + `pitch` pixels in, then a row each. */
  const table = (
    canvas: PageCanvas,
    parts: PageTable,
    x: number,
    y: number,
    at: number,
    pitch: number,
    rows: number,
  ) => {
    canvas.small(x + at, y, parts.heads[0], dim);
    canvas.small(x + at + pitch, y, parts.heads[1], dim);
    parts.rows.slice(0, rows - 1).forEach((item, i) => {
      const top = y + (i + 1) * ROW;
      canvas.small(x, top, item.label, dim);
      canvas.small(x + at, top, item.values[0], WHITE);
      canvas.small(x + at + pitch, top, `${item.values[1]}${unitOf(item.unit)}`, WHITE);
    });
  };
  /** The title on the top row: in the small ornate font where it fits, else in the small print in its color. */
  const title = (canvas: PageCanvas, text: string) => {
    if (normalWidth(text) <= INNER) canvas.ornate(MARGIN, 0, text, 'SUNSET');
    else canvas.small(MARGIN, 0, text, canvas.mainColor(ornatePalette('ornateSmall', 'SUNSET')));
  };
  return Object.freeze({
    id: 'sheet',
    name: 'SHEET',
    plain(canvas: PageCanvas): OrnateStyle {
      full(ground, canvas);
      return 'SUNSET';
    },
    faces: () => 1,
    page(canvas: PageCanvas, parts: PageParts): PageLayout {
      const { sheet } = parts;
      full(ground, canvas);
      title(canvas, parts.title);
      line(canvas, sheet.line, ROW);
      const half = INNER / 2;
      if (parts.chart === 'block') {
        // The facts beside the picture and the chart, stacked on the right; under them the table and the rest.
        column(canvas, sheet.beside, MARGIN, 2 * ROW, half, 32, 9);
        if (sheet.table) table(canvas, sheet.table, MARGIN, 11 * ROW, 36, 28, 9);
        column(canvas, sheet.rest, MARGIN + half, 11 * ROW, half, 40, 9);
        if (parts.choice) choiceLine(canvas, 20, parts.choice, dim, MARGIN);
        return {
          picture: { box: { x: MARGIN + half + 4, y: 2 * ROW, width: half - 4, height: 36 }, ground },
          chart: { box: { x: MARGIN + half + 4, y: 2 * ROW + 36, width: half - 4, height: 36 }, ground, ink: dim },
          words: null,
        };
      }
      if (parts.chart === 'strip') {
        // The map on the left with the facts beside it, the profile across the card, the rest and then the words.
        column(canvas, sheet.beside, 104, ROW, MARGIN + INNER - 104, 36, 11);
        column(
          canvas,
          sheet.rest.filter((_, i) => i % 2 === 0),
          MARGIN,
          15 * ROW,
          half - 4,
          32,
          2,
        );
        column(
          canvas,
          sheet.rest.filter((_, i) => i % 2 === 1),
          MARGIN + half,
          15 * ROW,
          half,
          32,
          2,
        );
        return {
          picture: { box: { x: MARGIN, y: ROW, width: 96, height: 11 * ROW }, ground },
          chart: { box: { x: MARGIN, y: 12 * ROW, width: INNER, height: 3 * ROW - 2 }, ground, ink: dim },
          words: parts.words && {
            ...words(parts, { x: MARGIN, y: 17 * ROW, width: INNER, height: 4 * ROW }, ground)!,
            font: 'small',
          },
        };
      }
      // The picture across the card, the facts under it.
      column(canvas, sheet.rest, MARGIN, 9 * ROW, INNER, 40, 12);
      return {
        picture: { box: { x: MARGIN, y: 2 * ROW, width: INNER, height: 7 * ROW }, ground },
        chart: null,
        words: null,
      };
    },
  });
})();

/**
 * The card styles to choose among while the cards' design is tried (K, 2026-11-12), the first the default: SHEET first
 * (K, 2026-11-20).
 */
export const CARD_STYLES: readonly CardStyle[] = Object.freeze([SHEET, PROGRAM, PIT_BOARD, DATA]);
