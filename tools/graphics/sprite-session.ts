import { readDocument, readEmbedded, readNumber, readRecord, requireAdmission } from '../../src/core/admission.js';
import type { SourceImage, SpriteCrop, SpriteSourceRecipe } from './sprite-source-compiler.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';

import { rgba, unpackRgba } from '../../src/image/rgb555.js';
import { normalizeSpriteSource } from './sprite-source-compiler.js';
import { compileSpriteLod } from './sprite-lod-compiler.js';

export const SPRITE_EDITOR_PIXEL_LIMIT = 1024 * 1024;
export const SPRITE_EDITOR_AXIS_LIMIT = 4096;
export const SPRITE_SESSION_BYTE_LIMIT = 16 * 1024 * 1024;
const HISTORY_BYTES = 8 * 1024 * 1024,
  HISTORY_STEPS = 32;

interface MaskEdit {
  readonly rect: SpriteCrop;
  readonly before: Uint8Array;
  readonly hide: boolean;
}
interface SpriteProducts {
  readonly master: SpriteLodDocument;
  readonly lod: SpriteLodDocument;
}

/** Editor-only original, binary mask and explicit recipes; products are invalidated on every edit. */
export class SpriteSession {
  #source: SourceImage;
  #hidden: Uint8Array;
  #settings!: { recipe: SpriteSourceRecipe | null };
  #products: SpriteProducts | null = null;
  #undo: MaskEdit[] = [];
  #redo: MaskEdit[] = [];

