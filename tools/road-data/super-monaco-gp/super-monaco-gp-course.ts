/**
 * SUPER MONACO GP's circuits from its ROMs ([SUPER MONACO GP road data](../../../docs/super-monaco-gp-road-data.md#super-monaco-gps-courses)):
 * its conversion and both circuits, each laid out by `super-monaco-gp-layout`, their boards' images and their skies.
 */
import { paletteRgb555 } from '../out-run-hardware/road-tables.js';
import { meanColor } from '../../../src/image/image-filter.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { RomSet } from '../shared/rom-set.js';
import { lensFactor } from '../shared/screen-pieces.js';
import { instruction, shiftCount } from '../sega-16/program-words.js';
import { bakeSky, uniformSky } from '../shared/sky-baking.js';
import {
  assembleSuperMonacoGpPrograms,
  assembleSuperMonacoGpSprites,
  assembleSuperMonacoGpTiles,
} from './super-monaco-gp-rom.js';
import { largestPixels, largestSize, readSpritePalette, readViewTable } from './super-monaco-gp-sprites.js';
import { superMonacoGpBoards } from './super-monaco-gp-boards.js';
import { PIXEL_ASPECT, SCREEN_ROWS } from '../sega-16/display.js';
import { readRamp, readRoadLayerColors, superMonacoGpSkyBands } from './super-monaco-gp-backgrounds.js';
import {
  STEP_METRES,
  TUNNEL_DARK,
  COURSE,
  SKIES,
  CENTRE_LINE,
  GRID_BOARD,
  GRID_MARKS,
  KERBS,
  KERB_CLASSES,
  PATH_UNIT,
  START_BOARD,
  SURFACE_BOARD,
} from './super-monaco-gp-constants.js';
import { round1, round3, OriginalOutputs, type Conversion } from '../shared/conversion.js';
import { FLAT_PIXEL, halfCar, startBlocks, superMonacoGpCourse } from './super-monaco-gp-layout.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const SUPER_MONACO_GP_CONVERSION_VERSION = 35;

/**
 * The sub CPU's focal length, rows: its transform (S 0x3C5A–0x3E00) projects a camera-relative point across and up
 * alike by q = 0x80000 / (Z + 64), the hardware divider's (`move.l #$80000, $4000(a6)` at S 0x3C72), its product with q
 * shifted left and swapped (`asl.l #6` and `swap`, across at S 0x3D84 and 0x3E4E, up at S 0x3DA2 and 0x3E68): 0x80000 ×
 * 2⁶ / 2¹⁶ = 512 pixels ([research notes](../../../docs/research/super-monaco-gp.md), Camera).
 */
function focalLength(sub: Uint8Array): number {
  const [high, low] = instruction(sub, 0x3c72, [0x2d7c, null, null, 0x4000], "the transform's dividend");
  const shifts = [
    [0x3d82, 0x2014, 0x4840],
    [0x3da0, 0x2214, 0x4841],
    [0x3e4c, 0x2014, 0x4840],
    [0x3e66, 0x2214, 0x4841],
  ].map(([at, read, swap]) => {
    const [op] = instruction(sub, at!, [read!, null, swap!], "the transform's product");
    return shiftCount(op!, 0xe180, "transform's product");
  });
  if (new Set(shifts).size !== 1) throw romDiffers('The transform is not alike across and up');
  return ((high! * 0x10000 + low!) * 2 ** shifts[0]!) / 0x10000;
}

