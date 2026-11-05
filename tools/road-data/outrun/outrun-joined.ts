/**
 * OUTRUN's things of several pieces ([Things of several
 * pieces](../../../docs/original-road-data.md#things-of-several-pieces), [OUTRUN road
 * data](../../../docs/outrun-road-data.md#things-of-several-pieces)): its placements' pieces joined into one picture
 * each, named as met across its roads, and the pictures built from the ROMs' pixels once every road is laid.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import {
  croppedPieces,
  joinedColors,
  joinedThings,
  layPieces,
  type JoinPiece,
  type Laid,
} from '../shared/joined-pictures.js';
import { boardColors, namedBoardMaster, paletteName, texelsAPixel, turned } from '../shared/pixel-grid.js';
import {
  floats,
  paintedShadow,
  partsOnGrid,
  pictureParts,
  spriteTable,
  tableKey,
  unionFrames,
  type ShadowFrame,
} from '../shared/sprite-rules.js';
import { PIXEL_ASPECT, SHADOW_PEN } from '../sega-16/display.js';
import { anchorPoint, outline, OUTRUN_SPRITES, shadowFrame, spritePixels } from '../sega-16/sprite-pixels.js';
import { UNIT_METRES } from '../out-run-hardware/constants.js';
import { boardName, standsByEdge } from './outrun-boards.js';
import type { ObjectPlacement } from './outrun-scenery.js';
import {
  OBJECT_ROUTINES,
  objectAside,
  objectSize,
  routineFamily,
  routinePixelUnits,
  shadowSizes,
  spritePalette,
} from './outrun-sprites.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

/** A placement as a piece: the piece, its original's id, and its base point's lateral and body (metres). */
interface Placed {
  readonly piece: JoinPiece;
  readonly placement: ObjectPlacement;
  readonly id: string;
  readonly point: number;
  readonly body: number | null;
}

/** A piece of a joined arrangement: its use, its id, and its laid place's key. */
interface ArrangedPiece {
  readonly piece: JoinPiece;
  readonly placement: ObjectPlacement;
  readonly id: string;
}

/** One arrangement of pieces, named: its pieces (drawing order) and the palette combinations it is drawn in. */
interface Arrangement {
  readonly name: string;
  readonly pieces: readonly ArrangedPiece[];
  readonly combinations: Map<string, readonly number[]>;
  /** How many placements it stands as, over every road. */
  placed: number;
  /** The arrangement it is the exact reflection of, and which of its pieces each of this one's reflects. */
  readonly mirrors?: { readonly of: Arrangement; readonly pieces: readonly number[] };
}

