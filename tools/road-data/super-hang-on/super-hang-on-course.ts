/**
 * SUPER HANG-ON's four courses from its ROMs ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md)): what
 * the road data tool's commands write, the course documents, the pictures their objects show and their skies.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { instruction, shiftCount, word } from '../sega-16/program-words.js';
import { micrometre } from '../shared/section-writing.js';
import type { RomSet } from '../shared/rom-set.js';
import {
  assembleSuperHangOnPrograms,
  assembleSuperHangOnSprites,
  assembleSuperHangOnTiles,
  superHangOnRoadRom,
} from './super-hang-on-rom.js';
import { backgroundScroll, sectionBands } from './super-hang-on-backgrounds.js';
import { bakeSky, skyYawOrigin } from '../shared/sky-baking.js';
import {
  readCourses,
  readGoal,
  readHeightTable,
  readSceneryType,
  readSection,
  sectionPositions,
  stageChangeTicks,
  readStripes,
  stripeCopy,
  stripeRates,
  type Section,
} from './super-hang-on-road.js';
import { pathHeadings } from '../shared/heading-plan.js';
import { lensFactor } from '../shared/screen-pieces.js';
import { courseScenery, endingPlaces, rivalAhead, sceneryRules } from './super-hang-on-scenery.js';
import {
  drawScales,
  hitWidth,
  readGateParts,
  readGrid,
  sizeList,
  spriteList,
  spritePixels,
  readGateBringOuts,
} from './super-hang-on-sprites.js';
import { roadCrossSection } from './super-hang-on-cross-section.js';
import { pictureNames, chosenPicture, superHangOnPictures, type PictureUse } from './super-hang-on-boards.js';
import { floats } from '../shared/sprite-rules.js';
import { superHangOnCourse } from './super-hang-on-layout.js';
import { ENDING, LANE } from './super-hang-on-constants.js';
import { coloredColumns, paletteName } from '../shared/pixel-grid.js';
import { BACK_WIDTH, PIXEL_ASPECT, SCREEN_ROWS, SHADOW_PEN } from '../sega-16/display.js';
import { metresAPosition } from '../shared/road-position.js';
import {
  overpassReport,
  fidelityReport,
  gradeReport,
  round1,
  round3,
  OriginalOutputs,
  type Conversion,
} from '../shared/conversion.js';
import { VECTOR_RESOLUTION } from '../shared/shared-constants.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const SUPER_HANG_ON_CONVERSION_VERSION = 37;

/** A course's id and the stem of its Sections' ids. */
export const courseSlug = (name: string) => name.toLowerCase();
export const courseId = (name: string) => `super-hang-on-${courseSlug(name)}`;
/** Section `order` (0 from)'s sky, baked from its background. */
export const skyName = (name: string, order: number) => `shangon-${courseSlug(name)}-${order + 1}-sky`;

/**
 * The program's amounts the courses read beside the tables: the stripes' period (their phases, `stripeCopy`, a phase
 * each 34 speed units, the `moveq #$22, d2` at 0x6594) and where a CHECK gate comes out inside a section (`cmpi.w
 * #$400, d0` at 0x6DA4).
 */
function programAmounts(main: Uint8Array) {
  const [moveq] = instruction(main, 0x6594, [null], "the stripes' speed units");
  if (moveq! >> 8 !== 0x74) throw romDiffers("The program at 0x6594 does not set the stripes' speed units");
  const [middle] = instruction(main, 0x6da4, [0x0c40, null], "the CHECK gate's middle position");
  return {
    phases: stripeCopy(main).phases,
    speedUnits: moveq! & 0xff,
    middle: middle!,
  };
}

/** The km/h the display shows a speed unit as: v × 0x117 / 0xF0 (the `mulu.w #$117` and `divu.w #$F0` at 0x15DA). */
export function displayKmh(main: Uint8Array): number {
  const [multiplier] = instruction(main, 0x15da, [0xc0fc, null], "the speed display's factor");
  const [divisor] = instruction(main, 0x15de, [0x80fc, null], "the speed display's divisor");
  return multiplier! / divisor!;
}

/**
 * One road position in metres, from the main CPU's program: at speed v the display shows v × `displayKmh` km/h, each
 * tick advances the road `advance` × v / 65536 positions (0x97, the scenery's rules' long at 0x8848), and the clock
 * counts 60 ticks a second (the `moveq #$3C, d1` at 0x544E).
 */
export function positionMetres(main: Uint8Array, advance: number): number {
  const [moveq] = instruction(main, 0x544e, [null], "the clock's ticks a second");
  if (moveq! >> 8 !== 0x72) throw romDiffers("The program at 0x544E does not set the clock's ticks a second");
  const ticks = moveq! & 0xff;
  return metresAPosition(displayKmh(main), 1 / ticks, advance / 65536);
}

