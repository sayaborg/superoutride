import { readFile } from 'node:fs/promises';
import {
  readArray,
  readEnum,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  deepFreeze,
} from '../../src/core/admission.js';
import { readRgb555 } from '../../src/image/rgb555.js';

/** The footage model's format ([Footage model](../../docs/footage.md#footage-model)). */
export const FOOTAGE_MODEL_FORMAT = Object.freeze({ format: 'superoutride.footage-model', version: 1 } as const);

/**
 * The roles a person gives the ground's colors. A color may hold several (the same white for lines and a rumble
 * strip's stripes); features read a color by the roles it holds.
 */
export const COLOR_ROLES = ['road', 'line', 'rumble', 'verge', 'ground', 'median', 'shadow'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

/** A rectangle of game pixels. */
export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A HUD readout: `count` glyph cells of `width` × `height` game pixels, the first at (x, y), `advance` apart, its glyphs
 * drawn in the `ink` colors.
 */
export interface Readout extends Rectangle {
  readonly count: number;
  readonly advance: number;
  readonly ink: readonly number[];
}

/** What a person makes by looking at frames: the original, its frame, its HUD, its masks and its colors' roles. */
export interface FootageModelDraft {
  readonly game: { readonly name: string; readonly edition: string; readonly cabinet: string };
  readonly frame: { readonly width: number; readonly height: number };
  readonly hud: {
    readonly speed: Readout;
    readonly clock: Readout | null;
    /** Where each timing event shows, and what kind of event it is. */
    readonly events: readonly (Rectangle & {
      readonly name: string;
      readonly kind: 'go' | 'checkpoint' | 'goal';
      readonly ink: readonly number[];
    })[];
  };
  readonly masks: readonly (Rectangle & { readonly kind: 'hud' | 'player' })[];
  readonly colors: readonly { readonly rgb555: number; readonly roles: readonly ColorRole[] }[];
}

/** A footage model: the draft and, once calibration has measured them, the camera and the rules the original draws by. */
export interface FootageModel extends FootageModelDraft {
  readonly format: typeof FOOTAGE_MODEL_FORMAT.format;
  readonly version: typeof FOOTAGE_MODEL_FORMAT.version;
}

const rectangle = (value: unknown, path: string, frame?: { width: number; height: number }): Rectangle => {
  const record = readRecord(value, path, ['x', 'y', 'width', 'height']);
  const x = readNumber(record.x, `${path}/x`, { min: 0, integer: true }),
    y = readNumber(record.y, `${path}/y`, { min: 0, integer: true });
  const width = readNumber(record.width, `${path}/width`, { min: 1, integer: true }),
    height = readNumber(record.height, `${path}/height`, { min: 1, integer: true });
  if (frame)
    requireAdmission(
      x + width <= frame.width && y + height <= frame.height,
      'invalid_domain',
      path,
      'The rectangle lies outside the frame',
    );
  return { x, y, width, height };
};

/** Admit a footage model's JSON. */
export function readFootageModel(value: unknown): FootageModel {
  const record = readRecord(value, '', ['format', 'version', 'game', 'frame', 'hud', 'masks', 'colors']);
  requireAdmission(
    record.format === FOOTAGE_MODEL_FORMAT.format && record.version === FOOTAGE_MODEL_FORMAT.version,
    'unsupported_format',
    '',
    `Expected ${FOOTAGE_MODEL_FORMAT.format} version ${FOOTAGE_MODEL_FORMAT.version}`,
  );
  const game = readRecord(record.game, '/game', ['name', 'edition', 'cabinet']);
  const frameRecord = readRecord(record.frame, '/frame', ['width', 'height']);
  const frame = {
    width: readNumber(frameRecord.width, '/frame/width', { min: 1, integer: true }),
    height: readNumber(frameRecord.height, '/frame/height', { min: 1, integer: true }),
  };
  const readout = (value: unknown, path: string): Readout => {
    const r = readRecord(value, path, ['x', 'y', 'width', 'height', 'count', 'advance', 'ink']);
    return {
      ...rectangle({ x: r.x, y: r.y, width: r.width, height: r.height }, path, frame),
      count: readNumber(r.count, `${path}/count`, { min: 1, integer: true }),
      advance: readNumber(r.advance, `${path}/advance`, { min: 1, integer: true }),
      ink: readArray(r.ink, `${path}/ink`, readRgb555, { min: 1 }),
    };
  };
  const hud = readRecord(record.hud, '/hud', ['speed', 'clock', 'events']);
  return deepFreeze({
    ...FOOTAGE_MODEL_FORMAT,
    game: {
      name: readString(game.name, '/game/name'),
      edition: readString(game.edition, '/game/edition'),
      cabinet: readString(game.cabinet, '/game/cabinet'),
    },
    frame,
    hud: {
      speed: readout(hud.speed, '/hud/speed'),
      clock: hud.clock === null ? null : readout(hud.clock, '/hud/clock'),
      events: readArray(hud.events, '/hud/events', (event, path) => {
        const e = readRecord(event, path, ['name', 'kind', 'x', 'y', 'width', 'height', 'ink']);
        return {
          name: readString(e.name, `${path}/name`),
          kind: readEnum(e.kind, ['go', 'checkpoint', 'goal'] as const, `${path}/kind`),
          ink: readArray(e.ink, `${path}/ink`, readRgb555, { min: 1 }),
          ...rectangle({ x: e.x, y: e.y, width: e.width, height: e.height }, path, frame),
        };
      }),
    },
    masks: readArray(record.masks, '/masks', (mask, path) => {
      const m = readRecord(mask, path, ['kind', 'x', 'y', 'width', 'height']);
      return {
        kind: readEnum(m.kind, ['hud', 'player'] as const, `${path}/kind`),
        ...rectangle({ x: m.x, y: m.y, width: m.width, height: m.height }, path, frame),
      };
    }),
    colors: readArray(record.colors, '/colors', (color, path) => {
      const c = readRecord(color, path, ['rgb555', 'roles']);
      return {
        rgb555: readRgb555(c.rgb555, `${path}/rgb555`),
        roles: readArray(c.roles, `${path}/roles`, (role, rolePath) => readEnum(role, COLOR_ROLES, rolePath), {
          min: 1,
        }),
      };
    }),
  });
}

export async function loadFootageModel(file: string): Promise<FootageModel> {
  return readFootageModel(JSON.parse(await readFile(file, 'utf8')));
}
