import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { MenuCommand } from '../input/menu-input.js';
import { lineThinningRanks, newLineCount } from '../view/line-thinning.js';
import { drawPlaneRow, fixedPoint, type PlaneRow } from '../view/scaled-plane.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import { CARD, type CardFaces } from './card-face.js';
import { SCREEN_BACKGROUND, writeCentred } from './menu.js';
import type { MenuResponse, Screen } from './screen-host.js';

/** Fixed steps (60 a second) each motion takes (K, 2026-11-09: the demo K saw, "for now"). */
export const CARD_STEPS = Object.freeze({ slide: 10, shake: 12, thin: 16, zoom: 24, hold: 30, rest: 30 });
/** SELECT SERIES shows the series pictures at this scale: the focus picture the size of a card. */
export const SERIES_SCALE = 0.7;
/** The series pictures' pitch on the scaled plane: a picture and a clear tile, 41 tiles. */
const SERIES_PITCH = 41 * 8;
/** The fixed point the series plane scales about: the focus picture covers a card at 0.7 and the frame at 1. */
export const ZOOM_CENTRE = Object.freeze({
  x: fixedPoint(CARD.x, SERIES_SCALE),
  y: fixedPoint(CARD.y, SERIES_SCALE),
});
/** The shake's reach: this share of the row's pitch. */
const SHAKE = 0.06;
/** TITLE's PRESS START row, and its blink: shown this many fixed steps, then hidden as many as the second. */
const PRESS_START_ROW = 28;
const BLINK = Object.freeze({ on: 32, off: 16 });
/** The title logo's top, standing for the main picture until it is made. */
const LOGO_Y = 16;

/** A card of a row: its face, and what UP/DOWN and CONFIRM do on it. */
export interface Card {
  readonly name: string;
  /** The one line under the name, read as the card is drawn. */
  line?(): string;
  /** SELECT SERIES' card: the series' picture, drawn on the scaled plane. */
  readonly picture?: TilePicture;
  /** It offers nothing: dimmed, and CONFIRM denies. */
  readonly dim?: boolean;
  /** CONFIRM denies, the card shown as it is: a series without a document yet. */
  readonly deny?: boolean;
  /** UP (+1) or DOWN (-1) changes the card's value; whether it changed. */
  change?(by: -1 | 1): boolean;
  /** CONFIRM's action and what it did. */
  confirm?(): MenuResponse;
  /** The card came to rest in focus; the returned function is called when focus or the row leaves it. */
  focus?(): () => void;
}

/** A row of cards, TITLE's PRESS START or SELECT SERIES' pictures, standing in the main world or a series' world. */
export interface CardRow {
  readonly kind: 'title' | 'cards' | 'series';
  /** The series' picture of the world the row stands in; null for the main world. */
  readonly world: TilePicture | null;
  readonly cards: readonly Card[];
  /** The card in focus when the row is shown. */
  readonly initial: number;
  /** BACK's action and what it did; absent does nothing. */
  back?(): MenuResponse | null;
  /** The row has rested on the card `index` for `CARD_STEPS.rest`. */
  rested?(index: number): void;
  /** LEFT or RIGHT has moved the focus away. */
  moved?(): void;
}

/** What the main world shows: the attract demo behind the main picture (until it is made, the title logo). */
export interface MainWorld {
  /** Draw the demo into the frame, its lines into `lines` when given; false leaves the frame black. */
  draw(frame: SoftwareSurface, lines: TextLayer | null): boolean;
  tick(): void;
  enter(): void;
  leave(): void;
  readonly logo: TilePicture;
}

/** How a row is reached: line thinning, the zoom into or out of a series, or at once. */
export type RowChange = 'thin' | 'zoom-in' | 'zoom-out' | 'cut';

type View = { readonly row: CardRow; index: number } | null;
type Motion =
  | { readonly kind: 'slide' | 'shake'; readonly direction: -1 | 1; steps: number }
  | { readonly kind: 'thin'; readonly from: View; steps: number }
  | { readonly kind: 'zoom'; readonly row: CardRow; readonly index: number; readonly to: number; steps: number }
  | { readonly kind: 'hold'; steps: number }
  | { readonly kind: 'set'; readonly world: TilePicture | null; readonly view: View };

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const duration = (motion: Motion) =>
  motion.kind === 'slide'
    ? CARD_STEPS.slide
    : motion.kind === 'shake'
      ? CARD_STEPS.shake
      : motion.kind === 'thin'
        ? CARD_STEPS.thin
        : motion.kind === 'zoom'
          ? CARD_STEPS.zoom
          : motion.kind === 'hold'
            ? CARD_STEPS.hold
            : 0;

