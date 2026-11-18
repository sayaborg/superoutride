import {
  readArray,
  readDictionary,
  readDocument,
  readEnum,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
} from '../../src/core/admission.js';
import { SHA256_TEXT } from '../../src/core/content-digest.js';
import { MOST_VEHICLE_COLORS } from '../../src/vehicle/vehicle-sprite-library.js';
import type { Rgb } from './vehicle-picture-recipe.js';

/**
 * A vehicle model recipe: how one vehicle's GLB model becomes its solid and its sprite set. It names the model by its
 * SHA-256 (the model itself is kept outside the repository), how the model's axes and its front wheel place it on the
 * vehicle's base point and how finely its surface is sampled; then how its samples take colors, one of two ways. By
 * roles: the roles its samples and texels take (each a test of a base color, the albedo and gloss its brightness takes,
 * the color it is drawn in and the share of its role's bright texels below which it is drawn in the shade color), and
 * the light and hollows that make that brightness. By paints: which base colors are the paints and the brake lamp,
 * how many bank images it has, and the shared baker's palette quantization of ramps and neutrals. It is
 * production-only data, saved under `content/vehicle-picture-sources/<set>.json`.
 */
export const VEHICLE_MODEL_RECIPE_FORMAT = 'superoutride.vehicle-model-recipe';
export const VEHICLE_MODEL_RECIPE_VERSION = 1;

/** What a role's test reads of a base color (each channel 0–1): its channels, value, saturation, luma and g/r. */
export const COLOR_TERMS = ['r', 'g', 'b', 'value', 'saturation', 'luma', 'g/r'] as const;
export type ColorTerm = (typeof COLOR_TERMS)[number];
const AXES = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
type Axis = (typeof AXES)[number];

/** One clause of a role's test: a term above or below a bound, or the largest channel. */
export type ColorClause =
  | { readonly term: ColorTerm; readonly above: number }
  | { readonly term: ColorTerm; readonly below: number }
  | { readonly largest: 'r' | 'g' | 'b' };

export interface ModelRole {
  readonly name: string;
  /** Every clause holds; an empty test always holds, so the last role takes what no other takes. */
  readonly when: readonly ColorClause[];
  /** The albedo its brightness takes: its base color's channels, or its luma (up to 1) for all three, each `times`. */
  readonly albedo: { readonly of: 'color' | 'luma'; readonly times: number };
  /** The weight of its specular highlight. */
  readonly gloss: number;
  /** The palette entry this role is drawn in. */
  readonly color: string;
  /** A texel of this role darker than this share of its role's bright texels is drawn in the shade color. */
  readonly dark: number;
}

/** What every model recipe has: the model, its place on the base point and its sampling. */
export interface ModelRecipeBase {
  /** The mechanics document whose axles place the model: `content/vehicles/<vehicle>.json`. */
  readonly vehicle: string;
  readonly yawVariants: number;
  readonly model: {
    /** The SHA-256 of the one model this recipe is for, as lowercase hexadecimal. */
    readonly sha256: string;
    /** Which of the model's axes, signed, is the vehicle's right, up and forward. */
    readonly right: Axis;
    readonly up: Axis;
    readonly forward: Axis;
    /**
     * The front axle, which the model places `frontAxle` ahead of the base point: the mean origin of the nodes
     * `frontWheels`, or the point `frontHub` in the model's coordinates; a model gives exactly one.
     */
    readonly frontWheels?: readonly string[];
    readonly frontHub?: readonly [number, number, number];
  };
  /** The distance between neighbouring surface samples, metres. */
  readonly spacing: number;
}

