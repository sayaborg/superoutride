import {
  createSpritePalette,
  selectSpriteLevel,
  spriteFolds,
  spriteRepeatPeriodMeters,
  SPRITE_SOURCE_TEXELS_PER_METER,
  type SpriteFrame,
  type SpriteLodAsset,
} from '../../src/image/sprite.js';
import { compileCourseSprite } from '../../src/view/course-sprite.js';
import { courseElementLeaves, expansionWork, type CourseElementLeaf } from '../../src/course/course-repeat.js';
import type { CourseDocument, SpriteDocument } from '../../src/course/course-document.js';
import type { StripSlabTarget } from '../../src/course/strip-ground.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { transformPlanarPoint } from '../../src/core/planar-transform.js';
import { BoardBuilder, LineBuilder } from './viewer-gl.js';
import type { CourseLayout, PlacedSection } from './viewer-layout.js';
import { courseLimits, rgb555Bytes } from './viewer-surfaces.js';

/**
 * The course's pictures as boards by the viewer's rules ([Development](../../docs/development.md#course-viewer)): a
 * picture is one flat board at its base point; the rows on and above its anchor stand in the cross section at its
 * station, facing the coming cars, and the rows below fold at the anchor toward −s onto the lying plane, the road's
 * plane at that station (tilted to its grade, level across); a band repeats sideways in the game's direction to the edge
 * of the drawn ground, each repetition folding alike; a movable object's shadow lies on the lying plane beneath it.
 * Every board is drawn at the level of its picture the game's nearest-octave rule picks for its scale at its base point.
 */

/** Atlas pages are this many texels square. */
const ATLAS_SIZE = 4096;
/** The level table's columns: two texels for each of a picture's levels. */
export const LEVEL_TABLE_WIDTH = 64;

/** How an element is written: a repeat's original or copy, else one element by reference or by number. */
export type BoardForm = 'original' | 'copy' | 'reference' | 'absolute';
export const FORM_COLORS: Readonly<Record<BoardForm, readonly number[]>> = {
  original: [0xff, 0xa6, 0x57],
  copy: [0xf2, 0xcc, 0x8f],
  reference: [0x58, 0xa6, 0xff],
  absolute: [0xf7, 0x78, 0xba],
};

/** One drawn board and what it was drawn from, for its level, picking and description. */
export interface BoardRecord {
  readonly placed: PlacedSection;
  /** Its index among the Section's expanded sprites. */
  readonly index: number;
  readonly leaf: CourseElementLeaf<SpriteDocument> | null;
  readonly image: SpriteLodAsset;
  readonly palette: string;
  readonly s: number;
  readonly l: number;
  readonly groundOffset: number;
  /** Its base point, relative to the layout's origin. */
  readonly base: readonly number[];
  readonly movable: boolean;
  readonly form: BoardForm | null;
  /** The repetitions of a band, the picture itself first: each its lateral offset and the master width it shows. */
  readonly copies: readonly { readonly offset: number; readonly width: number }[];
  /** Each drawn quad: four corners (12 values), its master texels (8 values) and whether it lies. */
  readonly quads: { readonly corners: number[]; readonly texels: number[]; readonly lying: boolean }[];
}

/**
 * One board drawn at one depth, whose level its scale there picks: a picture at its base point, or each repetition of a
 * board repeating sideways at its centre.
 */
export interface LevelSlot {
  readonly image: SpriteLodAsset;
  readonly point: readonly number[];
}

/** The boards by what shows them: their standing and lying parts apart, as lying parts draw onto the ground. */
export interface BoardMeshes {
  standing: BoardBuilder;
  lying: BoardBuilder;
  bandStanding: BoardBuilder;
  bandLying: BoardBuilder;
  movableStanding: BoardBuilder;
  movableLying: BoardBuilder;
  shadows: BoardBuilder;
}