  constructor(source: SourceImage, recipe: SpriteSourceRecipe | null) {
    if (
      ![source.width, source.height].every((v) => Number.isSafeInteger(v) && v > 0 && v <= SPRITE_EDITOR_AXIS_LIMIT) ||
      source.width * source.height > SPRITE_EDITOR_PIXEL_LIMIT ||
      !(source.pixels instanceof Uint32Array) ||
      source.pixels.length !== source.width * source.height
    )
      throw new RangeError('Editor source must fit 4096 pixels per axis and 1048576 pixels total');
    this.#source = { ...source, pixels: source.pixels.slice() };
    this.#hidden = new Uint8Array(source.pixels.length);
    this.updateSettings(recipe);
  }
  get settings() {
    return structuredClone(this.#settings);
  }
  get dimensions() {
    return { width: this.#source.width, height: this.#source.height };
  }
  get canUndo() {
    return this.#undo.length > 0;
  }
  get canRedo() {
    return this.#redo.length > 0;
  }
  get products() {
    return this.#products ? structuredClone(this.#products) : null;
  }
  get image() {
    const pixels = this.#source.pixels.slice();
    for (let i = 0; i < pixels.length; i++)
      if (this.#hidden[i]) {
        const { r, g, b } = unpackRgba(pixels[i]!);
        pixels[i] = rgba(r, g, b, 0);
      }
    return { ...this.#source, pixels };
  }
  updateSettings(recipe: SpriteSourceRecipe | null) {
    this.#settings = structuredClone({ recipe });
    this.#products = null;
  }
  mask(rect: SpriteCrop, hide: boolean) {
    const { x, y, width, height } = rect,
      source = this.#source;
    if (
      ![x, y, width, height].every(Number.isSafeInteger) ||
      x < 0 ||
      y < 0 ||
      width < 1 ||
      height < 1 ||
      x + width > source.width ||
      y + height > source.height ||
      typeof hide !== 'boolean'
    )
      throw new RangeError('Mask selection must be an integer rectangle inside the source');
    const before = new Uint8Array(width * height);
    let changed = false;
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++) {
        const i = (y + row) * source.width + x + col;
        before[row * width + col] = this.#hidden[i]!;
        changed ||= this.#hidden[i] !== Number(hide);
      }
    if (!changed) return false;
    const entry = { rect: { x, y, width, height }, before, hide };
    this.#apply(entry, false);
    this.#redo = [];
    this.#undo.push(entry);
    let size = this.#undo.reduce((sum, e) => sum + e.before.byteLength, 0);
    while (this.#undo.length > HISTORY_STEPS || size > HISTORY_BYTES) size -= this.#undo.shift()!.before.byteLength;
    return true;
  }
  #apply({ rect: { x, y, width, height }, before, hide }: MaskEdit, undo: boolean) {
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++)
        this.#hidden[(y + row) * this.#source.width + x + col] = undo ? before[row * width + col]! : Number(hide);
    this.#products = null;
  }
  undo() {
    const entry = this.#undo.pop();
    if (!entry) return false;
    this.#apply(entry, true);
    this.#redo.push(entry);
    return true;
  }
  redo() {
    const entry = this.#redo.pop();
    if (!entry) return false;
    this.#apply(entry, false);
    this.#undo.push(entry);
    return true;
  }
  compile() {
    this.#products = null;
    const { recipe } = this.#settings;
    const master = normalizeSpriteSource(this.image, recipe);
    const lod = compileSpriteLod(master);
    this.#products = { master, lod };
    return this.products!;
  }
  toDocument() {
    // Saving accepts valid reproducible sessions, never a silently repaired recipe.
    if (!this.#products) this.compile();
    const bytes = new Uint8Array(this.#source.pixels.length * 4);
    for (let i = 0; i < this.#source.pixels.length; i++) {
      const { r, g, b, a } = unpackRgba(this.#source.pixels[i]!);
      bytes.set([r, g, b, a], i * 4);
    }
    return {
      format: 'superoutride.sprite-session',
      version: 2,
      source: { width: this.#source.width, height: this.#source.height, rgbaBase64: encode(bytes) },
      hiddenBase64: encode(this.#hidden),
      ...this.settings,
    };
  }
  static fromDocument(document: unknown) {
    const session = readDocument(
      document,
      ['format', 'version', 'source', 'hiddenBase64', 'recipe'],
      'superoutride.sprite-session',
      2,
    );
    const source = readRecord(session.source, '/source', ['width', 'height', 'rgbaBase64']);
    const axis = { min: 1, max: SPRITE_EDITOR_AXIS_LIMIT, integer: true };
    const width = readNumber(source.width, '/source/width', axis),
      height = readNumber(source.height, '/source/height', axis);
    requireAdmission(
      width * height <= SPRITE_EDITOR_PIXEL_LIMIT,
      'resource_limit',
      '/source',
      'Session source exceeds editor dimensions',
    );
    const bytes = decode(source.rgbaBase64, width * height * 4, '/source/rgbaBase64'),
      hidden = decode(session.hiddenBase64, width * height, '/hiddenBase64');
    requireAdmission(
      hidden.every((v) => v <= 1),
      'invalid_value',
      '/hiddenBase64',
      'Session mask must contain only 0 or 1',
    );
    const pixels = new Uint32Array(width * height);
    for (let i = 0; i < pixels.length; i++)
      pixels[i] = rgba(bytes[i * 4]!, bytes[i * 4 + 1]!, bytes[i * 4 + 2]!, bytes[i * 4 + 3]!);
    // compile() below admits the untrusted recipe before this session is returned.
    const result = new SpriteSession({ width, height, pixels }, session.recipe as SpriteSourceRecipe | null);
    result.#hidden = hidden;
    readEmbedded('/recipe', () => result.compile());
    return result;
  }
}

function encode(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
function decode(text: unknown, length: number, path: string) {
  requireAdmission(
    typeof text === 'string' && text.length === 4 * Math.ceil(length / 3) && /^[A-Za-z0-9+/]*={0,2}$/.test(text),
    'invalid_value',
    path,
    'Session requires bounded base64 image/mask bytes',
  );
  const value = atob(text);
  requireAdmission(
    value.length === length && btoa(value) === text,
    'invalid_value',
    path,
    'Session base64 has invalid length or padding',
  );
  return Uint8Array.from(value, (ch) => ch.charCodeAt(0));
}
