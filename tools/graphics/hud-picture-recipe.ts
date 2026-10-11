import {
  readDictionary,
  readDocument,
  readEnum,
  readNumber,
  readRecord,
  readArray,
  requireAdmission,
} from '../../src/core/admission.js';

/**
 * The HUD picture recipes: how each HUD picture is drawn from its source, `<name>.png` beside the recipes under
 * `content/hud-picture-sources/`. They are production-only data, which the build does not deliver.
 */
export const HUD_PICTURE_RECIPES_FORMAT = 'superoutride.hud-picture-recipes';
export const HUD_PICTURE_RECIPES_VERSION = 1;
export const HUD_PICTURE_SOURCES_DIRECTORY = 'hud-picture-sources';
export const HUD_PICTURE_RECIPES_FILE = `${HUD_PICTURE_SOURCES_DIRECTORY}/recipes.json`;

/** A steering wheel seen from the driver, upright: the rim centre and the hub's offset from it, source pixels. */
export interface SteeringWheelRecipe {
  readonly kind: 'steeringWheel';
  readonly rimCentre: readonly [number, number];
  readonly hubOffset: readonly [number, number];
  /** The exponent applied to the source's colors as fractions of full scale. */
  readonly gamma: number;
}
/** A top bridge seen from the rider, upright on a transparent ground; its width fills the picture. */
export interface TopBridgeRecipe {
  readonly kind: 'topBridge';
  /** The source point the bridge turns about, source pixels from the top-left corner. */
  readonly centre: readonly [number, number];
}
export type HudPictureRecipe = SteeringWheelRecipe | TopBridgeRecipe;

export interface HudPictureRecipes {
  /** The picture's width and height, pixels. */
  readonly size: number;
  /** The colors of each picture's palette, besides transparency. */
  readonly colors: number;
  /** Samples a side for each picture pixel. */
  readonly supersampling: number;
  /** The covered share at which a picture pixel is opaque. */
  readonly alphaThreshold: number;
  /** How every steering wheel's source is read. */
  readonly steeringWheel: {
    /** The smallest channel at which a source pixel is white. */
    readonly white: number;
    /** The radius of the disk a white area must hold to be background. */
    readonly openingRadius: number;
    /** Pixels the solid loses at its edge, which drops the light fringe. */
    readonly erosion: number;
    /** The rim's leather beyond `radius` source pixels with less `saturation`: v = 255 (v/255)^exponent * scale. */
    readonly rimLeather: {
      readonly radius: number;
      readonly saturation: number;
      readonly exponent: number;
      readonly scale: number;
    };
    /** The angles at which the rim's edges are measured, and the Gaussian smoothing of each edge, in those angles. */
    readonly edgeAngles: number;
    readonly outerSmoothing: number;
    readonly innerSmoothing: number;
  };
  readonly pictures: Readonly<Record<string, HudPictureRecipe>>;
}

const POSITIVE = { min: 0, exclusiveMin: true } as const;
const COUNT = { min: 1, integer: true } as const;
const point = (value: unknown, path: string) => {
  const [x, y] = readArray(value, path, (v, at) => readNumber(v, at), { length: 2 });
  return [x!, y!] as const;
};

/** Admit the recipes document. */
export function readHudPictureRecipes(value: unknown): HudPictureRecipes {
  const document = readDocument(
    value,
    ['format', 'version', 'size', 'colors', 'supersampling', 'alphaThreshold', 'steeringWheel', 'pictures'],
    HUD_PICTURE_RECIPES_FORMAT,
    HUD_PICTURE_RECIPES_VERSION,
  );
  const wheel = readRecord(document.steeringWheel, '/steeringWheel', [
    'white',
    'openingRadius',
    'erosion',
    'rimLeather',
    'edgeAngles',
    'outerSmoothing',
    'innerSmoothing',
  ]);
  const leather = readRecord(wheel.rimLeather, '/steeringWheel/rimLeather', [
    'radius',
    'saturation',
    'exponent',
    'scale',
  ]);
  const pictures = readDictionary(document.pictures, '/pictures', (entry, path): HudPictureRecipe => {
    const named = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>).kind : undefined;
    const kind = readEnum(named, ['steeringWheel', 'topBridge'] as const, `${path}/kind`);
    if (kind === 'topBridge') {
      const record = readRecord(entry, path, ['kind', 'centre']);
      return { kind, centre: point(record.centre, `${path}/centre`) };
    }
    const record = readRecord(entry, path, ['kind', 'rimCentre', 'hubOffset', 'gamma']);
    return {
      kind,
      rimCentre: point(record.rimCentre, `${path}/rimCentre`),
      hubOffset: point(record.hubOffset, `${path}/hubOffset`),
      gamma: readNumber(record.gamma, `${path}/gamma`, POSITIVE),
    };
  });
  requireAdmission(Object.keys(pictures).length > 0, 'invalid_shape', '/pictures', 'Expected at least one picture');
  return {
    size: readNumber(document.size, '/size', COUNT),
    colors: readNumber(document.colors, '/colors', { min: 1, max: 15, integer: true }),
    supersampling: readNumber(document.supersampling, '/supersampling', COUNT),
    alphaThreshold: readNumber(document.alphaThreshold, '/alphaThreshold', { min: 0, max: 1, exclusiveMin: true }),
    steeringWheel: {
      white: readNumber(wheel.white, '/steeringWheel/white', { min: 0, max: 255 }),
      openingRadius: readNumber(wheel.openingRadius, '/steeringWheel/openingRadius', COUNT),
      erosion: readNumber(wheel.erosion, '/steeringWheel/erosion', { min: 0, integer: true }),
      rimLeather: {
        radius: readNumber(leather.radius, '/steeringWheel/rimLeather/radius', { min: 0 }),
        saturation: readNumber(leather.saturation, '/steeringWheel/rimLeather/saturation', { min: 0, max: 255 }),
        exponent: readNumber(leather.exponent, '/steeringWheel/rimLeather/exponent', POSITIVE),
        scale: readNumber(leather.scale, '/steeringWheel/rimLeather/scale', { min: 0, max: 1 }),
      },
      edgeAngles: readNumber(wheel.edgeAngles, '/steeringWheel/edgeAngles', COUNT),
      outerSmoothing: readNumber(wheel.outerSmoothing, '/steeringWheel/outerSmoothing', POSITIVE),
      innerSmoothing: readNumber(wheel.innerSmoothing, '/steeringWheel/innerSmoothing', POSITIVE),
    },
    pictures,
  };
}
