/**
 * SUPER HANG-ON's things of several pieces ([Things of several
 * pieces](../../../docs/original-road-data.md#things-of-several-pieces), [SUPER HANG-ON road
 * data](../../../docs/super-hang-on-road-data.md#things-of-several-pieces)): a gate's parts as one picture, laid at the
 * original's own size where its program places them where the bike's line draws them, named as met, built from the
 * ROMs' pixels once every course is laid.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import {
  bandOrder,
  croppedPieces,
  joinedColors,
  joinPlan,
  layPieces,
  type JoinPiece,
} from '../shared/joined-pictures.js';
import { boardColors, namedBoardMaster, paletteName, texelsAPixel, turned } from '../shared/pixel-grid.js';
import { floats, paintedShadow, partsOnGrid, pictureParts, spriteTable, tableKey } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT, SHADOW_PEN } from '../sega-16/display.js';
import { pictureName } from './super-hang-on-boards.js';
import {
  GATE_OBJECT,
  sizeList,
  spritePalette,
  spritePixels,
  type GateBringOut,
  type GatePart,
  type readGateBringOuts,
} from './super-hang-on-sprites.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

/** A gate's part as it comes out: its template, its object's number (27 on), its palette and its lift (road units). */
export interface ShownPart {
  readonly part: GatePart;
  readonly object: number;
  readonly palette: number;
  readonly lift: number;
}

/**
 * A gate's parts as `bringOut` shows them: each part's template, its object (27 on), its palette (the banner's the
 * bring-out's, the signal's lit as at GO) and its lift (road units, `gateLift` a part's lift unit).
 */
export const shownGateParts = (
  gates: readonly GatePart[],
  bringOuts: ReturnType<typeof readGateBringOuts>,
  { parts, banner, palette: shown }: GateBringOut,
  gateLift: number,
): ShownPart[] =>
  parts.map((k) => {
    const part = gates[k]!;
    const palette = k === banner ? shown : k === bringOuts.signal ? part.palette + bringOuts.lit : part.palette;
    return { part, object: GATE_OBJECT + k, palette, lift: part.lift * gateLift };
  });

/** One arrangement of a gate's parts, named: its parts (drawing order) and the palette combinations it is drawn in. */
interface Arrangement {
  readonly name: string;
  readonly parts: readonly ShownPart[];
  readonly pieces: readonly JoinPiece[];
  readonly combinations: Map<string, readonly number[]>;
  placed: number;
}

/**
 * SUPER HANG-ON's joining: `joinGate` a gate's parts as they come out, `pictures` the joined pictures. A part's pixel is
 * `pixel` metres; the program draws a part `x` × `row` / `nearest` pixels across and its lift × `row` / `lift` up, each
 * cut toward 0 (`divs`, `divu`), `row` the bike's line, where they are drawn at their largest size.
 */
