/**
 * ENDURO RACER's things of several pieces ([Things of several
 * pieces](../../../docs/original-road-data.md#things-of-several-pieces), [ENDURO RACER road
 * data](../../../docs/enduro-racer-road-data.md#things-of-several-pieces)): the start's and the scenery's pieces each
 * thing one picture, laid at the original's own size where the program draws them, named as met, built from the ROMs'
 * pixels.
 */
import { createHash } from 'node:crypto';
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
import {
  boardColors,
  TRANSPARENT_PENS,
  coloredColumns,
  namedBoardMaster,
  paletteName,
  texelsAPixel,
  turned,
} from '../shared/pixel-grid.js';
import { floats, paintedShadow, partsOnGrid, pictureParts, spriteTable, tableKey } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT, SHADOW_PEN } from '../sega-16/display.js';
import { pictureName } from './enduro-racer-boards.js';
import { readSpritePalette, sizeSetPixels } from './enduro-racer-sprites.js';
import type { ObjectPiece, ObjectSpot } from './enduro-racer-scenery.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

/**
 * One arrangement of pieces, named: its pieces (drawing order), each's place, and the palette combinations it is drawn
 * in.
 */
interface Arrangement {
  readonly name: string;
  readonly pieces: readonly ObjectPiece[];
  readonly laid: readonly JoinPiece[];
  readonly places: readonly string[];
  readonly combinations: Map<string, readonly number[]>;
  placed: number;
}

/**
 * ENDURO RACER's things of several pieces among `objects`, at `unit` metres a lateral unit, a pixel `pixelUnits`
 * units: each thing one object (`things`) at its pieces' outer edges' middle, standing where a piece stands, else at its
 * lowest colored row's height, its pieces' bodies (`hitWidth` units, or a piece's colored pixels where narrower) its
 * parts; the pieces left as they are (`rest`); and the joined pictures. A piece is drawn `across(x)` pixels right of
 * the middle and its bottom its rows up, in its object's order (`sceneryObjects`), a later one over those before.
 */
