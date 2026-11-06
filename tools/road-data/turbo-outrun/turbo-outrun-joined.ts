/**
 * TURBO OUTRUN's things of several pieces ([Things of several
 * pieces](../../../docs/original-road-data.md#things-of-several-pieces), [TURBO OUTRUN road
 * data](../../../docs/turbo-outrun-road-data.md#things-of-several-pieces)): its placements' pieces joined into one picture
 * each, named as met across its legs, and the pictures built from the ROMs' pixels once every leg is laid.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import {
  bandOrder,
  croppedPieces,
  joinedColors,
  joinPlan,
  layPieces,
  shownPaletteName,
  type JoinPiece,
  type Laid,
  type RoadPlan,
} from '../shared/joined-pictures.js';
import {
  boardColors,
  coloredColumns,
  namedBoardMaster,
  paletteName,
  texelsAPixel,
  turned,
} from '../shared/pixel-grid.js';
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
import { pictureName, type PictureUse } from './turbo-outrun-boards.js';
import type { PlacedObject } from './turbo-outrun-objects.js';
import { readShadowSize, readSizeList, readSpritePalette } from './turbo-outrun-sprites.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

/** A placement as a piece: the piece, its placement, its original's id, and its body (metres) or none. */
interface Placed {
  readonly piece: JoinPiece;
  readonly placement: PlacedObject;
  readonly id: string;
  readonly body: number | null;
}

/** One arrangement of pieces, named: its pieces (drawing order) and the palette combinations it is drawn in. */
interface Arrangement {
  readonly name: string;
  readonly pieces: readonly Placed[];
  readonly combinations: Map<string, readonly number[]>;
  /** How many placements it stands as, over every leg. */
  placed: number;
  /** The arrangement it is the exact reflection of, and which of its pieces each of this one's reflects. */
  readonly mirrors?: { readonly of: Arrangement; readonly pieces: readonly number[] };
}

/** A use's base point across, its picture's pixels from its left edge: its anchor's, `aside` across. */
const pointX = (use: PictureUse, width: number) =>
  anchorPoint(use.anchor, width, 0, OUTRUN_SPRITES).x + use.aside / use.units;

/**
 * TURBO OUTRUN's joining across its legs: planned over every leg (`plan`), then joined leg by leg (`joinLeg`, a course
 * position `metres` metres), then its pictures (`pictures`).
 */