/** The atlas, the level table (each picture's levels' places) and the palettes (one row a picture, palette and level). */
export interface BoardTextures {
  readonly size: number;
  readonly pages: Uint8Array[];
  /** `LEVEL_TABLE_WIDTH` columns of 4 unsigned shorts a row: for level k, (x, y, page, 0) then (width, height, 0, 0). */
  readonly levels: Uint16Array;
  readonly palettes: Uint8Array;
}

/** Shelf-packed atlas pages of palette indices. */
class Atlas {
  pages: Uint8Array[] = [];
  #x = 0;
  #y = 0;
  #row = 0;
  place(frame: SpriteFrame): { page: number; x: number; y: number } {
    if (!this.pages.length) this.pages.push(new Uint8Array(ATLAS_SIZE * ATLAS_SIZE));
    if (this.#x + frame.width > ATLAS_SIZE) {
      this.#x = 0;
      this.#y += this.#row + 1;
      this.#row = 0;
    }
    if (this.#y + frame.height > ATLAS_SIZE) {
      this.pages.push(new Uint8Array(ATLAS_SIZE * ATLAS_SIZE));
      this.#x = this.#y = this.#row = 0;
    }
    const entry = { page: this.pages.length - 1, x: this.#x, y: this.#y };
    const page = this.pages[entry.page]!;
    for (let v = 0; v < frame.height; v++)
      for (let u = 0; u < frame.width; u++)
        page[(entry.y + v) * ATLAS_SIZE + entry.x + u] = frame.pattern.indexAt(v * frame.width + u);
    this.#x += frame.width + 1;
    this.#row = Math.max(this.#row, frame.height);
    return entry;
  }
}

const TEXELS = SPRITE_SOURCE_TEXELS_PER_METER;
const OUTLINE = [0, 255, 255, 255];
/** The fold, where a picture's lying rows meet its standing ones. */
const FOLD = [255, 0, 255, 255];

/**
 * The drawn ground's lateral edge on one side at a station: the outermost opaque span's edge, clipped to the course
 * limit widened by the display width.
 */
function groundEdge(placed: PlacedSection, s: number, width: number, side: 1 | -1, target: StripSlabTarget): number {
  const reader = placed.section.color.reader;
  let lo = 0,
    hi = reader.slabCount;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (reader.readSlab(mid, target).start <= s) lo = mid + 1;
    else hi = mid;
  }
  reader.readSlab(Math.max(0, lo - 1), target);
  const t = target.end > target.start ? (s - target.start) / (target.end - target.start) : 0;
  const edge = (k: number) => target.edges[2 * k]! + (target.edges[2 * k + 1]! - target.edges[2 * k]!) * t;
  const n = target.colors.length;
  const limits = courseLimits(placed, s, s);
  let colored = side > 0 ? -Infinity : Infinity;
  for (let k = 0; k < n; k++) {
    if (target.colors[k]! < 0) continue;
    colored = side > 0 ? (k === n - 1 ? Infinity : edge(k)) : k === 0 ? -Infinity : edge(k - 1);
    if (side < 0) break;
  }
  return side > 0 ? Math.min(colored, limits.right[0]! + width) : Math.max(colored, limits.left[0]! - width);
}

/**
 * A board's planes at a station: the right normal (across, level) and the road's direction tilted to its grade there
 * (the lying plane's toward +s), as unit vectors.
 */
function boardPlanes(placed: PlacedSection, s: number) {
  const heading = placed.section.coordinates.toWorld(s, 0, planSample).heading + placed.rotation;
  const grade = placed.section.height.sampleDifferential(s, gradeSample).dYdS;
  const n = Math.hypot(1, grade);
  return {
    across: [Math.cos(heading), 0, -Math.sin(heading)],
    along: [Math.sin(heading) / n, grade / n, Math.cos(heading) / n],
  };
}
const planSample = createPlanCoordinateSample(),
  gradeSample = { y: 0, dYdS: 0 };

