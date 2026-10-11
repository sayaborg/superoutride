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

/**
 * A vehicle picture recipe: how one vehicle's four views (front, side, rear and top pictures) are fitted to its
 * mechanics document's dimensions, which of their surfaces are paint, glass and brake lamp, and the set's palettes.
 * It is production-only data, saved beside its views under `content/vehicle-picture-sources/`.
 */
export const VEHICLE_PICTURE_RECIPE_FORMAT = 'superoutride.vehicle-picture-recipe';
export const VEHICLE_PICTURE_RECIPE_VERSION = 1;
/** The directory of recipes and views: `<set>.json` and `<set>-front.png`, `-side`, `-rear` and `-top`. */
export const VEHICLE_PICTURE_SOURCES_DIRECTORY = 'vehicle-picture-sources';
export const VEHICLE_VIEWS = ['front', 'side', 'rear', 'top'] as const;
export type VehicleView = (typeof VEHICLE_VIEWS)[number];
export const MARK_KINDS = ['glass', 'brakeLamp', 'trim', 'paint'] as const;

/** An 8-bit color as written in a recipe. */
export type Rgb = readonly [number, number, number];

export interface VehiclePictureRecipe {
  /** The mechanics document whose dimensions the solid takes: `content/vehicles/<vehicle>.json`. */
  readonly vehicle: string;
  readonly yawVariants: number;
  /** How a view's background is told from the vehicle: near-white pixels joined to the border, or zero alpha. */
  readonly background: 'white' | 'alpha';
  /** The side view, nose to the left: rows of the road and the roof, columns of both ends and both wheel centres. */
  readonly side: {
    readonly road: number;
    readonly roof: number;
    readonly frontEnd: number;
    readonly rearEnd: number;
    readonly frontWheel: number;
    readonly rearWheel: number;
    /** The front overhang's share of the two overhangs' length. */
    readonly frontOverhangShare: number;
  };
  /**
   * The top view, nose to the left: the row of the centre line, the overall width in pixels, the columns of both ends
   * and `ties`, pairs of a side-view column and the top-view column showing the same station.
   */
  readonly top: {
    readonly centre: number;
    readonly width: number;
    readonly frontEnd: number;
    readonly rearEnd: number;
    readonly ties: readonly (readonly [number, number])[];
  };
  /** The front and rear views: the column of the centre line, the overall width in pixels and the road and roof rows. */
  readonly front: FacingView;
  /** Below `undersideFromFront` metres the rear outline is no wider than the front's (a floor shadow in the view). */
  readonly rear: FacingView & { readonly undersideFromFront: number };
  /** The cross-section follows the rear view behind station `rearUntil` and the front view ahead of `frontFrom`. */
  readonly outlines: { readonly rearUntil: number; readonly frontFrom: number };
  /** The door mirrors: their stations, the heights between which they stand and the half width they stand outside. */
  readonly mirrors: {
    readonly from: number;
    readonly to: number;
    readonly low: number;
    readonly high: number;
    readonly outside: number;
  };
  /**
   * The glasshouse: dark surfaces above this height between these stations are glass. Lit glass brighter than `glint`
   * (its mean channel) is drawn as a glare.
   */
  readonly glass: { readonly above: number; readonly from: number; readonly to: number; readonly glint: number };
  /**
   * What a view shows in a place whatever its color there: inside `polygon`, of that view's pixels, a surface that view
   * colors most is glass, a brake lamp, trim (anything that is not paint: a headlamp, a bright moulding) or paint of
   * the recipe's color (where the view shows something that stands in front of the paint).
   */
  readonly marks: readonly {
    readonly view: VehicleView;
    readonly kind: (typeof MARK_KINDS)[number];
    readonly polygon: readonly (readonly [number, number])[];
  }[];
  /**
   * The upper surface where no outline shows it (a hollow between two crests, a crowned roof, a rounded shoulder): a
   * net of heights in metres, `heights[station][across]`, at `stations` falling from the nose to the tail and at
   * distances `across` rising from the centre line. The solid's top reaches no higher than the net, read linearly
   * between its knots; beyond its stations and distances the outlines alone shape the solid.
   */
  readonly surface: {
    readonly stations: readonly number[];
    readonly across: readonly number[];
    readonly heights: readonly (readonly number[])[];
  };
  /**
   * Paint is a surface at least this bright whose chromaticity lies within `tolerance` of this color's. Its lit color
   * is multiplied by `exposure` before it saturates at white: a light paint is exposed down, as a camera would. A view
   * shows paint with the light of the place it was taken in; paint keeps the share `shade` of that and takes the rest
   * from `color`, so a paint whose views are mostly reflections is lit by the generator alone.
   */
  readonly paint: {
    readonly color: Rgb;
    readonly tolerance: number;
    readonly brightness: number;
    readonly exposure: number;
    readonly shade: number;
  };
  /** How the palette's 14 slots are shared, in slot order: body ramp, neutrals, glass (dark then light), accents. */
  readonly slots: { readonly body: number; readonly neutral: number; readonly glass: 2; readonly accent: number };
  /** The brightness at which paint takes each body slot, from the highlight down; between two it takes the nearer. */
  readonly bodyKeys: readonly number[];
  readonly palettes: Readonly<Record<string, readonly Rgb[]>>;
  readonly brakeLamp: { readonly off: Rgb; readonly on: Rgb };
}