export function turboOutrunJoining(main: Uint8Array, words: Uint32Array, metres: number) {
  const arrangements = new Map<string, Arrangement>();
  const named = new Set<string>();
  const extents = new Map<string, readonly [number, number]>();
  const pieceNames = new Set<string>();
  const largest = (use: PictureUse) => readSizeList(main, use.sizes, 1)[0]!;

  /** A placement's piece, as `layPieces` and `joinPlan` read it. */
  const placedPiece = (o: PlacedObject): Placed => {
    const { use } = o;
    const size = largest(use);
    const pixels = spritePixels(words, size, OUTRUN_SPRITES);
    const pixel = use.units * UNIT_METRES;
    // Its bottom edge below its base point's height by its anchor down (top, bottom or middle).
    const anchorY = anchorPoint(use.anchor & 12, size.width, size.height, OUTRUN_SPRITES).y;
    const bottom = o.height - (size.height - (anchorY + 0.5)) * pixel * PIXEL_ASPECT;
    return {
      piece: {
        unit: o.unit ?? '',
        s: o.g * metres,
        pixels: {
          width: size.width,
          height: size.height,
          pixels: Uint8Array.from(turned(pixels, size.width, use.mirrored)),
        },
        pixel,
        aspect: PIXEL_ASPECT,
        left: o.x - (pointX(use, size.width) + 0.5) * pixel,
        bottom,
        floats: floats(o.height / (UNIT_METRES * PIXEL_ASPECT), use.units),
        joins: o.unit !== undefined && !use.strip && !o.lies,
        order: o.order,
      },
      placement: o,
      id: use.sizes.toString(16).padStart(5, '0'),
      // As wide as its hit extents, at most its picture's colored columns.
      body: o.body === null ? null : Math.min(o.body, coloredColumns(pixels, size.width, SHADOW_PEN) * pixel),
    };
  };

  /** An arrangement's key: its pieces (id, scale, mirroring, shading, shadow) at their laid places. */
  const keyOf = (pieces: readonly Placed[], laid: Laid, mirrored = false) =>
    JSON.stringify(
      pieces.map((p, k) => {
        const { x, y, times } = laid.places[k]!;
        const w = p.piece.pixels.width * times;
        const { use } = p.placement;
        return [
          p.id,
          use.units,
          use.mirrored !== mirrored,
          use.shades,
          use.shadow,
          (mirrored ? -1 : 1) * use.aside,
          mirrored ? laid.width - x - w : x,
          y,
          times,
        ];
      }),
    );

  /** A combination's palettes in the order of the pieces its picture is drawn from: a reflection's, the reflected's. */
  const ownOrder = (a: Arrangement, palettes: readonly number[]) =>
    a.mirrors ? a.mirrors.of.pieces.map((_, i) => palettes[a.mirrors!.pieces.indexOf(i)]!) : palettes;

  /** An arrangement's reflection's key. */
  const mirrorKey = (a: Arrangement) => keyOf(a.pieces, layPieces(a.pieces.map((p) => p.piece)));

  /** Which of `of`'s pieces each of `pieces`' reflects: the one of its id at the reflected place. */
  const reflectedPieces = (of: Arrangement, pieces: readonly Placed[]) => {
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

  // The plan over every leg ([Things of several pieces](../../../docs/original-road-data.md#things-of-several-pieces)),
  // a piece its size list, mirrored or not.
  const planId = (p: Placed) => `${p.id}${p.placement.use.mirrored ? '-mirrored' : ''}`;
  let plans: RoadPlan[] = [];
  const plan = (legs: readonly (readonly PlacedObject[])[]) => {
    const placed = legs.map((placements) => placements.map(placedPiece));
    plans = joinPlan(placed.map((leg) => leg.map((p) => ({ ...p.piece, id: planId(p) }))));
    return plans.map((p, l) => {
      const named = (thing: readonly number[]) => thing.map((k) => planId(placed[l]![k]!));
      return {
        baked: p.baked.map(named),
        bands: p.bands.map(named),
        kept: p.kept.map((t) => ({ pieces: named(t.pieces), reused: t.reused })),
      };
    });
  };

  /**
   * Leg `leg`'s placements by the plan: its things baked whole and its bands each one placement, written where its
   * first piece in the document is (the nearest, of pieces as near the first drawn), at its outer edges' middle,
   * standing where a piece stands, else at its lowest colored row's height, its pieces' bodies its parts, its picture
   * named as first met (`toutrun-joined-<size list>`, a reflection `-mirrored`, another arrangement of one name `-2`
   * on); the pieces of its kept things as they are, each floating piece and band lowered as the most lowered standing
   * piece it rests on is drawn (`lower`, metres), a band drawn among them between the pieces the original draws under
   * and over it (`bandOrder`). With each joined thing's pieces' course positions, for the Sections' check.
   */
  const unlayered: string[] = [];
  const joinLeg = (leg: number, placements: readonly PlacedObject[], lower: (o: PlacedObject) => number) => {
    const plan = plans[leg]!;
    const placed = placements.map(placedPiece);
    const things = [...plan.baked, ...plan.bands];
    const joined = new Set(things.flat());
    const lowered = (k: number) => Math.max(0, ...(plan.restsOn.get(k) ?? []).map((n) => lower(placements[n]!)));
    const out: PlacedObject[] = placements.flatMap((o, k) =>
      joined.has(k) ? [] : [lowered(k) ? { ...o, height: o.height - lowered(k) } : o],
    );
    const spans: (readonly [number, number])[] = [];
    for (const thing of things) {
      const members = thing.map((k) => placed[k]!);
      const laid = layPieces(members.map((m) => m.piece));
      const key = keyOf(members, laid);
      let arrangement = arrangements.get(key);
      if (!arrangement) {
        // Named as first met: the exact reflection of one named before is its `-mirrored`.
        const reflected = [...arrangements.values()].find(
          (a) => !a.mirrors && keyOf(members, laid, true) === mirrorKey(a),
        );
        const stem = `toutrun-joined-${members[0]!.id}`;
        let name = reflected ? `${reflected.name}-mirrored` : stem;
        for (let n = 2; !reflected && named.has(name); n++) name = `${stem}-${n}`;
        named.add(name);
        arrangement = {
          name,
          pieces: members,
          combinations: new Map(),
          placed: 0,
          ...(reflected ? { mirrors: { of: reflected, pieces: reflectedPieces(reflected, members) } } : {}),
        };
        arrangements.set(key, arrangement);
        for (const m of members) pieceNames.add(pictureName(m.placement.use));
      }
      const palettes = members.map((m) => m.placement.use.palette);
      arrangement.combinations.set(JSON.stringify(palettes), palettes);
      arrangement.placed++;
      const crop = croppedPieces(laid);
      const middle = crop.left + (crop.width * crop.fine) / 2;
      const stands = members.some((m) => !m.piece.floats);
      const columns = Math.max(1, Math.round(crop.width * texelsAPixel(crop.fine, PIXEL_ASPECT).across));
      extents.set(arrangement.name, [-columns / 80, columns / 80]);
      const first = members.reduce((a, b) =>
        b.placement.g < a.placement.g || (b.placement.g === a.placement.g && b.placement.order < a.placement.order)
          ? b
          : a,
      );
      spans.push([Math.min(...members.map((m) => m.placement.g)), Math.max(...members.map((m) => m.placement.g))]);
      // A band among its kept thing's pieces: at an order between those drawn under it and those over it.
      const kept = plan.bands.includes(thing) ? plan.kept.find((t) => t.pieces.includes(thing[0]!)) : undefined;
      const order = kept ? bandOrder(thing, kept, (k) => placements[k]!.order) : null;
      if (kept && order === null) unlayered.push(members.map(planId).join('+'));
      out.push({
        ...first.placement,
        ...(order === null ? {} : { order }),
        x: middle,
        height: (stands ? 0 : crop.top - crop.height * crop.fine * crop.aspect) - lowered(thing[0]!),
        body: null,
        joined: {
          image: arrangement.name,
          // Its palette's name as its picture names it: its shown pieces' in its drawing order, a reflection's as the
          // one it reflects is drawn.
          palette: arrangement.mirrors
            ? shownPaletteName(
                layPieces(arrangement.mirrors.of.pieces.map((p) => p.piece)).owner,
                ownOrder(arrangement, palettes).map(paletteName),
              )
            : shownPaletteName(laid.owner, palettes.map(paletteName)),
          // Each piece's body, at most as wide as the picture, whose columns its chosen lines may make a little
          // narrower than its colored pixels.
          parts: members.flatMap((m) =>
            m.body === null ? [] : [{ across: m.placement.x - middle, width: Math.min(m.body, columns / 40) }],
          ),
        },
      });
    }
    return { placed: out, spans };
  };

  /**
   * Each arrangement's picture: its pieces laid at the original's own size and cropped, its colors their (piece, pen)
   * pairs in every combination it is drawn in (`joinedColors`), through the sprites' rules once, each piece's pen 10
   * a shadow where it is drawn with shadows allowed, each shadowed piece's own shadow picture (0x2667A) laid at its base
   * point; a reflection its arrangement's picture mirrored. With what the report says of it.
   */
  const pictures = () => {
    const table = spriteTable();
    const castSize = readShadowSize(main);
    const cast = outline(spritePixels(words, castSize, OUTRUN_SPRITES), castSize.width);
    const build = (a: Arrangement, combinations: readonly (readonly number[])[]) => {
      for (const p of a.pieces)
        if (typeof table.get(tableKey(pictureName(p.placement.use)))?.base === 'number')
          throw contractUnmet(`${a.name}'s piece ${p.id} has a base in K's table`);
      const laid = croppedPieces(layPieces(a.pieces.map((p) => p.piece)));
      const colors = joinedColors(
        laid,
        a.pieces.map((_, k) =>
          combinations.map((palettes) => ({
            name: paletteName(palettes[k]!),
            colors: boardColors(readSpritePalette(main, palettes[k]!).rgb555),
          })),
        ),
      );
      const marks = {
        pens: laid.pens,
        owner: laid.owner,
        pieces: a.pieces.map((p) => ({
          shadowPen: p.placement.use.shades ? SHADOW_PEN : undefined,
          entry: table.get(tableKey(pictureName(p.placement.use))),
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
      // Each shadowed piece's own shadow picture at its base point, on the ground.
      let shadow: ShadowFrame | undefined = paintedShadow(grid, point, false);
      a.pieces.forEach((p, k) => {
        const { use } = p.placement;
        if (!use.shadow) return;
        const times = laid.places[k]!.times;
        const frame = shadowFrame(
          cast,
          castSize.width,
          { x: scale.x * times, y: scale.y * times },
          use.anchor,
          -use.aside / use.units,
          OUTRUN_SPRITES,
        );
        const at = (laid.places[k]!.x + (pointX(use, p.piece.pixels.width) + 0.5) * times) * scale.x - 0.5;
        shadow = unionFrames(shadow, { ...frame, anchorX: frame.anchorX - (at - point.x) });
      });
      return { grid, point, shadow, colors, laid };
    };
    return [...arrangements.values()].map((a) => {
      const own = a.mirrors?.of ?? a;
      const combinations = [...a.combinations.values()].map((palettes) => ownOrder(a, palettes));
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
          pieces: a.pieces.map((p) => `${p.id}${p.placement.use.units === 2 ? '' : `-u${p.placement.use.units}`}`),
          placements: a.placed,
          texels: [made.grid.width, made.grid.height],
          colors: made.colors.distinct,
          replaced: Math.round(made.colors.replaced * 1000) / 1000,
          parts: a.pieces.filter((p) => p.body !== null).length,
          rounded: made.laid.places.flatMap((place, k) =>
            place.off[0] || place.off[1] ? [{ piece: a.pieces[k]!.id, off: place.off }] : [],
          ),
        },
      };
    });
  };

  return {
    plan,
    joinLeg,
    pictures,
    /** The bands whose layering among their kept things' pieces the original's cannot be kept. */
    unlayered: () => [...new Set(unlayered)],
    /** The joined pictures' extents across, metres, by name. */
    extents,
    /** The pieces' pictures' names a joined picture draws. */
    pieces: () => [...pieceNames],
  };
}