/** The circuit's document and report, its boards' images and its skies, from the ROM set. */
export function superMonacoGpCourses(set: RomSet) {
  const programs = assembleSuperMonacoGpPrograms(set);
  const words = assembleSuperMonacoGpSprites(set);
  const { main } = programs;
  const roadLayer = readRoadLayerColors(main).rgb555;
  // A flat board's picture, and its pixels' colors in a palette where `keep` holds.
  const pictures = new Map<number, ReturnType<typeof largestPixels>>();
  const picture = (frames: number) => {
    if (!pictures.has(frames)) pictures.set(frames, largestPixels(main, words, frames));
    return pictures.get(frames)!;
  };
  const colorsOf = (frames: number, palette: number, keep: (x: number, y: number, v: number) => boolean) => {
    const { width, pixels } = picture(frames);
    const rgb = readSpritePalette(main, palette).rgb555;
    const out: number[] = [];
    pixels.forEach((v, i) => {
      if (v > 0 && keep(i % width, Math.floor(i / width), v)) out.push(rgb[v - 1]!);
    });
    return out;
  };
  const marks = {
    surface: (palette: number) => meanColor(colorsOf(SURFACE_BOARD, palette, () => true)),
    centre: (palette: number) =>
      meanColor(
        colorsOf(
          SURFACE_BOARD,
          palette,
          (x, y) => y === CENTRE_LINE.row && x >= CENTRE_LINE.from && x <= CENTRE_LINE.to,
        ),
      ),
    // A grid mark: its row's pixels across the left slot's line, from −to to −from units.
    grid: (mark: (typeof GRID_MARKS)[number], palette: number) => {
      const middle = picture(GRID_BOARD).width / 2;
      const [a, b] = [middle - mark.to / FLAT_PIXEL, middle - mark.from / FLAT_PIXEL];
      return meanColor(colorsOf(GRID_BOARD, palette, (x, y) => y === mark.row && x >= a && x < b));
    },
    start: (palette: number) => startBlocks(picture(START_BOARD), readSpritePalette(main, palette).rgb555),
    // A kerb's two stripes: the mean colors of its view 0 picture's two classes of pixels.
    kerb: (palette: number) =>
      KERB_CLASSES.map(([a, b]) =>
        meanColor(colorsOf(readViewTable(programs.sub, KERBS)[0]!, palette, (_x, _y, v) => v >= a && v <= b)),
      ),
  };
  const lap = superMonacoGpCourse(programs, COURSE, {
    marks,
    ground: roadLayer[readRamp(programs.sub).below]!,
    height: (frames: number) => largestSize(main, frames).height,
    width: (frames: number) => largestSize(main, frames).width,
    halfCar: halfCar(main, words),
  });
  // The lens ratio within the grade limit.
  const factor = lensFactor(focalLength(programs.sub), SCREEN_ROWS, lap.steepest);
  const course = lap.write(factor);
  const dark = paletteRgb555(TUNNEL_DARK);
  const { images: boards, frame } = superMonacoGpBoards(main, words, course.uses.boards, course.scale.unit, {
    dark,
    gap: course.uses.frameGap,
  });
  // The skies: the fine set's background baked over its ramp, and the tunnel's dark.
  const skies = [
    {
      name: SKIES.fine,
      document: bakeSky(SKIES.fine, superMonacoGpSkyBands(programs, assembleSuperMonacoGpTiles(set)), PIXEL_ASPECT),
    },
    { name: SKIES.tunnel, document: uniformSky(SKIES.tunnel, dark) },
  ];
  return { course, boards, skies, factor, frame };
}

/** super-monaco-gp's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const SUPER_MONACO_GP_CONVERSION: Conversion = (set) => {
  // SUPER MONACO GP's circuit from its ROM zip, written to content, or with `--check` compared.
  const outputs = new OriginalOutputs();
  const built = superMonacoGpCourses(set);
  const { course, document, plan, written, hills, sections, objects, kerbs, inside } = built.course;
  const file = outputs.course(course.id, document);
  const elements = written.flat();
  const arcs = elements.filter((e) => e.kind === 'arc');
  const courseReport = {
    course: file,
    // P's runs and its elements as written, the tightest arc, and how far a point of the path lies from P.
    runs: plan.runs.length,
    elements: elements.length,
    arcs: arcs.length,
    tightest: round1(Math.min(...arcs.map((e) => e.radius!))),
    departure: round3(plan.departure * PATH_UNIT),
    lapMetres: round3(elements.reduce((sum, e) => sum + e.length, 0)),
    // The profile's runs, how far a point of the path lies from it, its heights' range and its steepest grade.
    profile: (() => {
      const lap = elements.reduce((sum, e) => sum + e.length, 0);
      const samples = Array.from({ length: Math.ceil(lap) + 1 }, (_, i) => Math.min(lap, i));
      const grades = samples.map((u) => hills.profile.grade(u));
      const heights = samples.map((u) => hills.profile.height(u));
      return {
        runs: hills.runs.length,
        departure: round3(hills.departure),
        lowest: round1(Math.min(...heights)),
        highest: round1(Math.max(...heights)),
        steepest: round3(Math.max(...grades.map(Math.abs))),
        closes: round3(hills.profile.height(lap)),
      };
    })(),
    sections: sections.map(({ id, steps, boards }) => ({ id, steps, boards })),
    // The boards placed, the kerbs drawn as stripes, and the boards left out on a curve's inside.
    boards: objects.length,
    // The boards whose foot is below the ground.
    below: objects.filter((o) => o.groundOffset < 0).length,
    kerbs: kerbs.length,
    inside,
  };
  // The boards' images, as the ROMs' pictures are.
  for (const { image } of built.boards) outputs.file(image.path, image.bytes);
  // The skies, baked from the ROMs; course images are saved as their exact compact bytes.
  for (const { name, document } of built.skies) {
    const text = JSON.stringify(document);
    outputs.file(`images/${name}.json`, text);
  }
  return {
    outputs,
    report: {
      conversion: SUPER_MONACO_GP_CONVERSION_VERSION,
      factor: built.factor,
      metresAStep: STEP_METRES,
      course: courseReport,
      images: {
        boards: built.boards.length,
        masterTexels: built.boards.reduce((sum, b) => sum + b.texels, 0),
      },
      // The tunnel's frame: its pictures, the boards that show them, its half width and top, and its opening's.
      frame: built.frame && {
        pictures: built.boards.filter((b) => b.name.endsWith('-frame')).map((b) => b.name),
        boards: objects.filter((o) => o.image.endsWith('-frame')).length,
        half: round3(built.frame.half),
        top: round3(built.frame.top),
        inner: round3(built.frame.inner),
        ceiling: round3(built.frame.ceiling),
      },
    },
  };
};
