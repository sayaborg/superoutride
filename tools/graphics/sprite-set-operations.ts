import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { adjustRgb555, type PaletteAdjustment } from './oklab.js';
import { BRAKE_LAMP_SLOT } from './sprite-import.js';
import { VEHICLE_SPRITE_SET_FORMAT, VEHICLE_SPRITE_SET_VERSION } from './vehicle-sprite-sets.js';

/**
 * Edits of one vehicle sprite set document: each takes the document's value and returns the new value, which the
 * caller saves as one edit and the next compile admits. Arguments outside the document's own domain throw a
 * `RangeError`; the document is otherwise taken as the store holds it.
 */
export interface VehicleSpriteSetDocument {
  readonly format: typeof VEHICLE_SPRITE_SET_FORMAT;
  readonly version: typeof VEHICLE_SPRITE_SET_VERSION;
  readonly yawVariants: number;
  readonly bankVariants: number;
  readonly bankDegrees?: number;
  readonly brakeLamp: { readonly off: number; readonly on: number };
  readonly assets: readonly (readonly number[])[];
  readonly sprites: readonly SpriteLodDocument[];
}

type Set = VehicleSpriteSetDocument;

function require(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RangeError(message);
}
const requireSprite = (set: Set, index: number) =>
  require(Number.isInteger(index) && index >= 0 && index < set.sprites.length, `No image ${index} in the set`);

/** A new set of `yawVariants` × `bankVariants` cells, every cell showing its one image. */
export function createSpriteSet(
  grid: { readonly yawVariants: number; readonly bankVariants: number; readonly bankDegrees?: number },
  brakeLamp: Set['brakeLamp'],
  sprite: SpriteLodDocument,
): Set {
  const { yawVariants, bankVariants, bankDegrees } = grid;
  require([yawVariants, bankVariants].every(
    (n) => Number.isInteger(n) && n >= 1,
  ), 'A set has at least one yaw and one bank cell');
  require(bankVariants > 1 === (bankDegrees !== undefined), 'A set with several bank images declares bankDegrees');
  return {
    format: VEHICLE_SPRITE_SET_FORMAT,
    version: VEHICLE_SPRITE_SET_VERSION,
    yawVariants,
    bankVariants,
    ...(bankDegrees === undefined ? {} : { bankDegrees }),
    brakeLamp,
    assets: Array.from({ length: yawVariants }, () => Array<number>(bankVariants).fill(0)),
    sprites: [sprite],
  };
}

/**
 * An imported image as a member of `set`: every palette name the set's images have, each starting as the image's own
 * default colors, and the set's default palette.
 */
function member(set: Set, sprite: SpriteLodDocument): SpriteLodDocument {
  const first = set.sprites[0];
  if (!first) return sprite;
  const colors = sprite.palettes[sprite.defaultPalette]!.colors;
  return withPalette(
    { ...sprite, palettes: Object.fromEntries(Object.keys(first.palettes).map((name) => [name, { colors }])) },
    first.defaultPalette,
    colors,
  );
}

/** Add an imported image; it is the set's last, unbound until a cell shows it. */
export function addSetSprite(set: Set, sprite: SpriteLodDocument): Set {
  return { ...set, sprites: [...set.sprites, member(set, sprite)] };
}

/** Replace image `index` with an imported image; every cell showing it shows the new one. */
export function replaceSetSprite(set: Set, index: number, sprite: SpriteLodDocument): Set {
  requireSprite(set, index);
  const others = { ...set, sprites: set.sprites.filter((_, i) => i !== index) };
  return { ...set, sprites: set.sprites.map((image, i) => (i === index ? member(others, sprite) : image)) };
}

/** Remove image `index`, which no cell may show; later images move down one. */
export function removeSetSprite(set: Set, index: number): Set {
  requireSprite(set, index);
  require(!set.assets.flat().includes(index), 'A cell still shows the image');
  return {
    ...set,
    sprites: set.sprites.filter((_, i) => i !== index),
    assets: set.assets.map((row) => row.map((i) => (i > index ? i - 1 : i))),
  };
}

/** Show image `index` in the cell at `yaw` and `bank`. */
export function bindSetCell(set: Set, yaw: number, bank: number, index: number): Set {
  requireSprite(set, index);
  require(set.assets[yaw]?.[bank] !== undefined, `No cell at yaw ${yaw}, bank ${bank}`);
  return {
    ...set,
    assets: set.assets.map((row, y) => (y === yaw ? row.map((i, b) => (b === bank ? index : i)) : row)),
  };
}

/** The set's brake-lamp colors, off and on (RGB555). */
export function setBrakeLamp(set: Set, brakeLamp: Set['brakeLamp']): Set {
  return { ...set, brakeLamp: { off: brakeLamp.off, on: brakeLamp.on } };
}