/**
 * The selection's one screen ([Browser](../../docs/browser.md#card-rows)): every row of cards, from TITLE to SELECT
 * VEHICLE, in its world. LEFT and RIGHT choose a card, a row of three or more wrapping and one of one or two shaking at
 * its ends; UP and DOWN change the focus card's value; CONFIRM and BACK do the card's and the row's actions. A row
 * gives way to the next in its world by line thinning, the background transitions' one rule; only entering or leaving
 * a series zooms its picture on the one scaled plane, between 0.7 and 1. While a motion runs, the last command waits
 * and acts when it ends. The main world draws the attract demo, advanced while it shows, behind the title logo.
 */
export function createCardRows(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  faces: CardFaces,
  main: MainWorld,
  initial: CardRow,
) {
  let world: TilePicture | null = initial.world,
    view: View = { row: initial, index: initial.initial },
    motions: Motion[] = [],
    pending: MenuCommand | null = null,
    rest = 0,
    release: (() => void) | null = null,
    focused: Card | null = null,
    blink = 0;
  const scratch = new Uint16Array(frame.pixels.length);
  const settle = () => {
    const card = motions.length === 0 && view ? view.row.cards[view.index] : undefined;
    if (card === focused) return;
    release?.();
    [release, focused] = [card?.focus?.() ?? null, card ?? null];
  };
  const unfocus = () => {
    release?.();
    [release, focused] = [null, null];
  };
  const begin = (...next: Motion[]) => {
    motions.push(...next);
    rest = 0;
    unfocus();
    runSets();
  };
  // Instant changes at the head of the queue apply at once.
  const runSets = () => {
    while (motions[0]?.kind === 'set') {
      const set = motions.shift() as Extract<Motion, { kind: 'set' }>;
      [world, view] = [set.world, set.view];
    }
  };
  const act = (command: MenuCommand): MenuResponse | null => {
    if (!view) return null;
    const { row } = view;
    const card = row.cards[view.index];
    if (row.kind === 'title') return command === 'CONFIRM' ? (card?.confirm?.() ?? null) : null;
    if (command === 'LEFT' || command === 'RIGHT') {
      const direction = command === 'LEFT' ? -1 : 1,
        count = row.cards.length;
      const next = view.index + direction;
      if (count < 3 && (next < 0 || next >= count)) {
        begin({ kind: 'shake', direction, steps: 0 });
        return null;
      }
      view.index = (next + count) % count;
      row.moved?.();
      begin({ kind: 'slide', direction, steps: 0 });
      return row.kind === 'series' ? 'slide' : 'move';
    }
    if (command === 'UP' || command === 'DOWN') return card?.change?.(command === 'UP' ? 1 : -1) ? 'move' : null;
    if (command === 'CONFIRM') {
      if (!card) return null;
      if (card.dim || card.deny) return 'deny';
      return card.confirm?.() ?? null;
    }
    if (command === 'BACK') return row.back?.() ?? null;
    return null;
  };

  // The world behind the rows: the attract demo and the main picture, or the series' picture.
  const drawWorld = (target: SoftwareSurface, at: TilePicture | null, lines: boolean) => {
    if (at) return at.draw(target, 0, 0);
    text.clear();
    if (!main.draw(target, lines ? text : null)) target.clear(SCREEN_BACKGROUND);
    main.logo.draw(target, Math.floor((target.width - main.logo.width) / 2), LOGO_Y);
    if (lines) text.draw(target);
  };
  const planeRow = (row: CardRow): PlaneRow => ({
    pictures: row.cards.map((card) => card.picture!),
    pitch: SERIES_PITCH,
    wrap: row.cards.length >= 3,
    dim: (index) => row.cards[index]!.dim === true,
  });
  // The shift of the row in whole pixels from a slide or shake under way.
  const shiftOf = (motion: Motion | undefined, pitch: number) => {
    if (motion?.kind === 'slide')
      return Math.round(motion.direction * pitch * (1 - easeOut(motion.steps / CARD_STEPS.slide)));
    if (motion?.kind === 'shake')
      return Math.round(-motion.direction * SHAKE * pitch * Math.sin((Math.PI * motion.steps) / CARD_STEPS.shake));
    return 0;
  };
  // A row over its world, as it stands or slides.
  const drawRow = (target: SoftwareSurface, shown: View, motion: Motion | undefined) => {
    if (!shown) return;
    const { row, index } = shown;
    if (row.kind === 'title') {
      text.clear();
      if (blink % (BLINK.on + BLINK.off) < BLINK.on)
        writeCentred(text, PRESS_START_ROW, 'PRESS START', TEXT_PALETTES.YELLOW);
      return text.draw(target);
    }
    if (row.kind === 'series')
      return drawPlaneRow(
        target,
        planeRow(row),
        index,
        SERIES_SCALE,
        ZOOM_CENTRE,
        shiftOf(motion, SERIES_PITCH * SERIES_SCALE),
      );
    const shift = shiftOf(motion, CARD.pitch),
      count = row.cards.length;
    for (let offset = -2; offset <= 2; offset++) {
      let at = index + offset;
      if (count >= 3) at = ((at % count) + count) % count;
      else if (at < 0 || at >= count) continue;
      if (count >= 3 && Math.abs(offset) > (count - 1) / 2 + 1) continue;
      const card = row.cards[at]!;
      faces.draw(
        target,
        { name: card.name, line: card.line?.() ?? '', dim: card.dim === true },
        CARD.x + offset * CARD.pitch + shift,
        CARD.y,
      );
    }
  };

  const screen: Screen & {
    go(row: CardRow, change: RowChange): void;
    enter(row: CardRow): void;
    readonly row: CardRow | null;
    readonly index: number;
    readonly resting: boolean;
  } = {
    live: false,
    get wallpaper() {
      return motions.length === 0 ? world : null;
    },
    get row() {
      return view?.row ?? null;
    },
    get index() {
      return view?.index ?? 0;
    },
    /** Whether no motion runs. */
    get resting() {
      return motions.length === 0;
    },
    command(command: MenuCommand): MenuResponse | null {
      if (motions.length > 0) {
        pending = command;
        return null;
      }
      return act(command);
    },
    tick(): MenuResponse | null {
      blink++;
      const motion = motions[0];
      // The main world's demo runs while it shows.
      if (world === null || motion?.kind === 'zoom') main.tick();
      if (motion) {
        if (++(motion as { steps: number }).steps >= duration(motion)) {
          motions.shift();
          runSets();
        }
        if (motions.length > 0) return null;
        // The motion has ended: the card in focus settles, and the command held over it acts.
        settle();
        const command = pending;
        pending = null;
        return command ? act(command) : null;
      }
      settle();
      if (view && ++rest === CARD_STEPS.rest) view.row.rested?.(view.index);
      return null;
    },
    render() {
      const motion = motions[0];
      if (motion?.kind === 'zoom') {
        drawWorld(frame, null, false);
        const t = easeInOut(motion.steps / CARD_STEPS.zoom),
          scale = motion.to === 1 ? SERIES_SCALE + (1 - SERIES_SCALE) * t : 1 - (1 - SERIES_SCALE) * t;
        drawPlaneRow(frame, planeRow(motion.row), motion.index, scale, ZOOM_CENTRE, 0);
      } else if (motion?.kind === 'thin') {
        const title = (shown: View) => shown?.row.kind === 'title';
        drawWorld(frame, world, title(motion.from));
        drawRow(frame, motion.from, undefined);
        scratch.set(frame.pixels);
        drawWorld(frame, world, title(view));
        drawRow(frame, view, undefined);
        const ranks = lineThinningRanks(frame.height),
          shown = newLineCount(frame.height, motion.steps / CARD_STEPS.thin);
        for (let y = 0; y < frame.height; y++)
          if (ranks[y]! >= shown)
            frame.pixels.set(scratch.subarray(y * frame.width, (y + 1) * frame.width), y * frame.width);
      } else {
        drawWorld(frame, world, view?.row.kind === 'title');
        drawRow(frame, view, motion);
      }
      present();
    },
    leave() {
      unfocus();
      main.leave();
    },
    /** Show `row` at once, as the selection is entered from outside: from a run, or the page's start. */
    enter(row: CardRow) {
      [world, view, motions, pending, rest] = [row.world, { row, index: row.initial }, [], null, 0];
      unfocus();
      main.enter();
    },
    /** Go on to `row`: by line thinning within a world, by the zoom into or out of a series, or at once. */
    go(row: CardRow, change: RowChange) {
      const next: View = { row, index: row.initial };
      if (change === 'cut') return begin({ kind: 'set', world: row.world, view: next });
      if (change === 'thin')
        return begin({ kind: 'set', world: row.world, view: next }, { kind: 'thin', from: view, steps: 0 });
      if (change === 'zoom-in')
        return begin(
          { kind: 'zoom', row: view!.row, index: view!.index, to: 1, steps: 0 },
          { kind: 'set', world: row.world, view: null },
          { kind: 'hold', steps: 0 },
          { kind: 'set', world: row.world, view: next },
          { kind: 'thin', from: null, steps: 0 },
        );
      // Out of a series: the row thins away to its picture, which shrinks back into SELECT SERIES.
      return begin(
        { kind: 'set', world, view: null },
        { kind: 'thin', from: view, steps: 0 },
        { kind: 'zoom', row, index: row.initial, to: SERIES_SCALE, steps: 0 },
        { kind: 'set', world: null, view: next },
      );
    },
  };
  return screen;
}
export type CardRows = ReturnType<typeof createCardRows>;