export function enduroRacerJoining(
  main: Uint8Array,
  words: Uint32Array,
  objects: readonly ObjectPiece[],
  scale: {
    readonly unit: number;
    readonly pixelUnits: number;
    readonly metres: number;
    readonly hitWidth: number;
    readonly across: (x: number) => number;
  },
) {
  const pixel = scale.pixelUnits * scale.unit;
  const sources = objects.map((o) => sizeSetPixels(main, words, o.use.sizes));
  const pieces = objects.map((o, k): JoinPiece => {
    const { width, height, pixels } = sources[k]!;
    return {
      unit: o.unit,
      s: o.position * scale.metres,
      pixels: { width, height, pixels: Uint8Array.from(turned(pixels, width, o.use.mirrored)) },
      pixel,
      aspect: PIXEL_ASPECT,
      left: (scale.across(o.x) - width / 2) * pixel,
      bottom: o.rows * pixel * PIXEL_ASPECT,
      floats: floats(o.rows, 1),
      joins: true,
      order: o.object,
    };
  });
  // A piece's body: the original's hit, or its colored pixels where narrower.
  const body = (k: number) =>
    Math.min(
      scale.hitWidth * scale.unit,
      coloredColumns(sources[k]!.pixels, sources[k]!.width, objects[k]!.use.shades ? SHADOW_PEN : undefined) * pixel,
    );
  // The plan: things baked whole, and in those whose reused standing pieces stay pieces, the bands of their floating
  // pieces; a piece is its picture's name, mirrored or not.
  const [plan] = joinPlan([pieces.map((piece, k) => ({ ...piece, id: pictureName(objects[k]!.use) }))]);
  const thingsOf = [...plan!.baked, ...plan!.bands];
  // Where each thing is written among the objects at its station: a baked one at its first drawn piece's order, a band
  // between the pieces of its kept thing the original draws under it and over it (`bandOrder`), else at its first's.
  const order = (k: number) => objects[k]!.object;
  const unlayered: string[] = [];
  const thingOrder = (thing: readonly number[]) => {
    const kept = plan!.kept.find((t) => t.pieces.includes(thing[0]!));
    if (!kept || !plan!.bands.includes(thing)) return order(thing[0]!);
    const at = bandOrder(thing, kept, order);
    if (at === null) unlayered.push(thing.map((k) => pictureName(objects[k]!.use)).join('+'));
    return at ?? order(thing[0]!);
  };
  const joined = new Set(thingsOf.flat());
  // What a floating piece or band rests on: the standing objects whose drawing lower than the original's it follows.
  const restsOn = (thing: readonly number[]) => (plan!.restsOn.get(thing[0]!) ?? []).map((k) => objects[k]!);
  const arrangements = new Map<string, Arrangement>();
  const named = new Set<string>();
  const things = thingsOf.map((thing): ObjectSpot & { readonly restsOn: readonly ObjectPiece[] } => {
    const members = thing.map((k) => objects[k]!);
    const laid = layPieces(thing.map((k) => pieces[k]!));
    // An arrangement is what it draws: its pieces at their places, and which of them shows each pixel.
    const places = members.map((m, i) => JSON.stringify([pictureName(m.use), laid.places[i]!.x, laid.places[i]!.y]));
    const sorted = places.map((_, i) => i).sort((a, b) => (places[a]! < places[b]! ? -1 : 1));
    const owner = Int16Array.from(laid.owner, (o) => (o < 0 ? o : sorted.indexOf(o)));
    const drawn = createHash('sha256').update(laid.pens).update(new Uint8Array(owner.buffer)).digest('hex');
    const key = JSON.stringify([sorted.map((i) => places[i]), drawn]);
    let arrangement = arrangements.get(key);
    if (!arrangement) {
      const stem = `enduror-joined-${members[0]!.use.sizes.toString(16).padStart(5, '0')}`;
      let name = stem;
      for (let n = 2; named.has(name); n++) name = `${stem}-${n}`;
      named.add(name);
      arrangement = {
        name,
        pieces: members,
        laid: thing.map((k) => pieces[k]!),
        places,
        combinations: new Map(),
        placed: 0,
      };
      arrangements.set(key, arrangement);
    }
    // Its pieces' palettes in the arrangement's order, each piece found by its place.
    const palettes = arrangement.places.map((place) => members[places.indexOf(place)]!.palette);
    arrangement.combinations.set(JSON.stringify(palettes), palettes);
    arrangement.placed++;
    const crop = croppedPieces(laid);
    const middle = crop.left + (crop.width * crop.fine) / 2;
    const stands = thing.some((k) => !pieces[k]!.floats);
    return {
      position: members[0]!.position,
      x: middle / scale.unit,
      image: arrangement.name,
      // Its palette's name, as its picture names it: its pieces' palettes in its arrangement's drawing order.
      palette: [...new Set(palettes.map(paletteName))].join('+'),
      height: stands ? 0 : crop.top - crop.height * crop.fine * crop.aspect,
      hit: false,
      parts: thing.flatMap((k) =>
        objects[k]!.hit ? [{ across: objects[k]!.x * scale.unit - middle, width: body(k) }] : [],
      ),
      onRoad: false,
      what: members.map((m) => m.what).join('+'),
      restsOn: restsOn(thing),
      order: thingOrder(thing),
    };
  });

  /**
   * Each arrangement's picture: its pieces laid at the original's own size and cropped, its colors their (piece, pen)
   * pairs in every combination it is drawn in (`joinedColors`), through the sprites' rules once, a standing piece's pen
   * 10 a shadow; with what the report says of it.
   */
  const pictures = () => {
    const table = spriteTable();
    return [...arrangements.values()].map((a) => {
      for (const p of a.pieces)
        if (typeof table.get(tableKey(pictureName(p.use)))?.base === 'number')
          throw contractUnmet(`${a.name}'s piece ${pictureName(p.use)} has a base in K's table`);
      const laid = croppedPieces(layPieces(a.laid));
      const combinations = [...a.combinations.values()];
      const colors = joinedColors(
        laid,
        a.pieces.map((_, k) =>
          combinations.map((palettes) => ({
            name: paletteName(palettes[k]!),
            colors: boardColors(readSpritePalette(main, palettes[k]!).rgb555.slice(1), TRANSPARENT_PENS.sega),
          })),
        ),
      );
      const marks = {
        pens: laid.pens,
        owner: laid.owner,
        pieces: a.pieces.map((p) => ({
          shadowPen: p.use.shades ? SHADOW_PEN : undefined,
          entry: table.get(tableKey(pictureName(p.use))),
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
      const shadow = paintedShadow(grid, point, false);
      const master = namedBoardMaster(a.name, grid, grid.indices, point, colors.palettes, shadow ? { shadow } : {});
      return {
        name: a.name,
        image: courseImageFile(master),
        report: {
          name: a.name,
          pieces: a.pieces.map((p) => `${pictureName(p.use).replace(/^enduror-/, '')} (${p.what}, object ${p.object})`),
          placements: a.placed,
          texels: [grid.width, grid.height],
          colors: colors.distinct,
          replaced: Math.round(colors.replaced * 1000) / 1000,
          palettes: colors.palettes.map((p) => p.name),
          parts: a.pieces.filter((p) => p.hit).length,
          // The pieces whose x is not a whole pixel, and the pixel the program cuts it to.
          rounded: a.pieces.flatMap((p) =>
            Number.isInteger(p.x / scale.pixelUnits)
              ? []
              : [{ piece: pictureName(p.use), pixels: p.x / scale.pixelUnits, drawn: scale.across(p.x) }],
          ),
        },
      };
    });
  };

  return {
    things,
    rest: objects.flatMap((o, k) => (joined.has(k) ? [] : [{ ...o, restsOn: restsOn([k]) }])),
    /** The bands the original's layering with their kept pieces cannot be kept for. */
    unlayered,
    /** The things whose reused standing pieces stay pieces, with why each is reused. */
    kept: plan!.kept.map((thing) => ({
      pieces: thing.pieces.map((k) => pictureName(objects[k]!.use)),
      reused: thing.reused,
    })),
    pictures,
    /** The pieces' pictures' names a joined picture draws. */
    pieces: () => [...new Set([...arrangements.values()].flatMap((a) => a.pieces.map((p) => pictureName(p.use))))],
  };
}