/** The lean the outermost bank images show, for a set with several bank images. */
export function setBankDegrees(set: Set, bankDegrees: number): Set {
  require(set.bankVariants > 1, 'A set with one bank image has no bankDegrees');
  return { ...set, bankDegrees };
}

/** Every image with `edit` applied to its named palettes; the default palette follows a rename. */
function mapPalettes(
  set: Set,
  edit: (palettes: SpriteLodDocument['palettes'], sprite: SpriteLodDocument) => SpriteLodDocument['palettes'],
  defaultPalette = (name: string) => name,
): Set {
  return {
    ...set,
    sprites: set.sprites.map((sprite) => ({
      ...sprite,
      defaultPalette: defaultPalette(sprite.defaultPalette),
      palettes: edit(sprite.palettes, sprite),
    })),
  };
}
const paletteNames = (set: Set) => Object.keys(set.sprites[0]?.palettes ?? {});
const requireNew = (set: Set, name: string) => {
  require(!!name.trim() && name === name.trim(), 'A palette name is nonempty and trimmed');
  require(!paletteNames(set).includes(name), `The set already has a palette ${name}`);
};
const requireExisting = (set: Set, name: string) =>
  require(paletteNames(set).includes(name), `The set has no palette ${name}`);

/** Add palette `name` to every image as a copy of its palette `from`. */
export function addSetPalette(set: Set, name: string, from: string): Set {
  requireExisting(set, from);
  requireNew(set, name);
  return mapPalettes(set, (palettes) => ({ ...palettes, [name]: { colors: [...palettes[from]!.colors] } }));
}

/** Rename palette `from` to `to` in every image, keeping the palettes' order. */
export function renameSetPalette(set: Set, from: string, to: string): Set {
  requireExisting(set, from);
  requireNew(set, to);
  return mapPalettes(
    set,
    (palettes) =>
      Object.fromEntries(Object.entries(palettes).map(([name, value]) => [name === from ? to : name, value])),
    (name) => (name === from ? to : name),
  );
}

/** Remove palette `name` from every image; a set keeps at least two, and an image's default stays. */
export function removeSetPalette(set: Set, name: string): Set {
  requireExisting(set, name);
  require(paletteNames(set).length > 2, 'A set keeps at least two palettes');
  require(set.sprites.every((sprite) => sprite.defaultPalette !== name), 'The palette is an image default');
  return mapPalettes(set, (palettes) => Object.fromEntries(Object.entries(palettes).filter(([n]) => n !== name)));
}

const requireArtSlot = (slot: number) =>
  require(Number.isInteger(slot) && slot >= 1 && slot < BRAKE_LAMP_SLOT, 'Only slots 1 to 14 hold artwork colors');

/** Set one image's palette slot to an RGB555 color; a default palette's color is the image's master color too. */
export function setSlotColor(set: Set, index: number, palette: string, slot: number, color: number): Set {
  requireSprite(set, index);
  requireExisting(set, palette);
  requireArtSlot(slot);
  require(Number.isInteger(color) && color >= 0 && color <= 0x7fff, 'An RGB555 color is an integer 0 to 32767');
  return {
    ...set,
    sprites: set.sprites.map((sprite, i) => {
      if (i !== index) return sprite;
      const colors = sprite.palettes[palette]!.colors.map((c, s) => (s === slot ? color : c));
      return withPalette(sprite, palette, colors);
    }),
  };
}

/** An image with palette `name` set to `colors`, its master level following its default palette. */
function withPalette(sprite: SpriteLodDocument, name: string, colors: readonly number[]): SpriteLodDocument {
  return {
    ...sprite,
    palettes: { ...sprite.palettes, [name]: { colors } },
    levels:
      sprite.defaultPalette === name
        ? sprite.levels.map((level, k) => (k === 0 ? { ...level, paletteRgb555: colors } : level))
        : sprite.levels,
  };
}

/**
 * Derive palette `to` from palette `from` in every image: the chosen slots adjusted in Oklab, the others copied. Slot 0
 * (transparent) and the lamp slot are never chosen. Only the resulting RGB555 colors are saved.
 */
export function adjustSetPalette(
  set: Set,
  from: string,
  to: string,
  slots: readonly number[],
  adjustment: PaletteAdjustment,
): Set {
  requireExisting(set, from);
  requireNew(set, to);
  slots.forEach(requireArtSlot);
  return mapPalettes(set, (palettes) => ({
    ...palettes,
    [to]: {
      colors: palettes[from]!.colors.map((color, slot) =>
        slots.includes(slot) ? adjustRgb555(color, adjustment) : color,
      ),
    },
  }));
}