interface FacingView {
  readonly centre: number;
  readonly width: number;
  readonly road: number;
  readonly roof: number;
}

const PIXEL = { min: 0, max: 1 << 16 };
const POSITIVE = { min: 0, max: 1 << 16, exclusiveMin: true };
const METRES = { min: -100, max: 100 };

function readRgb(value: unknown, path: string): Rgb {
  const [r, g, b] = readArray(value, path, (v, at) => readNumber(v, at, { min: 0, max: 255, integer: true }), {
    length: 3,
  });
  return [r!, g!, b!];
}

function readFacing(value: unknown, path: string, extra: readonly string[] = []) {
  const record = readRecord(value, path, ['centre', 'width', 'road', 'roof', ...extra]);
  const view: FacingView = {
    centre: readNumber(record.centre, `${path}/centre`, PIXEL),
    width: readNumber(record.width, `${path}/width`, POSITIVE),
    road: readNumber(record.road, `${path}/road`, PIXEL),
    roof: readNumber(record.roof, `${path}/roof`, PIXEL),
  };
  requireAdmission(view.road > view.roof, 'invalid_value', `${path}/road`, 'The road lies below the roof');
  return { record, view };
}

/** Admit a recipe document. */
export function readVehiclePictureRecipe(value: unknown): VehiclePictureRecipe {
  const document = readDocument(
    value,
    [
      'format',
      'version',
      'vehicle',
      'yawVariants',
      'background',
      'side',
      'top',
      'front',
      'rear',
      'outlines',
      'mirrors',
      'glass',
      'surface',
      'paint',
      'marks',
      'slots',
      'bodyKeys',
      'palettes',
      'brakeLamp',
    ],
    VEHICLE_PICTURE_RECIPE_FORMAT,
    VEHICLE_PICTURE_RECIPE_VERSION,
  );
  const sideFields = ['road', 'roof', 'frontEnd', 'rearEnd', 'frontWheel', 'rearWheel'] as const;
  const sideRecord = readRecord(document.side, '/side', [...sideFields, 'frontOverhangShare']);
  const [road, roof, frontEnd, rearEnd, frontWheel, rearWheel] = sideFields.map((field) =>
    readNumber(sideRecord[field], `/side/${field}`, PIXEL),
  ) as [number, number, number, number, number, number];
  requireAdmission(road > roof, 'invalid_value', '/side/road', 'The road lies below the roof');
  requireAdmission(
    frontEnd < frontWheel && frontWheel < rearWheel && rearWheel < rearEnd,
    'invalid_value',
    '/side',
    'The side view shows the nose to the left: front end, front wheel, rear wheel, rear end',
  );
  const topRecord = readRecord(document.top, '/top', ['centre', 'width', 'frontEnd', 'rearEnd', 'ties']);
  const ties = readArray(topRecord.ties, '/top/ties', (tie, at) => {
    const [side, top] = readArray(tie, at, (v, p) => readNumber(v, p, PIXEL), { length: 2 });
    return [side!, top!] as const;
  });
  ties.forEach(([side, top], index) => {
    const before = ties[index - 1];
    requireAdmission(
      !before || (side > before[0] && top > before[1]),
      'invalid_value',
      `/top/ties/${index}`,
      'Ties run from the nose to the tail in both views',
    );
  });
  const rear = readFacing(document.rear, '/rear', ['undersideFromFront']);
  const outlines = readRecord(document.outlines, '/outlines', ['rearUntil', 'frontFrom']);
  const rearUntil = readNumber(outlines.rearUntil, '/outlines/rearUntil', METRES);
  const frontFrom = readNumber(outlines.frontFrom, '/outlines/frontFrom', {
    min: rearUntil,
    max: 100,
    exclusiveMin: true,
  });
  const mirrors = readRecord(document.mirrors, '/mirrors', ['from', 'to', 'low', 'high', 'outside']);
  const glass = readRecord(document.glass, '/glass', ['above', 'from', 'to', 'glint']);
  const paint = readRecord(document.paint, '/paint', ['color', 'tolerance', 'brightness', 'exposure', 'shade']);
  const slotRecord = readRecord(document.slots, '/slots', ['body', 'neutral', 'glass', 'accent']);
  const count = (field: string, min: number) =>
    readNumber(slotRecord[field], `/slots/${field}`, { min, max: 14, integer: true });
  const slots = { body: count('body', 2), neutral: count('neutral', 1), glass: 2 as const, accent: count('accent', 0) };
  requireAdmission(slotRecord.glass === 2, 'invalid_value', '/slots/glass', 'Glass takes two slots, dark and light');
  requireAdmission(
    slots.body + slots.neutral + slots.glass + slots.accent === 14,
    'invalid_value',
    '/slots',
    'The slots share the 14 picture colors',
  );
  const bodyKeys = readArray(document.bodyKeys, '/bodyKeys', (v, at) => readNumber(v, at, { min: 0, max: 255 }), {
    length: slots.body,
  });
  bodyKeys.forEach((key, index) =>
    requireAdmission(
      index === 0 || key < bodyKeys[index - 1]!,
      'invalid_value',
      `/bodyKeys/${index}`,
      'Body keys fall from the highlight to the darkest slot',
    ),
  );
  const palettes = readDictionary(document.palettes, '/palettes', (palette, path) =>
    readArray(palette, path, readRgb, { length: 14 }),
  );
  requireAdmission(Object.keys(palettes).length >= 2, 'invalid_value', '/palettes', 'A set has at least two colors');
  const lamp = readRecord(document.brakeLamp, '/brakeLamp', ['off', 'on']);
  const surfaceRecord = readRecord(document.surface, '/surface', ['stations', 'across', 'heights']);
  const rising = (values: readonly number[], path: string, sign: number) =>
    values.forEach((value, index) =>
      requireAdmission(
        index === 0 || sign * (value - values[index - 1]!) > 0,
        'invalid_value',
        `${path}/${index}`,
        sign > 0 ? 'Distances rise from the centre line' : 'Stations fall from the nose to the tail',
      ),
    );
  const stations = readArray(surfaceRecord.stations, '/surface/stations', (v, at) => readNumber(v, at, METRES));
  const across = readArray(surfaceRecord.across, '/surface/across', (v, at) => readNumber(v, at, { min: 0, max: 100 }));
  rising(stations, '/surface/stations', -1);
  rising(across, '/surface/across', 1);
  requireAdmission(
    stations.length !== 1 && across.length !== 1 && (stations.length === 0) === (across.length === 0),
    'invalid_value',
    '/surface',
    'A surface has at least two stations and two distances, or none',
  );
  const surface = {
    stations,
    across,
    heights: readArray(
      surfaceRecord.heights,
      '/surface/heights',
      (row, at) => readArray(row, at, (v, p) => readNumber(v, p, { min: 0, max: 100 }), { length: across.length }),
      { length: stations.length },
    ),
  };
  const between = (record: Record<string, unknown>, path: string, field: string) =>
    readNumber(record[field], `${path}/${field}`, METRES);
  return {
    vehicle: readString(document.vehicle, '/vehicle', { pattern: /^[A-Z0-9_]+$/ }),
    yawVariants: readNumber(document.yawVariants, '/yawVariants', { min: 1, max: 1 << 10, integer: true }),
    background: readEnum(document.background, ['white', 'alpha'] as const, '/background'),
    side: {
      road,
      roof,
      frontEnd,
      rearEnd,
      frontWheel,
      rearWheel,
      frontOverhangShare: readNumber(sideRecord.frontOverhangShare, '/side/frontOverhangShare', {
        min: 0,
        max: 1,
        exclusiveMin: true,
        exclusiveMax: true,
      }),
    },
    top: {
      centre: readNumber(topRecord.centre, '/top/centre', PIXEL),
      width: readNumber(topRecord.width, '/top/width', POSITIVE),
      frontEnd: readNumber(topRecord.frontEnd, '/top/frontEnd', PIXEL),
      rearEnd: readNumber(topRecord.rearEnd, '/top/rearEnd', PIXEL),
      ties,
    },
    front: readFacing(document.front, '/front').view,
    rear: {
      ...rear.view,
      undersideFromFront: readNumber(rear.record.undersideFromFront, '/rear/undersideFromFront', { min: 0, max: 10 }),
    },
    outlines: { rearUntil, frontFrom },
    mirrors: {
      from: between(mirrors, '/mirrors', 'from'),
      to: between(mirrors, '/mirrors', 'to'),
      low: between(mirrors, '/mirrors', 'low'),
      high: between(mirrors, '/mirrors', 'high'),
      outside: between(mirrors, '/mirrors', 'outside'),
    },
    glass: {
      above: between(glass, '/glass', 'above'),
      from: between(glass, '/glass', 'from'),
      to: between(glass, '/glass', 'to'),
      glint: readNumber(glass.glint, '/glass/glint', { min: 0, max: 255 }),
    },
    surface,
    paint: {
      color: readRgb(paint.color, '/paint/color'),
      tolerance: readNumber(paint.tolerance, '/paint/tolerance', { min: 0, max: 2, exclusiveMin: true }),
      brightness: readNumber(paint.brightness, '/paint/brightness', { min: 0, max: 255 }),
      exposure: readNumber(paint.exposure, '/paint/exposure', { min: 0, max: 4, exclusiveMin: true }),
      shade: readNumber(paint.shade, '/paint/shade', { min: 0, max: 1 }),
    },
    marks: readArray(document.marks, '/marks', (value, at) => {
      const record = readRecord(value, at, ['view', 'kind', 'polygon']);
      return {
        view: readEnum(record.view, VEHICLE_VIEWS, `${at}/view`),
        kind: readEnum(record.kind, MARK_KINDS, `${at}/kind`),
        polygon: readArray(
          record.polygon,
          `${at}/polygon`,
          (corner, path) => {
            const [x, y] = readArray(corner, path, (v, p) => readNumber(v, p, PIXEL), { length: 2 });
            return [x!, y!] as const;
          },
          { min: 3 },
        ),
      };
    }),
    slots,
    bodyKeys,
    palettes,
    brakeLamp: { off: readRgb(lamp.off, '/brakeLamp/off'), on: readRgb(lamp.on, '/brakeLamp/on') },
  };
}