/** A model recipe whose samples take colors by roles, in one bank image. */
export interface ModelRoleRecipe extends ModelRecipeBase {
  /** The palette's entries in slot order from slot 1; slots after them take the entry `rest`. */
  readonly colors: readonly string[];
  readonly rest: string;
  /** The entry shaded texels and the brake lamp (unused, off and on) take. */
  readonly shade: string;
  /** A role's bright texels: this quantile of its texels' brightness over every direction at size 0. */
  readonly bright: number;
  /** The sizes on which a texel with no neighbour of its own color takes its neighbours' most common color. */
  readonly isolatedSizes: readonly number[];
  /**
   * A role kept in sight to a size: a picture up to `toSize` showing it in no texel, while one texel's points are at
   * least `shows` of it, draws its fullest such texel in its color.
   */
  readonly keep: { readonly role: string; readonly toSize: number; readonly shows: number };
  readonly roles: readonly ModelRole[];
  /** The weights of a base color's channels in its luma. */
  readonly luma: readonly [number, number, number];
  /**
   * The light, fixed to the picture (x right, y up, z towards the viewer): with n the unit normal in the picture's axes
   * and `up` half the vehicle's normal's height plus half, a sample's brightness in a channel is
   * `min(1, albedo × (ambient + sky·up + mainWeight·max(0, n·main) + fillWeight·max(0, n·fill)) × hollow + gloss ×
   * max(0, n·h)^shininess)`, h the half-way direction of `main` and the view (0, 0, 1).
   */
  readonly light: {
    readonly main: readonly [number, number, number];
    readonly fill: readonly [number, number, number];
    readonly ambient: number;
    readonly sky: number;
    readonly mainWeight: number;
    readonly fillWeight: number;
    readonly shininess: number;
  };
  /**
   * The hollows' darkening from a picture's depths, held `cells` to a texel a side: for each of `widths` (metres at the
   * base point, the blur's sigma), `hollow` loses `weight × clamp((z − blurred z) / depth, 0, most)`; a blur counts the
   * vehicle alone.
   */
  readonly hollows: {
    readonly cells: number;
    readonly widths: readonly number[];
    readonly depth: number;
    readonly most: number;
    readonly weight: number;
  };
  /**
   * The step lines, on `sizes` alone: a cell of the hollows' cells lying more than `depth` behind the nearest covered
   * cell within `reach` (metres at the base point, half a square's side) is a step cell, and a texel whose role's
   * samples lie in step cells for at least `share` of them is drawn in the shade color.
   */
  readonly steps: {
    readonly sizes: readonly number[];
    readonly reach: number;
    readonly depth: number;
    readonly share: number;
  };
  /** Each of the set's colors: an RGB value for every entry. */
  readonly palettes: Readonly<Record<string, Readonly<Record<string, Rgb>>>>;
}

/** A wheel the picture spins: its centre in the model's coordinates, its outside and rim radii and its width, metres. */
export interface ModelWheel {
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly rim: number;
  readonly width: number;
}

/**
 * A model recipe whose samples take colors by paints: each paint a ramp of steps, with a glossy finish the glass a ramp
 * of its own, everything else one ramp of greys, the brake lamp slot 15. Its pictures are lit by its finish, and each
 * ramp's steps are measured from them.
 */
export interface ModelPaintRecipe extends ModelRecipeBase {
  /** Bank images, `count` of them (odd) evenly over ±`degrees`; absent, one upright image. */
  readonly banks: { readonly count: number; readonly degrees: number } | null;
  /**
   * A sample whose base color lies within `within` of `colors[k]` in every channel is paint `k`; one within `within`
   * of `lamp` is the brake lamp; with a glossy finish, one its glass names is glass; any other is grey.
   */
  readonly paints: { readonly colors: readonly Rgb[]; readonly within: number; readonly lamp: Rgb };
  /**
   * The steps of each paint's ramp, of the glass's (0 without a glossy finish) and of the greys' (14 slots in all),
   * measured from the pictures at size 0 of every `sampleYaws`th direction and every bank.
   */
  readonly ramps: {
    readonly paints: readonly number[];
    readonly glass: number;
    readonly grey: number;
    readonly sampleYaws: number;
  };
  /** How its samples are lit: a plain finish, or a glossy one that mirrors its surroundings. */
  readonly finish: PlainFinish | GlossyFinish;
  /** The wheels spun: what lies inside a rim is averaged over a turn. */
  readonly wheels: readonly ModelWheel[];
  /** Each color of the set: a color for each paint; the first livery is the model's own paints. */
  readonly liveries: Readonly<Record<string, readonly Rgb[]>>;
  readonly brakeLamp: { readonly off: Rgb; readonly on: Rgb };
}