export function superHangOnJoining(
  main: Uint8Array,
  words: Uint16Array,
  pixel: number,
  pixelUnits: number,
  draws: { readonly row: number; readonly nearest: number; readonly lift: number },
  original: {
    /** Each gate's parts as it comes out: START's, CHECK's and GOAL's. */
    readonly gates: readonly (readonly ShownPart[])[];
    /** Every other placement's picture (its name, mirrored or not) and whether it floats: the scenery, the crowd. */
    readonly others: readonly { readonly id: string; readonly floats: boolean }[];
    /** How much lower than the original a standing part is drawn, metres. */
    readonly lower: (part: ShownPart) => number;
  },
) {
  const arrangements = new Map<string, Arrangement>();
  const named = new Set<string>();
  const piecesNamed = new Set<string>();
  const nameOf = (part: ShownPart) => pictureName(main, { list: part.part.sprite, mirrored: part.part.mirrored });

  /** A part as a piece: its pixels as drawn, its left edge and bottom where the program draws it. */
  const pieceOf = (part: ShownPart, s: number): JoinPiece => {
    const { width, pixels } = spritePixels(words, sizeList(main, part.part.sprite)[0]!);
    const height = pixels.length / width;
    const across = Math.trunc((part.part.x * draws.row) / draws.nearest);
    const up = Math.trunc((part.part.lift * draws.row) / draws.lift);
    return {
      unit: 'gate',
      s,
      pixels: { width, height, pixels: Uint8Array.from(turned([...pixels], width, part.part.mirrored)) },
      pixel,
      aspect: PIXEL_ASPECT,
      left: (across - width / 2) * pixel,
      bottom: up * pixel * PIXEL_ASPECT,
      floats: floats(part.lift, pixelUnits),
      joins: true,
      order: part.object,
    };
  };

  // The plan over the original ([Things of several pieces](../../../docs/original-road-data.md#things-of-several-pieces)):
  // each gate's parts, and every other placement, which joins nothing; a piece is its picture's name, mirrored or not.
  const gateKey = (parts: readonly ShownPart[]) => JSON.stringify(parts.map((p) => p.object));
  const nothing = { width: 1, height: 1, pixels: new Uint8Array(1) };
  const plans = new Map(
    joinPlan([
      ...original.gates.map((parts) => parts.map((part) => ({ ...pieceOf(part, 0), id: nameOf(part) }))),
      original.others.map((o) => ({ ...pieceOf(original.gates[0]![0]!, 0), pixels: nothing, ...o, joins: false })),
    ])
      .slice(0, original.gates.length)
      .map((plan, k) => [gateKey(original.gates[k]!), plan]),
  );

  /**
   * A gate's parts at station `s` by the plan: its things baked whole and its bands, each its picture's name and
   * palette, its outer edges' middle (metres right of P), its height (metres: on the ground where a part stands, else its
   * lowest colored row's, lowered as the most lowered part it rests on is drawn) and its place in the gate's drawing
   * order (a band's between the parts the original draws under and over it, `bandOrder`); the parts left as they are,
   * each lowered so, in its object's order.
   */
  const joinGate = (parts: readonly ShownPart[], s: number) => {
    const pieces = parts.map((part) => pieceOf(part, s));
    const plan = plans.get(gateKey(parts));
    if (!plan) throw new Error('A gate comes out with parts the plan has not counted');
    const things = [...plan.baked, ...plan.bands];
    const joined = new Set(things.flat());
    const lowered = (k: number) => Math.max(0, ...(plan.restsOn.get(k) ?? []).map((n) => original.lower(parts[n]!)));
    const order = (k: number) => parts[k]!.object;
    const kept = (thing: readonly number[]) => plan.kept.find((t) => t.pieces.includes(thing[0]!));
    return {
      rest: parts.flatMap((part, k) => (joined.has(k) ? [] : [{ ...part, lower: lowered(k), order: order(k) }])),
      unlayered: plan.bands
        .filter((band) => bandOrder(band, kept(band)!, order) === null)
        .map((band) => band.map((k) => nameOf(parts[k]!))),
      kept: plan.kept.map((t) => ({ pieces: t.pieces.map((k) => nameOf(parts[k]!)), reused: t.reused })),
      things: things.map((thing) => {
        const members = thing.map((k) => parts[k]!);
        const laid = layPieces(thing.map((k) => pieces[k]!));
        const key = JSON.stringify(members.map((m, i) => [nameOf(m), laid.places[i]!.x, laid.places[i]!.y]));
        let arrangement = arrangements.get(key);
        if (!arrangement) {
          const stem = `shangon-joined-${tableKey(nameOf(members[0]!)).replace(/^shangon-/, '')}`;
          let name = stem;
          for (let n = 2; named.has(name); n++) name = `${stem}-${n}`;
          named.add(name);
          arrangement = {
            name,
            parts: members,
            pieces: thing.map((k) => pieces[k]!),
            combinations: new Map(),
            placed: 0,
          };
          arrangements.set(key, arrangement);
          for (const m of members) piecesNamed.add(nameOf(m));
        }
        const palettes = members.map((m) => m.palette);
        arrangement.combinations.set(JSON.stringify(palettes), palettes);
        arrangement.placed++;
        const crop = croppedPieces(laid);
        const stands = thing.some((k) => !pieces[k]!.floats);
        const band = plan.bands.includes(thing);
        return {
          image: arrangement.name,
          palette: [...new Set(palettes.map(paletteName))].join('+'),
          lateral: crop.left + (crop.width * crop.fine) / 2,
          height: (stands ? 0 : crop.top - crop.height * crop.fine * crop.aspect) - lowered(thing[0]!),
          order: (band ? bandOrder(thing, kept(thing)!, order) : null) ?? order(thing[0]!),
        };
      }),
    };
  };

  /**
   * Each arrangement's picture: its parts laid at the original's own size and cropped, its colors their (part, pen)
   * pairs in every combination it is drawn in (`joinedColors`), through the sprites' rules once, a standing part's pen
   * 10 a shadow; with what the report says of it.
   */
  const pictures = () => {
    const table = spriteTable();
    return [...arrangements.values()].map((a) => {
      for (const part of a.parts)
        if (typeof table.get(tableKey(nameOf(part)))?.base === 'number')
          throw contractUnmet(`${a.name}'s part ${nameOf(part)} has a base in K's table`);
      const laid = croppedPieces(layPieces(a.pieces));
      const combinations = [...a.combinations.values()];
      const colors = joinedColors(
        laid,
        a.parts.map((_, k) =>
          combinations.map((palettes) => ({
            name: paletteName(palettes[k]!),
            colors: boardColors(spritePalette(main, palettes[k]!).slice(1)),
          })),
        ),
      );
      const marks = {
        pens: laid.pens,
        owner: laid.owner,
        pieces: a.parts.map((part, k) => ({
          shadowPen: a.pieces[k]!.floats ? undefined : SHADOW_PEN,
          entry: table.get(tableKey(nameOf(part))),
        })),
      };
      const texels = texelsAPixel(laid.fine, PIXEL_ASPECT);
      const parts = pictureParts(colors.picture, undefined, undefined, marks);
      const grid = partsOnGrid(colors.picture, parts, texels.across, texels.down);
      if (grid.width * grid.height > MASTER_TEXELS) throw contractUnmet(`${a.name} is larger than imageMasterTexels`);
      const point = { x: grid.width / 2 - 0.5, y: grid.anchorY };
      const shadow = paintedShadow(grid, point, false);
      const master = namedBoardMaster(a.name, grid, grid.indices, point, colors.palettes, shadow ? { shadow } : {});
      return {
        name: a.name,
        image: courseImageFile(master),
        report: {
          name: a.name,
          pieces: a.parts.map((part) => tableKey(nameOf(part)).replace(/^shangon-/, '')),
          placements: a.placed,
          texels: [grid.width, grid.height],
          colors: colors.distinct,
          replaced: Math.round(colors.replaced * 1000) / 1000,
          palettes: colors.palettes.map((p) => p.name),
          rounded: laid.places.flatMap((place, k) =>
            place.off[0] || place.off[1] ? [{ piece: nameOf(a.parts[k]!), off: place.off }] : [],
          ),
        },
      };
    });
  };

  /** Each gate's plan, for the report: what is baked, its bands, its kept things with why, and what is lowered. */
  const planned = () =>
    original.gates.map((parts) => {
      const plan = plans.get(gateKey(parts))!;
      const names = (thing: readonly number[]) => thing.map((k) => nameOf(parts[k]!));
      return {
        baked: plan.baked.map(names),
        bands: plan.bands.map(names),
        kept: plan.kept.map((t) => ({ pieces: names(t.pieces), reused: t.reused })),
        lowered: [...plan.restsOn].map(([k, on]) => ({
          piece: nameOf(parts[k]!),
          by: Math.round(Math.max(...on.map((n) => original.lower(parts[n]!))) * 1e6) / 1e6,
        })),
      };
    });

  return { joinGate, pictures, planned, pieces: () => [...piecesNamed] };
}