export function buildBoards(
  layout: CourseLayout,
  document: CourseDocument | null,
  displayWidth: number,
): {
  meshes: BoardMeshes;
  records: BoardRecord[];
  slots: LevelSlot[];
  textures: BoardTextures;
  outlines: LineBuilder;
  anchors: LineBuilder;
} {
  const atlas = new Atlas();
  const levelRows: number[] = [];
  const frames = new Map<object, number>();
  /** A picture's (or a shadow's) levels in the atlas: its level table row. */
  const placeFrames = (key: object, levels: readonly SpriteFrame[]) => {
    let row = frames.get(key);
    if (row !== undefined) return row;
    row = levelRows.length / (LEVEL_TABLE_WIDTH * 4);
    const cells = new Array<number>(LEVEL_TABLE_WIDTH * 4).fill(0);
    levels.forEach((frame, k) => {
      const entry = atlas.place(frame);
      cells.splice(8 * k, 8, entry.x, entry.y, entry.page, 0, frame.width, frame.height, 0, 0);
    });
    levelRows.push(...cells);
    frames.set(key, row);
    return row;
  };
  const paletteRows: number[] = [];
  const paletteIndex = new Map<SpriteLodAsset, Map<string, number>>();
  /** The first of a picture's palette rows in a named palette, one row a level. */
  const paletteOf = (image: SpriteLodAsset, name: string) => {
    let byName = paletteIndex.get(image);
    if (!byName) paletteIndex.set(image, (byName = new Map()));
    let row = byName.get(name);
    if (row === undefined) {
      row = paletteRows.length / 64;
      for (const level of createSpritePalette(image, name).levels)
        for (const color of level.paletteRgb555) paletteRows.push(...rgb555Bytes(color));
      byName.set(name, row);
    }
    return row;
  };
  const meshes: BoardMeshes = {
    standing: new BoardBuilder(),
    lying: new BoardBuilder(),
    bandStanding: new BoardBuilder(),
    bandLying: new BoardBuilder(),
    movableStanding: new BoardBuilder(),
    movableLying: new BoardBuilder(),
    shadows: new BoardBuilder(),
  };
  const records: BoardRecord[] = [];
  const slots: LevelSlot[] = [];
  const outlines = new LineBuilder(),
    anchors = new LineBuilder();
  const slab: StripSlabTarget = { start: 0, end: 0, colors: [], edges: [] };
  const up = [0, 1, 0];
  for (const placed of layout.sections) {
    const section = placed.section;
    // How each placement is written, from the authored document: its leaf in the Section's expansion.
    const leaves = document
      ? [
          ...courseElementLeaves(
            document.sections[placed.index]!.sprites,
            `/sections/${placed.index}/sprites`,
            expansionWork(Infinity),
          ),
        ]
      : [];
    section.appearance.sprites.forEach((sprite, index) => {
      // A state-selected sign shows by its fork's choice; the map's Route takes each fork's first exit.
      if (sprite.unselectedLink !== null) {
        const next = layout.route[placed.occurrence.ordinal + 1];
        if (!next || next.incoming?.id === sprite.unselectedLink) return;
      }
      const image = sprite.instance.asset.image;
      const level = image.levels[0]!;
      const leaf = leaves[index] ?? null;
      const form: BoardForm | null = !leaf
        ? null
        : leaf.copies.length
          ? leaf.copies.every((copy) => copy.index === 0)
            ? 'original'
            : 'copy'
          : typeof leaf.element.lateral === 'number'
            ? 'absolute'
            : 'reference';
      const movable = sprite.knocked !== null;
      const s = sprite.at.s,
        l = sprite.l;
      // The base point: the game's own placement of a course picture, carried to the world by the occurrence.
      const native = compileCourseSprite(section, section.height, {
        name: image.name,
        s,
        l,
        groundOffset: sprite.groundOffset,
        asset: image,
      });
      const world = transformPlanarPoint(placed.worldFromSection, native);
      const base = [world.x - layout.origin.x, native.y, world.z - layout.origin.z];
      const table = placeFrames(image, image.levels);
      const palette = paletteOf(image, sprite.instance.palette);
      const fold = level.anchorY + 0.5;
      const tint = form ? [...FORM_COLORS[form], 255] : [0, 0, 0, 0];
      const planes = boardPlanes(placed, s);
      // Facing the coming cars: toward −s.
      const facing = [planes.across[2]!, 0, -planes.across[0]!];
      const quads: BoardRecord['quads'] = [];
      // A picture takes its level at its base point; each repetition of a band at its own centre, below.
      const slot = (point: readonly number[]) => slots.push({ image, point }) - 1;
      const pictureSlot = image.extend ? -1 : slot(base);
      // Master texel (u, v) of the repetition `offset` metres across: standing above the fold, lying below it.
      const point = (offset: number, u: number, v: number, lying: boolean) => {
        const across = offset + (u - level.anchorX - 0.5) / TEXELS;
        const p = [base[0]! + across * planes.across[0]!, base[1]!, base[2]! + across * planes.across[2]!];
        if (!lying) p[1] = p[1]! + (fold - v) / TEXELS;
        else for (let c = 0; c < 3; c++) p[c] = p[c]! - ((v - fold) / TEXELS) * planes.along[c]!;
        return p;
      };
      const quad = (
        target: BoardBuilder,
        corners: number[][],
        texels: number[],
        lying: boolean,
        boardIndex: number,
      ) => {
        for (const i of [0, 1, 2, 2, 1, 3])
          target.vertex(
            corners[i]!,
            texels[2 * i]!,
            texels[2 * i + 1]!,
            table,
            palette,
            boardIndex,
            lying ? up : facing,
            tint,
          );
        quads.push({ corners: corners.flat(), texels, lying });
      };
      // A band's repetitions: from the picture toward the side it names, to the drawn ground's edge at its station.
      const copies = [{ offset: 0, width: level.width }];
      if (image.extend) {
        const side = image.extend === 'right' ? 1 : -1;
        const period = spriteRepeatPeriodMeters(image);
        const edge = groundEdge(placed, s, displayWidth, side, slab);
        const near = side > 0 ? (level.width - level.anchorX - 0.5) / TEXELS : (level.anchorX + 0.5) / TEXELS;
        for (let k = 1; k < 100000; k++) {
          const start = l + side * (near + (k - 1) * period);
          const room = (edge - start) * side;
          if (room <= 0) break;
          copies.push({ offset: side * k * period, width: Math.min(level.width, room * TEXELS) });
          if (room < period) break;
        }
      }
      copies.forEach((copy, k) => {
        // A left band's partial copy keeps its right part, nearer the picture.
        const u0 = image.extend === 'left' && k ? level.width - copy.width : 0,
          u1 = image.extend === 'left' || !k ? level.width : copy.width;
        // A repetition is one board at one depth: its centre, across what it shows and up the picture as it stands.
        const across = copy.offset + ((u0 + u1) / 2 - level.anchorX - 0.5) / TEXELS;
        const board = image.extend
          ? slot([
              base[0]! + across * planes.across[0]!,
              base[1]! + (fold - level.height / 2) / TEXELS,
              base[2]! + across * planes.across[2]!,
            ])
          : pictureSlot;
        const standing = movable ? meshes.movableStanding : k ? meshes.bandStanding : meshes.standing,
          lying = movable ? meshes.movableLying : k ? meshes.bandLying : meshes.lying;
        // The rows on and above the anchor stand.
        if (fold > 0) {
          const v1 = Math.min(level.height, fold);
          const corners = [
            point(copy.offset, u0, 0, false),
            point(copy.offset, u1, 0, false),
            point(copy.offset, u0, v1, false),
            point(copy.offset, u1, v1, false),
          ];
          quad(standing, corners, [u0, 0, u1, 0, u0, v1, u1, v1], false, board);
          outlines.segment(corners[0]!, corners[1]!, OUTLINE);
          outlines.segment(corners[0]!, corners[2]!, OUTLINE);
          outlines.segment(corners[1]!, corners[3]!, OUTLINE);
          outlines.segment(corners[2]!, corners[3]!, spriteFolds(image) ? FOLD : OUTLINE);
        }
        // The rows below it lie, folded toward −s.
        if (spriteFolds(image)) {
          const v0 = Math.max(0, fold);
          const corners = [
            point(copy.offset, u0, v0, true),
            point(copy.offset, u1, v0, true),
            point(copy.offset, u0, level.height, true),
            point(copy.offset, u1, level.height, true),
          ];
          quad(lying, corners, [u0, v0, u1, v0, u0, level.height, u1, level.height], true, board);
          outlines.segment(corners[0]!, corners[2]!, OUTLINE);
          outlines.segment(corners[1]!, corners[3]!, OUTLINE);
          outlines.segment(corners[2]!, corners[3]!, OUTLINE);
          if (fold <= 0) outlines.segment(corners[0]!, corners[1]!, OUTLINE);
        }
      });
      // The anchor, the picture's base point: a small cross.
      for (let axis = 0; axis < 3; axis++) {
        const a = [...base],
          b = [...base];
        a[axis] = a[axis]! - 0.3;
        b[axis] = b[axis]! + 0.3;
        anchors.segment(a, b, FOLD);
      }
      // A movable object's shadow: its anchor on the road beneath the base point, flat on the lying plane, up toward +s.
      if (movable && level.shadow) {
        const shadows = image.levels.map((each) => each.shadow!);
        const shadowTable = placeFrames(shadows, shadows);
        const shadow = level.shadow;
        const road = [base[0]!, section.height.sample(s), base[2]!];
        const at = (u: number, v: number) => {
          const across = (u - shadow.anchorX - 0.5) / TEXELS,
            ahead = (shadow.anchorY + 0.5 - v) / TEXELS;
          return road.map((c, i) => c + across * planes.across[i]! + ahead * planes.along[i]!);
        };
        const corners = [at(0, 0), at(shadow.width, 0), at(0, shadow.height), at(shadow.width, shadow.height)];
        const texels = [0, 0, shadow.width, 0, 0, shadow.height, shadow.width, shadow.height];
        for (const i of [0, 1, 2, 2, 1, 3])
          meshes.shadows.vertex(
            corners[i]!,
            texels[2 * i]!,
            texels[2 * i + 1]!,
            shadowTable,
            0,
            pictureSlot,
            up,
            [0, 0, 0, 0],
          );
      }
      records.push({
        placed,
        index,
        leaf,
        image,
        palette: sprite.instance.palette,
        s,
        l,
        groundOffset: sprite.groundOffset,
        base,
        movable,
        form,
        copies,
        quads,
      });
    });
  }
  return {
    meshes,
    records,
    slots,
    textures: {
      size: ATLAS_SIZE,
      pages: atlas.pages,
      levels: new Uint16Array(levelRows),
      palettes: new Uint8Array(paletteRows),
    },
    outlines,
    anchors,
  };
}

/**
 * Each board's level this frame, by the game's nearest-octave rule (`selectSpriteLevel`) for its scale at its point:
 * `focal` device pixels over its depth along the view, or, in a parallel view, over the view's distance.
 */
export function boardLevels(
  slots: readonly LevelSlot[],
  eye: readonly number[],
  forward: readonly number[],
  focal: number,
  parallelDistance: number | null,
  out: Uint8Array,
): void {
  for (let i = 0; i < slots.length; i++) {
    const { image, point } = slots[i]!;
    const depth =
      parallelDistance ??
      (point[0]! - eye[0]!) * forward[0]! + (point[1]! - eye[1]!) * forward[1]! + (point[2]! - eye[2]!) * forward[2]!;
    out[i] = depth > 0 ? selectSpriteLevel(image, focal / depth) : 0;
  }
}