/** A plain finish: the light of a role recipe, every sample's highlight `gloss`. */
export interface PlainFinish {
  readonly kind: 'plain';
  readonly light: ModelRoleRecipe['light'];
  readonly gloss: number;
}

/** What a glossy surface mirrors: a sky from the horizon's color to the zenith's, and a road from haze to its own. */
export interface ModelReflection {
  /** The share mirrored facing the camera squarely. */
  readonly f0: number;
  readonly horizon: Rgb;
  readonly zenith: Rgb;
  readonly haze: Rgb;
  readonly ground: Rgb;
  /** How far below the horizon (the reflected direction's height) the haze has become the road. */
  readonly fall: number;
  /** The power of the reflected direction's height by which the sky turns from the horizon to the zenith. */
  readonly power: number;
}

/**
 * A glossy finish ([Model solids](../../docs/image-assets.md#model-solids)): glass told from the other samples by its
 * color and roughness, a light of ambient, sky, main and fill fixed to the picture and darkened by each sample's
 * occlusion, the sky and road mirrored by the paints and greys and by the glass, and the sun's glare.
 */
export interface GlossyFinish {
  readonly kind: 'glossy';
  /** A sample within `within` of `color` in every channel, rougher than nothing up to `rough`, is glass. */
  readonly glass: { readonly color: Rgb; readonly within: number; readonly rough: number };
  readonly light: {
    readonly main: readonly [number, number, number];
    readonly fill: readonly [number, number, number];
    readonly ambient: number;
    readonly sky: number;
    readonly mainWeight: number;
    readonly fillWeight: number;
    /** The greys' light is this many times the others'. */
    readonly greyGain: number;
  };
  readonly reflection: { readonly paint: ModelReflection; readonly glass: ModelReflection };
  /** Each glare term: `strength × s^power`, times `glass` on glass. */
  readonly glare: readonly { readonly power: number; readonly strength: number; readonly glass: number }[];
}

export type VehicleModelRecipe = ModelRoleRecipe | ModelPaintRecipe;

const SHARE = { min: 0, max: 1 };

function readRgb(value: unknown, path: string): Rgb {
  const [r, g, b] = readArray(value, path, (v, at) => readNumber(v, at, { min: 0, max: 255, integer: true }), {
    length: 3,
  });
  return [r!, g!, b!];
}

function readClause(value: unknown, path: string): ColorClause {
  if (typeof value === 'object' && value !== null && Object.hasOwn(value, 'largest')) {
    const record = readRecord(value, path, ['largest']);
    return { largest: readEnum(record.largest, ['r', 'g', 'b'] as const, `${path}/largest`) };
  }
  const above = typeof value === 'object' && value !== null && Object.hasOwn(value, 'above');
  const record = readRecord(value, path, ['term', above ? 'above' : 'below']);
  const term = readEnum(record.term, COLOR_TERMS, `${path}/term`);
  const bound = readNumber(above ? record.above : record.below, `${path}/${above ? 'above' : 'below'}`, {
    min: 0,
    max: 2,
  });
  return above ? { term, above: bound } : { term, below: bound };
}

const BASE_FIELDS = ['format', 'version', 'vehicle', 'yawVariants', 'model', 'spacing'] as const;
const ROLE_FIELDS = [
  'colors',
  'rest',
  'shade',
  'bright',
  'isolatedSizes',
  'keep',
  'roles',
  'luma',
  'light',
  'hollows',
  'steps',
  'palettes',
] as const;
const PAINT_FIELDS = ['paints', 'ramps', 'light', 'wheels', 'liveries', 'brakeLamp'] as const;
const PLAIN_FIELDS = ['gloss'] as const;
const GLOSSY_FIELDS = ['glass', 'reflection', 'glare'] as const;

/**
 * Admit a model recipe document: one colored by paints when it gives `paints`, with a glossy finish when it also gives
 * `glass`; else by roles.
 */
