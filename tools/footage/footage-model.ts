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
export const FOOTAGE_MODEL_FORMAT = Object.freeze({ format: 'superoutride.footage-model', version: 2 } as const);

/**
 * The roles a person gives the ground's colors. A color may hold several (the same white for lines and a rumble
 * strip's stripes); features read a color by the roles it holds.
 */
export const COLOR_ROLES = ['road', 'line', 'rumble', 'verge', 'ground', 'median', 'shadow'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

/** The timing events: GO, each checkpoint and the goal. */
export const TIMING_KINDS = ['go', 'checkpoint', 'goal'] as const;
export type TimingKind = (typeof TIMING_KINDS)[number];

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
      readonly kind: TimingKind;
      readonly ink: readonly number[];
    })[];
  };
  readonly masks: readonly (Rectangle & { readonly kind: 'hud' | 'player' })[];
  readonly colors: readonly { readonly rgb555: number; readonly roles: readonly ColorRole[] }[];
  /** The gauge: the vehicle whose drawing is as wide as its real overall width `B`, m, and where that width is from. */
  readonly gauge: { readonly vehicle: string; readonly width: number; readonly reference: string };
}

/** A measured value and its standard error. */
export interface Measured {
  readonly value: number;
  readonly error: number;
}

/** The original's camera as calibration measures it ([Footage model](../../docs/footage.md#footage-model)). */
export interface FootageCamera {
  readonly focalLength: Measured;
  readonly height: Measured;
  readonly centerX: Measured;
  readonly horizonRow: Measured;
  readonly playerDistance: Measured;
}

/** How the camera pitches ([Pitch and grade](../../docs/footage.md#inconsistencies-of-the-original)). */
export const PITCH_RULES = ['level', 'road'] as const;
export type PitchRule = (typeof PITCH_RULES)[number];

/** A background layer's rules ([Background rules](../../docs/footage.md#background-rules)). */
export const VERTICAL_BACKGROUND_RULES = ['pitch', 'fixed', 'road-horizon', 'free'] as const;
export const HORIZONTAL_BACKGROUND_RULES = ['heading', 'curvature', 'free'] as const;

/**
 * One direction's rule: its factor (`b` for `pitch`, `a` for `heading`, the curvature factor for `curvature`; null for
 * a rule without one) and the residual of the motion it explains, in game pixels.
 */
export interface BackgroundRule<Rule extends string> {
  readonly rule: Rule;
  readonly factor: Measured | null;
  readonly residual: number;
}

/** A background layer: its rows, from `top` to `bottom` exclusive, and its rules down and across. */
export interface BackgroundLayer {
  readonly top: number;
  readonly bottom: number;
  readonly vertical: BackgroundRule<(typeof VERTICAL_BACKGROUND_RULES)[number]>;
  readonly horizontal: BackgroundRule<(typeof HORIZONTAL_BACKGROUND_RULES)[number]>;
}

/** A footage model: the draft and, once calibration has measured them, the camera and the rules the original draws by. */
export interface FootageModel extends FootageModelDraft {
  readonly format: typeof FOOTAGE_MODEL_FORMAT.format;
  readonly version: typeof FOOTAGE_MODEL_FORMAT.version;
  /** The camera, null until calibrated. */
  readonly camera: FootageCamera | null;
  /** The pitch rule and the background's layers, null until the initial estimate judges them. */
  readonly pitch: PitchRule | null;
  readonly background: readonly BackgroundLayer[] | null;
}

const CAMERA_FIELDS = [
  'focalLength',
  'height',
  'centerX',
  'horizonRow',
  'playerDistance',
] as const satisfies readonly (keyof FootageCamera)[];

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
  const record = readRecord(value, '', [
    'format',
    'version',
    'game',
    'frame',
    'hud',
    'masks',
    'colors',
    'gauge',
    'camera',
    'pitch',
    'background',
  ]);
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
          kind: readEnum(e.kind, TIMING_KINDS, `${path}/kind`),
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
    gauge: (() => {
      const g = readRecord(record.gauge, '/gauge', ['vehicle', 'width', 'reference']);
      return {
        vehicle: readString(g.vehicle, '/gauge/vehicle'),
        width: readNumber(g.width, '/gauge/width', { min: 0, exclusiveMin: true }),
        reference: readString(g.reference, '/gauge/reference'),
      };
    })(),
    camera:
      record.camera === null
        ? null
        : (() => {
            const c = readRecord(record.camera, '/camera', CAMERA_FIELDS);
            return Object.fromEntries(
              CAMERA_FIELDS.map((field) => [field, measured(c[field], `/camera/${field}`)]),
            ) as unknown as FootageCamera;
          })(),
    pitch: record.pitch === null ? null : readEnum(record.pitch, PITCH_RULES, '/pitch'),
    background:
      record.background === null
        ? null
        : readArray(record.background, '/background', (layer, path) => {
            const l = readRecord(layer, path, ['top', 'bottom', 'vertical', 'horizontal']);
            const top = readNumber(l.top, `${path}/top`, { min: 0, integer: true });
            const bottom = readNumber(l.bottom, `${path}/bottom`, { min: top + 1, max: frame.height, integer: true });
            return {
              top,
              bottom,
              vertical: backgroundRule(l.vertical, `${path}/vertical`, VERTICAL_BACKGROUND_RULES, ['pitch']),
              horizontal: backgroundRule(l.horizontal, `${path}/horizontal`, HORIZONTAL_BACKGROUND_RULES, [
                'heading',
                'curvature',
              ]),
            };
          }),
  });
}

/** A measured value: its `value` and standard `error`. */
function measured(value: unknown, path: string): Measured {
  const m = readRecord(value, path, ['value', 'error']);
  return { value: readNumber(m.value, `${path}/value`), error: readNumber(m.error, `${path}/error`, { min: 0 }) };
}

/** A direction's rule: a factor exactly for the rules that have one. */
function backgroundRule<Rule extends string>(
  value: unknown,
  path: string,
  rules: readonly Rule[],
  factored: readonly Rule[],
): BackgroundRule<Rule> {
  const r = readRecord(value, path, ['rule', 'factor', 'residual']);
  const rule = readEnum(r.rule, rules, `${path}/rule`);
  const hasFactor = factored.includes(rule);
  requireAdmission(
    (r.factor !== null) === hasFactor,
    'invalid_domain',
    `${path}/factor`,
    hasFactor ? `The ${rule} rule has a factor` : `The ${rule} rule has no factor`,
  );
  return {
    rule,
    factor: hasFactor ? measured(r.factor, `${path}/factor`) : null,
    residual: readNumber(r.residual, `${path}/residual`, { min: 0 }),
  };
}

export async function loadFootageModel(file: string): Promise<FootageModel> {
  return readFootageModel(JSON.parse(await readFile(file, 'utf8')));
}