/** OUTRUN's joining across its roads (`joinRoad`), then its pictures (`pictures`). */
export function outrunJoining(
  main: Uint8Array,
  words: Uint32Array,
  metresAPosition: number,
  colored: (placement: ObjectPlacement) => number,
) {
  const arrangements = new Map<string, Arrangement>();
  const named = new Set<string>();
  const extents = new Map<string, readonly [number, number]>();
  const pieceNames = new Set<string>();

  /** A placement's piece, as `layPieces` and `joinedThings` read it. */
  const placedPiece = (o: ObjectPlacement): Placed => {
    const { use } = o;
    const pixelUnits = routinePixelUnits(main, use.routine);
    const size = objectSize(main, use);
    const pens = turned([...spritePixels(words, size, OUTRUN_SPRITES)], size.width, use.mirrored);
    const byEdge = standsByEdge(main, use);
    // The board's base point, sprite pixels from its left edge, as the board stands it.
    const pointX = byEdge
      ? anchorPoint(use.anchor, size.width, 0, OUTRUN_SPRITES).x
      : anchorPoint(use.anchor & 12, size.width, 0, OUTRUN_SPRITES).x + objectAside(main, use) / pixelUnits;
    // Its bottom edge below its anchor's height by the anchor's byte (top, bottom or middle).
    const anchorY = anchorPoint(use.anchor & 12, size.width, size.height, OUTRUN_SPRITES).y;
    const bottom = o.y / pixelUnits - (size.height - (anchorY + 0.5));
    const id = tableKey(boardName(main, { ...use, mirrored: false, shadow: false })).replace(/^outrun-/, '');
    return {
      piece: {
        unit: o.unit,
        s: o.position * metresAPosition,
        pixels: { width: size.width, height: size.height, pixels: Uint8Array.from(pens) },
        pixel: pixelUnits * UNIT_METRES,
        aspect: PIXEL_ASPECT,
        left: (o.x - (pointX + 0.5) * pixelUnits) * UNIT_METRES,
        bottom: bottom * pixelUnits * UNIT_METRES * PIXEL_ASPECT,
        floats: floats(o.y, pixelUnits),
        joins: routineFamily(main, use.routine) === undefined && OBJECT_ROUTINES.get(use.routine)?.lies === undefined,
        order: o.order,
      },
      placement: o,
      id,
      point: o.x * UNIT_METRES,
      body: o.hit === null ? null : Math.min(o.hit * UNIT_METRES, colored(o)),
    };
  };

  /** An arrangement's key: its pieces (id, mirroring, shading, shadow) at their laid places. */
  const keyOf = (pieces: readonly ArrangedPiece[], laid: Laid, mirrored = false) =>
    JSON.stringify(
      pieces.map((p, k) => {
        const { x, y, times } = laid.places[k]!;
        const w = p.piece.pixels.width * times;
        return [
          p.id,
          p.placement.use.mirrored !== mirrored,
          p.placement.use.shadows,
          p.placement.use.shadow,
          mirrored ? laid.width - x - w : x,
          y,
          times,
        ];
      }),
    );

  /**
   * One road's placements with its things of several pieces joined: each thing one placement at its nearest piece's
   * station and its outer edges' middle, standing where a piece stands, else at its lowest colored row's height, its
   * pieces' bodies its parts, its picture named as first met (`<original>-joined-<id>`, a reflection `-mirrored`,
   * another arrangement of one name `-2` on).
   */
  const joinRoad = (placements: readonly ObjectPlacement[]): ObjectPlacement[] => {
    const placed = placements.map(placedPiece);
    const things = joinedThings(placed.map((p) => p.piece));
    const joined = new Set(things.flat());
    const out: ObjectPlacement[] = placements.filter((_, k) => !joined.has(k));
    for (const thing of things) {
      const members = thing.map((k) => placed[k]!);
      const pieces = members.map(({ piece, placement, id }) => ({ piece, placement, id }));
      const laid = layPieces(members.map((m) => m.piece));
      const key = keyOf(pieces, laid);
      let arrangement = arrangements.get(key);
      if (!arrangement) {
        // Named as first met: the exact reflection of one named before is its `-mirrored`.
        const reflected = [...arrangements.values()].find(
          (a) => !a.mirrors && keyOf(pieces, laid, true) === mirrorKey(a),
        );
        const stem = `outrun-joined-${pieces[0]!.id}`;
        let name = reflected ? `${reflected.name}-mirrored` : stem;
        for (let n = 2; !reflected && named.has(name); n++) name = `${stem}-${n}`;
        named.add(name);
        arrangement = {
          name,
          pieces,
          combinations: new Map(),
          placed: 0,
          ...(reflected ? { mirrors: { of: reflected, pieces: reflectedPieces(reflected, pieces) } } : {}),
        };
        arrangements.set(key, arrangement);
        for (const p of pieces) pieceNames.add(boardName(main, p.placement.use));
      }
      const palettes = members.map((m) => m.placement.use.palette);
      arrangement.combinations.set(JSON.stringify(palettes), palettes);
      arrangement.placed++;
      // Its place: its outer edges' middle; standing where a piece stands, else its lowest colored row's height.
      const crop = croppedPieces(laid);
      const middle = crop.left + (crop.width * crop.fine) / 2;
      const stands = members.some((m) => !m.piece.floats);
      const height = stands ? 0 : crop.top - crop.height * crop.fine * crop.aspect;
      const columns = Math.max(1, Math.round(crop.width * texelsAPixel(crop.fine, PIXEL_ASPECT).across));
      extents.set(arrangement.name, [-columns / 80, columns / 80]);
      const nearest = members.reduce((a, b) => (b.placement.position < a.placement.position ? b : a));
      const parts = members.flatMap((m) => (m.body === null ? [] : [{ across: m.point - middle, width: m.body }]));
      out.push({
        ...nearest.placement,
        x: middle / UNIT_METRES,
        y: height / (UNIT_METRES * PIXEL_ASPECT),
        image: arrangement.name,
        palette: [...new Set(members.map((m) => paletteName(m.placement.use.palette)))].join('+'),
        hit: null,
        ...(parts.length ? { parts } : {}),
      });
    }
    return out.sort((a, b) => a.position - b.position || a.x - b.x);
  };

  /** An arrangement's reflection's key. */
  const mirrorKey = (a: Arrangement) => keyOf(a.pieces, layPieces(a.pieces.map((p) => p.piece)));

  /** Which of `of`'s pieces each of `pieces`' reflects: the one of its id at the reflected place. */
  const reflectedPieces = (of: Arrangement, pieces: readonly ArrangedPiece[]) => {
    const laid = layPieces(pieces.map((p) => p.piece));
    const theirs = layPieces(of.pieces.map((p) => p.piece));
    return pieces.map((p, k) => {
      const w = p.piece.pixels.width * laid.places[k]!.times;
      const x = laid.width - laid.places[k]!.x - w;
      const j = of.pieces.findIndex(
        (q, i) => q.id === p.id && theirs.places[i]!.x === x && theirs.places[i]!.y === laid.places[k]!.y,
      );
      if (j < 0) throw new Error(`A reflected arrangement's piece ${p.id} has no counterpart`);
      return j;
    });
  };

  /** The shadow size list's outline at `address` (the scenery's, or a routine's own). */
  const shadowOf = (address: number | undefined) => {
    const size = shadowSizes(main, address)[0]!;
    return { width: size.width, pixels: outline(spritePixels(words, size, OUTRUN_SPRITES), size.width) };
  };

  /**
   * Each arrangement's picture: its pieces laid at the original's own size and cropped, its colors their (piece, pen)
   * pairs in every combination it is drawn in (`joinedColors`), through the sprites' rules once, each piece's pen 10
   * a shadow where it is drawn with shadows allowed, each piece's own shadow picture laid at its base point; a
   * reflection its arrangement's picture mirrored. With what the report says of it.
   */
  const pictures = () => {
    const table = spriteTable();
    const build = (a: Arrangement, combinations: readonly (readonly number[])[]) => {
      for (const p of a.pieces)
        if (typeof table.get(tableKey(boardName(main, p.placement.use)))?.base === 'number')
          throw contractUnmet(`${a.name}'s piece ${p.id} has a base in K's table`);
      const laid = croppedPieces(layPieces(a.pieces.map((p) => p.piece)));
      const colors = joinedColors(
        laid,
        a.pieces.map((_, k) =>
          combinations.map((palettes) => ({
            name: paletteName(palettes[k]!),
            colors: boardColors(spritePalette(main, palettes[k]!).slice(1)),
          })),
        ),
      );
      const marks = {
        pens: laid.pens,
        owner: laid.owner,
        pieces: a.pieces.map((p) => ({
          shadowPen: p.placement.use.shadows ? SHADOW_PEN : undefined,
          entry: table.get(tableKey(boardName(main, p.placement.use))),
        })),
      };
      const texels = texelsAPixel(laid.fine, PIXEL_ASPECT);
      const grid = partsOnGrid(
        colors.picture,
        pictureParts(colors.picture, undefined, undefined, marks),
        texels.across,
        texels.down,
      );
      if (grid.width * grid.height > MASTER_TEXELS) throw contractUnmet(`${a.name} is larger than imageMasterTexels`);
      const point = { x: grid.width / 2 - 0.5, y: grid.anchorY };
      const scale = { x: grid.width / laid.width, y: grid.gridHeight / laid.height };
      // Each piece's own shadow picture at its base point, on the ground.
      let shadow: ShadowFrame | undefined = paintedShadow(grid, point, false);
      a.pieces.forEach((p, k) => {
        const { use } = p.placement;
        if (!use.shadow) return;
        const cast = shadowOf(use.cast?.sizes);
        const times = laid.places[k]!.times;
        const castScale = (use.cast?.scale ?? 1) * times;
        const pixelUnits = routinePixelUnits(main, use.routine);
        const byEdge = standsByEdge(main, use);
        const aside = byEdge ? 0 : objectAside(main, use) / pixelUnits;
        const frame = shadowFrame(
          cast.pixels,
          cast.width,
          { x: scale.x * castScale, y: scale.y * castScale },
          use.anchor & 12,
          (-aside / castScale) * times,
          OUTRUN_SPRITES,
        );
        // The piece's base point on the joined grid, texels.
        const width = p.piece.pixels.width;
        const pointX = byEdge
          ? anchorPoint(use.anchor, width, 0, OUTRUN_SPRITES).x
          : anchorPoint(use.anchor & 12, width, 0, OUTRUN_SPRITES).x + aside;
        const at = (laid.places[k]!.x + (pointX + 0.5) * times) * scale.x - 0.5;
        shadow = unionFrames(shadow, { ...frame, anchorX: frame.anchorX - (at - point.x) });
      });
      return { grid, point, shadow, colors, laid };
    };
    return [...arrangements.values()].map((a) => {
      const own = a.mirrors?.of ?? a;
      const combinations = [...a.combinations.values()].map((palettes) =>
        a.mirrors ? own.pieces.map((_, i) => palettes[a.mirrors!.pieces.indexOf(i)]!) : palettes,
      );
      const made = build(own, combinations);
      const mirrored = a.mirrors !== undefined;
      const indices = turned(made.grid.indices, made.grid.width, mirrored);
      const shadow = made.shadow && {
        ...made.shadow,
        ...(mirrored ? { anchorX: made.shadow.width - 1 - made.shadow.anchorX } : {}),
        levels: made.shadow.levels.map((level) => ({ indices: turned(level.indices, made.shadow!.width, mirrored) })),
      };
      const point = mirrored ? { ...made.point, x: made.grid.width - 1 - made.point.x } : made.point;
      const master = namedBoardMaster(
        a.name,
        made.grid,
        indices,
        point,
        made.colors.palettes,
        shadow ? { shadow } : {},
      );
      return {
        name: a.name,
        image: courseImageFile(master),
        report: {
          name: a.name,
          pieces: a.pieces.map((p) => p.id),
          placements: a.placed,
          texels: [made.grid.width, made.grid.height],
          colors: made.colors.distinct,
          replaced: Math.round(made.colors.replaced * 1000) / 1000,
          parts: a.pieces.filter((p) => p.placement.hit !== null).length,
          rounded: made.laid.places.flatMap((place, k) =>
            place.off[0] || place.off[1] ? [{ piece: a.pieces[k]!.id, off: place.off }] : [],
          ),
        },
      };
    });
  };

  return {
    joinRoad,
    pictures,
    /** The joined pictures' extents across, metres, by name. */
    extents,
    /** The pieces' pictures' names a joined picture draws. */
    pieces: () => [...pieceNames],
  };
}