/**
 * The hills' focal length, scanlines: the sub CPU turns a step by the camera's pitch at 2^14 (the `moveq #$E, d1` at
 * 0x1682) and raises its lines by that over its depth, shifted down 4 bits into a line's height (0x14AC) and 4 bits again
 * to a scanline (0x154C): 2^(14 − 4 − 4) = 64.
 */
function hillsFocalLength(sub: Uint8Array): number {
  const [pitch] = instruction(sub, 0x1682, [null], "the hills' pitch's unit");
  const [lineShift] = instruction(sub, 0x14ac, [null], "the lines' heights' shift");
  const [drawShift] = instruction(sub, 0x154c, [null], "the lines' scanline shift");
  const asr = (op: number) => shiftCount(op, 0xe040, "hills' projection");
  if (pitch! >> 8 !== 0x72) throw romDiffers("The sub CPU's hills are not projected as read");
  return 2 ** ((pitch! & 0xff) - asr(lineShift!) - asr(drawShift!));
}

/**
 * The sines along a course from its `sections`' height points, each section `length` positions, the goal level after:
 * each point starts its table's (`x / √(x² + y²)`, a vector's rise a position along it) where the road reaches it,
 * unless a table runs, until its projection meets its end, `ahead` positions before it; a point reached then is passed
 * by, as the sub CPU takes a new table only once it has none.
 */
function courseGrades(sub: Uint8Array, sections: readonly Section[], length: number, total: number) {
  const [steps] = instruction(sub, 0x16ba, [null], "the hills' steps");
  if (steps! >> 8 !== 0x7c) throw romDiffers("The program at 0x16BA does not set the hills' steps");
  const ahead = 2 * (steps! & 0xff);
  const grades = new Array<number>(total).fill(0);
  let running = -Infinity;
  const passed: { section: number; position: number; table: number }[] = [];
  sections.forEach((section, k) => {
    for (const point of section.heights) {
      const at = length * k + point.position;
      const { vectors } = readHeightTable(sub, point.table);
      if (at < running) {
        passed.push({ section: k, position: point.position, table: point.table });
        continue;
      }
      running = at + vectors.length - ahead;
      vectors.forEach(([x, y], i) => {
        if (at + i < total) grades[at + i] = x / Math.hypot(x, y);
      });
    }
  });
  return { grades, passed };
}

/** The four courses' documents and reports, the pictures they show and their skies. */
export function superHangOnCourses(set: RomSet) {
  const programs = assembleSuperHangOnPrograms(set);
  const words = assembleSuperHangOnSprites(set);
  const planes = assembleSuperHangOnTiles(set);
  const { main } = programs;
  const positions = sectionPositions(main);
  const rules = sceneryRules(main);
  const metres = positionMetres(main, rules.advance);
  // A section's change at the top speed: its ticks, each `advance` × the speed / 65536 positions.
  const changeMetres = ((stageChangeTicks(main) * rules.advance * rules.speed) / 65536) * metres;
  const scales = drawScales(main);
  const amounts = programAmounts(main);
  const cross = roadCrossSection(superHangOnRoadRom(set), scales.rowUnits);
  const unit = LANE / cross.linesIn;
  const goal = readGoal(programs);
  const gates = readGateParts(main);
  const bringOuts = readGateBringOuts(main);
  const yawOrigin = skyYawOrigin(backgroundScroll(main).middle, BACK_WIDTH);
  const ending = endingPlaces(main, rules, positions.finish);
  const uses: PictureUse[] = [];
  const widths = new Map<number, { width: number; colored: number }>();
  const picture = (list: number, mirrored: boolean, palette: number, lift = 0) => {
    const use = { list, mirrored, palette, shades: !floats(lift, scales.pixelUnits) };
    uses.push(use);
    if (!widths.has(list)) {
      const { width, pixels } = spritePixels(words, sizeList(main, list)[0]!);
      widths.set(list, {
        width: chosenPicture(main, words, list, scales.pixelUnits * unit).width / SPRITE_SOURCE_TEXELS_PER_METER,
        colored: coloredColumns(pixels, width, SHADOW_PEN) * scales.pixelUnits * unit,
      });
    }
    return { use, palette: paletteName(palette), ...widths.get(list)! };
  };
  const courses = readCourses(main).map((course) => {
    const sections = course.sections.map((n) => readSection(programs, n, positions.length));
    return { course, sections };
  });
  // The grades: each course's sines, times one factor for the four, the hills' lens ratio within the grade limit.
  const sines = courses.map(({ sections }) =>
    courseGrades(programs.sub, sections, positions.length, sections.length * positions.length + goal.path.x.length),
  );
  const factor = lensFactor(
    hillsFocalLength(programs.sub),
    SCREEN_ROWS,
    Math.max(...sines.flatMap((s) => s.grades.map(Math.abs))),
  );
  const built = courses.flatMap(({ course, sections }, c) => {
    // The heading table: the sections' road paths, then the goal's.
    const headings = pathHeadings({
      x: [...sections.flatMap((s) => s.path.x), ...goal.path.x],
      y: [...sections.flatMap((s) => s.path.y), ...goal.path.y],
    });
    // The grades: the sections' height tables, then the goal's level straight.
    const hills = sines[c]!;
    const { spots, dropped } = courseScenery(
      main,
      sections.map((s) => s.scenery),
      positions.length,
    );
    const crowd = goal.scenery[c]!.flatMap((point) => readSceneryType(main, point.type).items);
    const road = superHangOnCourse({
      id: courseId(course.name),
      name: course.name,
      slug: courseSlug(course.name),
      sections,
      headings,
      grades: hills.grades.map((sine) => factor * sine),
      gradeResolution: factor * VECTOR_RESOLUTION,
      metres,
      length: positions.length,
      middle: amounts.middle,
      transition: positions.transition,
      change: micrometre(changeMetres),
      stripe: (amounts.phases * amounts.speedUnits * rules.advance) / 65536,
      stripes: stripeRates(readStripes(main)),
      gatePass: rules.passing,
      startGate: rules.ahead(gates[0]!.depth),
      scales,
      cross,
      scenery: spots,
      crowd,
      crowdAt: ending.crowdAt,
      ending: ENDING[c]!,
      endingAt: ending.endingAt,
      gates,
      bringOuts,
      picture,
      spriteList: (sprite) => spriteList(main, sprite),
      hitWidth: (sprite) => hitWidth(main, sprite),
      sky: (order) => skyName(course.name, order),
      yawOrigin,
      cameraDistance: cameraDistance(CAMERA_DEFINITION),
      lane: LANE,
      rivals: readGrid(main, c).map((rival) => ({ position: rivalAhead(main, rules, rival.depth), x: rival.x * unit })),
    });
    const skies = sections.map((section, order) => {
      const name = skyName(course.name, order);
      return { name, document: bakeSky(name, sectionBands(main, planes, c, order, section.sky.rgb555), PIXEL_ASPECT) };
    });
    return [{ course, dropped, road, skies, passed: hills.passed }];
  });
  const pictures = superHangOnPictures(main, words, uses, scales.pixelUnits * unit);
  // SAND reaches the bike's lateral limit, from P: 0x812C, after steering and the slide, holds its x (0x260022) within
  // the word it reads at 0x8850 either side.
  const [high, low] = instruction(main, 0x812c, [0x3239, null, null], "the bike's lateral limit");
  const ground = micrometre(word(main, high! * 0x10000 + low!) * unit - LANE);
  const named = pictureNames(main, uses);
  const written = built.map((b) => ({ ...b, road: { ...b.road, document: b.road.write(ground, named) } }));
  // The top speed with the turbo as the display shows it, at which the flights are counted.
  const topKmh = rules.turbo * displayKmh(main);
  return { built: written, pictures, metres, cross, unit, rules, amounts, ground, factor, topKmh };
}