export function readVehicleModelRecipe(value: unknown): VehicleModelRecipe {
  const has = (field: string) => typeof value === 'object' && value !== null && Object.hasOwn(value, field);
  const painted = has('paints');
  const document = readDocument(
    value,
    [
      ...BASE_FIELDS,
      ...(painted
        ? [...PAINT_FIELDS, ...(has('glass') ? GLOSSY_FIELDS : PLAIN_FIELDS), ...(has('banks') ? ['banks'] : [])]
        : ROLE_FIELDS),
    ],
    VEHICLE_MODEL_RECIPE_FORMAT,
    VEHICLE_MODEL_RECIPE_VERSION,
  );
  const front =
    typeof document.model === 'object' && document.model !== null && Object.hasOwn(document.model, 'frontHub')
      ? 'frontHub'
      : 'frontWheels';
  const m = readRecord(document.model, '/model', ['sha256', 'right', 'up', 'forward', front]);
  const model = {
    sha256: readString(m.sha256, '/model/sha256', SHA256_TEXT),
    right: readEnum(m.right, AXES, '/model/right'),
    up: readEnum(m.up, AXES, '/model/up'),
    forward: readEnum(m.forward, AXES, '/model/forward'),
    ...(front === 'frontHub'
      ? { frontHub: triple(m.frontHub, '/model/frontHub', { min: -100, max: 100 }) }
      : { frontWheels: readArray(m.frontWheels, '/model/frontWheels', (v, at) => readString(v, at), { min: 1 }) }),
  };
  requireAdmission(
    new Set([model.right, model.up, model.forward].map((axis) => axis[1])).size === 3,
    'invalid_value',
    '/model',
    'Expected right, up and forward on three different axes',
  );
  const base: ModelRecipeBase = {
    vehicle: readString(document.vehicle, '/vehicle'),
    yawVariants: readNumber(document.yawVariants, '/yawVariants', { min: 1, max: 256, integer: true }),
    model: Object.freeze(model),
    spacing: readNumber(document.spacing, '/spacing', { min: 0.001, max: 0.05 }),
  };
  return Object.freeze(painted ? readPaints(document, base) : readRoles(document, base));
}

/** A colored set's palettes: one to eight, each named by its color. */
function requireColors(palettes: Readonly<Record<string, unknown>>) {
  requireAdmission(
    Object.keys(palettes).length >= 1 && Object.keys(palettes).length <= MOST_VEHICLE_COLORS,
    'invalid_value',
    '/palettes',
    `A set declares 1 to ${MOST_VEHICLE_COLORS} colors`,
  );
}

const triple = (v: unknown, at: string, domain: { min: number; max: number }) => {
  const [x, y, z] = readArray(v, at, (n, p) => readNumber(n, p, domain), { length: 3 });
  return [x!, y!, z!] as const;
};

/** A direction, made unit. */
function readDirection(value: unknown, at: string) {
  const d = triple(value, at, { min: -1, max: 1 });
  const length = Math.hypot(...d);
  requireAdmission(length > 0, 'invalid_value', at, 'Expected a direction');
  return [d[0] / length, d[1] / length, d[2] / length] as const;
}

const lightWeight = (v: unknown, at: string) => readNumber(v, at, { min: 0, max: 4 });

/** A light fixed to the picture: its main and fill directions (made unit) and weights. */
function readLight(value: unknown): ModelRoleRecipe['light'] {
  const l = readRecord(value, '/light', ['main', 'fill', 'ambient', 'sky', 'mainWeight', 'fillWeight', 'shininess']);
  return Object.freeze({
    main: readDirection(l.main, '/light/main'),
    fill: readDirection(l.fill, '/light/fill'),
    ambient: lightWeight(l.ambient, '/light/ambient'),
    sky: lightWeight(l.sky, '/light/sky'),
    mainWeight: lightWeight(l.mainWeight, '/light/mainWeight'),
    fillWeight: lightWeight(l.fillWeight, '/light/fillWeight'),
    shininess: readNumber(l.shininess, '/light/shininess', { min: 1, max: 1000 }),
  });
}

/** A glossy finish's fields. */
function readGlossyFinish(document: Readonly<Record<string, unknown>>): GlossyFinish {
  const g = readRecord(document.glass, '/glass', ['color', 'within', 'rough']);
  const glass = Object.freeze({
    color: readRgb(g.color, '/glass/color'),
    within: readNumber(g.within, '/glass/within', { min: 0, max: 255, integer: true }),
    rough: readNumber(g.rough, '/glass/rough', { min: 0, max: 1, exclusiveMin: true }),
  });
  const l = readRecord(document.light, '/light', [
    'main',
    'fill',
    'ambient',
    'sky',
    'mainWeight',
    'fillWeight',
    'greyGain',
  ]);
  const light = Object.freeze({
    main: readDirection(l.main, '/light/main'),
    fill: readDirection(l.fill, '/light/fill'),
    ambient: lightWeight(l.ambient, '/light/ambient'),
    sky: lightWeight(l.sky, '/light/sky'),
    mainWeight: lightWeight(l.mainWeight, '/light/mainWeight'),
    fillWeight: lightWeight(l.fillWeight, '/light/fillWeight'),
    greyGain: lightWeight(l.greyGain, '/light/greyGain'),
  });
  const reflection = (value: unknown, at: string): ModelReflection => {
    const r = readRecord(value, at, ['f0', 'horizon', 'zenith', 'haze', 'ground', 'fall', 'power']);
    return Object.freeze({
      f0: readNumber(r.f0, `${at}/f0`, SHARE),
      horizon: readRgb(r.horizon, `${at}/horizon`),
      zenith: readRgb(r.zenith, `${at}/zenith`),
      haze: readRgb(r.haze, `${at}/haze`),
      ground: readRgb(r.ground, `${at}/ground`),
      fall: readNumber(r.fall, `${at}/fall`, { min: 0, max: 1, exclusiveMin: true }),
      power: readNumber(r.power, `${at}/power`, { min: 0, max: 10, exclusiveMin: true }),
    });
  };
  const r = readRecord(document.reflection, '/reflection', ['paint', 'glass']);
  const glare = readArray(
    document.glare,
    '/glare',
    (v, at) => {
      const t = readRecord(v, at, ['power', 'strength', 'glass']);
      return Object.freeze({
        power: readNumber(t.power, `${at}/power`, { min: 1, max: 10000 }),
        strength: lightWeight(t.strength, `${at}/strength`),
        glass: lightWeight(t.glass, `${at}/glass`),
      });
    },
    { max: 4 },
  );
  return Object.freeze({
    kind: 'glossy',
    glass,
    light,
    reflection: Object.freeze({
      paint: reflection(r.paint, '/reflection/paint'),
      glass: reflection(r.glass, '/reflection/glass'),
    }),
    glare,
  });
}