/** super-hang-on's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const SUPER_HANG_ON_CONVERSION: Conversion = (set) => {
  // SUPER HANG-ON's courses, pictures and skies from the ROMs, written to content, or with `--check` compared.
  const outputs = new OriginalOutputs();
  const built = superHangOnCourses(set);
  const courses = [];
  for (const { course, road, dropped, passed } of built.built) {
    const file = outputs.course(courseId(course.name), road.document);
    courses.push({
      course: file,
      sections: road.document.sections.length,
      metres: round1(road.path.length),
      objects: road.objects,
      notBroughtOut: dropped,
      runs: road.plan.runs.length,
      elements: road.plan.elements.length,
      ...fidelityReport(road.plan.fidelity),
      // The profile: its rise table's runs, the height points passed by, its heights' range and steepest grade.
      hills: (() => {
        const stations = Array.from({ length: Math.floor(road.path.length) + 1 }, (_, s) => s);
        const heights = stations.map(road.profile.height);
        return {
          runs: road.hills.runs,
          departure: road.hills.departure,
          passed,
          lowest: round1(Math.min(...heights)),
          highest: round1(Math.max(...heights)),
          steepest: round3(Math.max(...stations.map((s) => Math.abs(road.profile.grade(s))))),
          flights: gradeReport(road.profile, road.profile, road.path.length, built.topKmh).flights,
        };
      })(),
      overpasses: road.overpasses.map((c) => overpassReport(c, road.profile.height)),
      rampRadius: road.rampRadius === null ? null : Math.round(road.rampRadius),
    });
  }
  for (const { image } of built.pictures) outputs.file(image.path, image.bytes);
  // Each section's sky, baked from its background; course images are saved as their exact compact bytes.
  const skies = built.built.flatMap(({ skies }) => skies);
  for (const { name, document } of skies) {
    const text = JSON.stringify(document);
    outputs.file(`images/${name}.json`, text);
  }
  return {
    outputs,
    report: {
      conversion: SUPER_HANG_ON_CONVERSION_VERSION,
      metresAPosition: built.metres,
      metresAUnit: built.unit,
      factor: built.factor,
      ground: built.ground,
      courses,
      pictures: built.pictures.length,
      skies: skies.length,
    },
  };
};