/** The fields of a recipe colored by paints. */
function readPaints(document: Readonly<Record<string, unknown>>, base: ModelRecipeBase): ModelPaintRecipe {
  const banks = Object.hasOwn(document, 'banks')
    ? (() => {
        const b = readRecord(document.banks, '/banks', ['count', 'degrees']);
        const count = readNumber(b.count, '/banks/count', { min: 3, max: 15, integer: true });
        requireAdmission(count % 2 === 1, 'invalid_value', '/banks/count', 'Expected an odd count, one upright');
        return Object.freeze({
          count,
          degrees: readNumber(b.degrees, '/banks/degrees', { min: 0, max: 90, exclusiveMin: true, exclusiveMax: true }),
        });
      })()
    : null;
  const p = readRecord(document.paints, '/paints', ['colors', 'within', 'lamp']);
  const paints = Object.freeze({
    colors: readArray(p.colors, '/paints/colors', readRgb, { min: 1, max: 13 }),
    within: readNumber(p.within, '/paints/within', { min: 0, max: 255, integer: true }),
    lamp: readRgb(p.lamp, '/paints/lamp'),
  });
  const glossy = Object.hasOwn(document, 'glass');
  const finish: PlainFinish | GlossyFinish = glossy
    ? readGlossyFinish(document)
    : Object.freeze({
        kind: 'plain',
        light: readLight(document.light),
        gloss: readNumber(document.gloss, '/gloss', { min: 0, max: 4 }),
      });
  const r = readRecord(document.ramps, '/ramps', ['paints', ...(glossy ? ['glass'] : []), 'grey', 'sampleYaws']);
  const step = (v: unknown, at: string) => readNumber(v, at, { min: 1, max: 14, integer: true });
  const ramps = Object.freeze({
    paints: readArray(r.paints, '/ramps/paints', step, { length: paints.colors.length }),
    glass: glossy ? step(r.glass, '/ramps/glass') : 0,
    grey: step(r.grey, '/ramps/grey'),
    sampleYaws: readNumber(r.sampleYaws, '/ramps/sampleYaws', { min: 1, max: 256, integer: true }),
  });
  requireAdmission(
    ramps.paints.reduce((sum, n) => sum + n, ramps.glass + ramps.grey) === 14,
    'invalid_value',
    '/ramps',
    'The ramps share the 14 picture colors',
  );
  requireAdmission(
    base.yawVariants % ramps.sampleYaws === 0,
    'invalid_value',
    '/ramps/sampleYaws',
    "Expected a number of directions that divides the set's",
  );
  const wheels = readArray(document.wheels, '/wheels', (v, at): ModelWheel => {
    const w = readRecord(v, at, ['center', 'radius', 'rim', 'width']);
    const length = { min: 0.01, max: 2 };
    const wheel = {
      center: triple(w.center, `${at}/center`, { min: -100, max: 100 }),
      radius: readNumber(w.radius, `${at}/radius`, length),
      rim: readNumber(w.rim, `${at}/rim`, length),
      width: readNumber(w.width, `${at}/width`, length),
    };
    requireAdmission(wheel.rim < wheel.radius, 'invalid_value', `${at}/rim`, 'Expected a rim inside the tyre');
    return Object.freeze(wheel);
  });
  const liveries = readDictionary(document.liveries, '/liveries', (livery, path) =>
    readArray(livery, path, readRgb, { length: paints.colors.length }),
  );
  requireColors(liveries);
  const lamp = readRecord(document.brakeLamp, '/brakeLamp', ['off', 'on']);
  return {
    ...base,
    banks,
    paints,
    ramps,
    finish,
    wheels,
    liveries,
    brakeLamp: Object.freeze({ off: readRgb(lamp.off, '/brakeLamp/off'), on: readRgb(lamp.on, '/brakeLamp/on') }),
  };
}

/** The fields of a recipe colored by roles. */
function readRoles(document: Readonly<Record<string, unknown>>, base: ModelRecipeBase): ModelRoleRecipe {
  const colors = readArray(document.colors, '/colors', (v, at) => readString(v, at), { min: 1, max: 14 });
  requireAdmission(new Set(colors).size === colors.length, 'invalid_value', '/colors', 'Expected distinct entries');
  const entry = (v: unknown, at: string) => {
    const name = readString(v, at);
    requireAdmission(colors.includes(name), 'unresolved_reference', at, `Expected one of ${colors.join(', ')}`);
    return name;
  };
  const roles = readArray(
    document.roles,
    '/roles',
    (v, at): ModelRole => {
      const r = readRecord(v, at, ['name', 'when', 'albedo', 'gloss', 'color', 'dark']);
      const albedo = readRecord(r.albedo, `${at}/albedo`, ['of', 'times']);
      return {
        name: readString(r.name, `${at}/name`),
        when: readArray(r.when, `${at}/when`, readClause),
        albedo: {
          of: readEnum(albedo.of, ['color', 'luma'] as const, `${at}/albedo/of`),
          times: readNumber(albedo.times, `${at}/albedo/times`, { min: 0, max: 4 }),
        },
        gloss: readNumber(r.gloss, `${at}/gloss`, { min: 0, max: 4 }),
        color: entry(r.color, `${at}/color`),
        dark: readNumber(r.dark, `${at}/dark`, SHARE),
      };
    },
    { min: 1, max: 14 },
  );
  requireAdmission(
    roles.at(-1)!.when.length === 0,
    'invalid_value',
    `/roles/${roles.length - 1}/when`,
    'Expected the last role to take every color',
  );
  const k = readRecord(document.keep, '/keep', ['role', 'toSize', 'shows']);
  const keep = {
    role: readString(k.role, '/keep/role'),
    toSize: readNumber(k.toSize, '/keep/toSize', { min: 0, max: 5, integer: true }),
    shows: readNumber(k.shows, '/keep/shows', { min: 0, max: 1, exclusiveMin: true }),
  };
  requireAdmission(
    roles.some((role) => role.name === keep.role),
    'unresolved_reference',
    '/keep/role',
    'Expected the name of one of the roles',
  );
  const light = readLight(document.light);
  const h = readRecord(document.hollows, '/hollows', ['cells', 'widths', 'depth', 'most', 'weight']);
  const hollows = {
    cells: readNumber(h.cells, '/hollows/cells', { min: 1, max: 12, integer: true }),
    widths: readArray(h.widths, '/hollows/widths', (v, at) => readNumber(v, at, { min: 0.001, max: 1 }), { max: 4 }),
    depth: readNumber(h.depth, '/hollows/depth', { min: 0.001, max: 10 }),
    most: readNumber(h.most, '/hollows/most', SHARE),
    weight: readNumber(h.weight, '/hollows/weight', SHARE),
  };
  const st = readRecord(document.steps, '/steps', ['sizes', 'reach', 'depth', 'share']);
  const steps = {
    sizes: readArray(st.sizes, '/steps/sizes', (v, at) => readNumber(v, at, { min: 0, max: 5, integer: true })),
    reach: readNumber(st.reach, '/steps/reach', { min: 0.001, max: 1 }),
    depth: readNumber(st.depth, '/steps/depth', { min: 0.001, max: 10 }),
    share: readNumber(st.share, '/steps/share', SHARE),
  };
  const palettes = readDictionary(document.palettes, '/palettes', (palette, path) => {
    const read = readDictionary(palette, path, (rgb, at) => readRgb(rgb, at));
    requireAdmission(
      Object.keys(read).length === colors.length && colors.every((name) => Object.hasOwn(read, name)),
      'invalid_value',
      path,
      `Expected exactly the entries ${colors.join(', ')}`,
    );
    return read;
  });
  requireColors(palettes);
  return {
    ...base,
    colors,
    rest: entry(document.rest, '/rest'),
    shade: entry(document.shade, '/shade'),
    bright: readNumber(document.bright, '/bright', { min: 0, max: 1, exclusiveMin: true }),
    isolatedSizes: readArray(document.isolatedSizes, '/isolatedSizes', (v, at) =>
      readNumber(v, at, { min: 0, max: 5, integer: true }),
    ),
    keep: Object.freeze(keep),
    roles,
    luma: triple(document.luma, '/luma', SHARE),
    light,
    hollows: Object.freeze(hollows),
    steps: Object.freeze(steps),
    palettes,
  };
}

/** The value a term reads of a base color, each channel 0–1. */
function termOf(term: ColorTerm, r: number, g: number, b: number, luma: readonly number[]): number {
  const value = Math.max(r, g, b);
  switch (term) {
    case 'r':
      return r;
    case 'g':
      return g;
    case 'b':
      return b;
    case 'value':
      return value;
    case 'saturation':
      return value > 0 ? (value - Math.min(r, g, b)) / value : 0;
    case 'luma':
      return luma[0]! * r + luma[1]! * g + luma[2]! * b;
    case 'g/r':
      return r > 0 ? g / r : g > 0 ? 2 : 0;
  }
}

/** The first role whose test a base color (8-bit channels) passes; the last role passes every color. */
export function modelRoleOf(recipe: Pick<ModelRoleRecipe, 'roles' | 'luma'>, r255: number, g255: number, b255: number) {
  const r = r255 / 255,
    g = g255 / 255,
    b = b255 / 255;
  const largest = r >= g && r >= b ? 'r' : g >= b ? 'g' : 'b';
  return recipe.roles.findIndex((role) =>
    role.when.every((clause) =>
      'largest' in clause
        ? clause.largest === largest
        : 'above' in clause
          ? termOf(clause.term, r, g, b, recipe.luma) > clause.above
          : termOf(clause.term, r, g, b, recipe.luma) < clause.below,
    ),
  );
}
