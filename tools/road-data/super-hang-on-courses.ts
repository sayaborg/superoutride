/**
 * SUPER HANG-ON's four courses from its ROMs ([SUPER HANG-ON road data](../../docs/super-hang-on-road-data.md)): what
 * the road data tool's commands write, the course documents, the pictures their objects show and their skies.
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { cameraDistance } from '../../src/view/camera.js';
import { instruction, long, word } from './program-words.js';
import type { RomSet } from './rom-set.js';
import {
  assembleSuperHangOnPrograms,
  assembleSuperHangOnSprites,
  assembleSuperHangOnTiles,
  superHangOnRoadRom,
} from './super-hang-on-rom.js';
import { sectionBands } from './super-hang-on-backgrounds.js';
import { BACK_WIDTH, bakeSky, SKY_WIDTH } from './sky-baking.js';
import { readCourses, readGoal, readSceneryType, readSection, sectionPositions } from './super-hang-on-road.js';
import { sectionPlan } from './path-plan.js';
import { courseScenery, sceneryRules } from './super-hang-on-scenery.js';
import { hitWidth, readGateParts, spriteList } from './super-hang-on-sprites.js';
import { bannerPalettes } from './super-hang-on-dump.js';
import { roadCrossSection } from './super-hang-on-cross-section.js';
import { pictureName, chosenPicture, superHangOnPictures, type PictureUse } from './super-hang-on-boards.js';
import { LANE, superHangOnCourse, type EndingFigure } from './super-hang-on-course.js';
import { paletteName } from './pixel-grid.js';
import { raisedSplit } from './section-writing.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const SUPER_HANG_ON_CONVERSION_VERSION = 3;

/** The goal's straight in positions: the original's 200, made longer so every vehicle stops before its end. */
const GOAL_POSITIONS = 260;
/**
 * Where the goal's crowd and the ending's figures stand, goal positions: the original's last frame of its ending, where
 * the bike stops at about 56 (K's reading of the original run, the figures' frames and places below).
 */
const CROWD_AT = 55.7;
const ENDING_AT = 56.0;
const ENDING: readonly (readonly EndingFigure[])[] = [
  [],
  [
    { list: 0x13e5a, palette: 0x1c, x: 19, height: 3 },
    { list: 0x13eb4, palette: 0x21, x: -75, height: -2 },
  ],
  [
    { list: 0x1395a, palette: 0x19, x: -113, height: 3 },
    { list: 0x1393c, palette: 0x19, x: -71, height: 2 },
    { list: 0x13928, palette: 0x1d, x: -14, height: 84 },
  ],
  [{ list: 0x13810, palette: 0x1a, x: -48, height: 2 }],
];
/**
 * The skies face as the original's backgrounds: at heading 0 its back layer's pixel 1370 of 1536 is at the screen's
 * middle (K's reading of the layers' scroll), here 1370 × 1504 / 1536 of the sky's 1504.
 */
const BACK_MIDDLE = 1370;

/** A course's id and the stem of its Sections' ids. */
export const courseSlug = (name: string) => name.toLowerCase();
export const courseId = (name: string) => `super-hang-on-${courseSlug(name)}`;
/** Section `order` (0 from)'s sky, baked from its background. */
export const skyName = (name: string, order: number) => `shangon-${courseSlug(name)}-${order + 1}-sky`;

/**
 * The program's amounts the courses read beside the tables: the stripes' period (32 phases of the 5 bits `andi.w #$1F`
 * at 0x16F0 takes, a phase each 34 speed units, the `moveq #$22, d2` at 0x6594), the ground's change (a step each two
 * ticks, the `addi.w #$80` at 0x69BC on its step's word, to the 32nd, `cmpi.b #$1F` at 0x69C4) and where a CHECK gate
 * comes out inside a section (`cmpi.w #$400, d0` at 0x6DA4).
 */
function programAmounts(main: Uint8Array) {
  const [mask] = instruction(main, 0x16f0, [0x0240, null], "the stripes' phases");
  const [moveq] = instruction(main, 0x6594, [null], "the stripes' speed units");
  if (moveq! >> 8 !== 0x74) throw new RangeError("The program at 0x6594 does not set the stripes' speed units");
  const [increment] = instruction(main, 0x69bc, [0x0679, null, 0x0026, 0x1028], "the ground's step");
  const [last] = instruction(main, 0x69c4, [0x0c39, null, 0x0026, 0x1028], "the ground's last step");
  const [middle] = instruction(main, 0x6da4, [0x0c40, null], "the CHECK gate's middle position");
  return {
    phases: mask! + 1,
    speedUnits: moveq! & 0xff,
    stepTicks: 0x100 / increment!,
    steps: last! + 1,
    middle: middle!,
  };
}

/**
 * One road position in metres, from the main CPU's program: at speed v the display shows v × 0x117 / 0xF0 km/h (the
 * `mulu.w #$117` and `divu.w #$F0` at 0x15DA), each tick advances the road 0x97 × v / 65536 positions (the long at
 * 0x8848), and the clock counts 60 ticks a second (the `moveq #$3C, d1` at 0x544E).
 */
export function positionMetres(main: Uint8Array): number {
  const [multiplier] = instruction(main, 0x15da, [0xc0fc, null], "the speed display's factor");
  const [divisor] = instruction(main, 0x15de, [0x80fc, null], "the speed display's divisor");
  const [moveq] = instruction(main, 0x544e, [null], "the clock's ticks a second");
  if (moveq! >> 8 !== 0x72) throw new RangeError("The program at 0x544E does not set the clock's ticks a second");
  const ticks = moveq! & 0xff;
  const advance = long(main, 0x8848);
  return ((multiplier! / divisor!) * 65536) / (3.6 * ticks * advance);
}

/** The four courses' documents and reports, the pictures they show and their skies. */
export function superHangOnCourses(set: RomSet) {
  const programs = assembleSuperHangOnPrograms(set);
  const words = assembleSuperHangOnSprites(set);
  const planes = assembleSuperHangOnTiles(set);
  const { main } = programs;
  const positions = sectionPositions(main);
  const metres = positionMetres(main);
  const rules = sceneryRules(main);
  const amounts = programAmounts(main);
  const cross = roadCrossSection(superHangOnRoadRom(set));
  const unit = LANE / cross.linesIn;
  const goal = readGoal(programs);
  const gates = readGateParts(main);
  const banners = bannerPalettes(main);
  const tick = (rules.advance * rules.speed) / 65536;
  const depthStep = word(main, 0xc5ea + 2 * rules.speed);
  const yawOrigin =
    ((SKY_WIDTH - ((BACK_MIDDLE * SKY_WIDTH) / BACK_WIDTH - CAMERA_DEFINITION.centerX)) /
      CAMERA_DEFINITION.focalLength) *
    (180 / Math.PI);
  const uses: PictureUse[] = [];
  const widths = new Map<number, number>();
  const picture = (list: number, mirrored: boolean, palette: number, raised: boolean) => {
    uses.push({ list, mirrored, palette, raised });
    if (!widths.has(list))
      widths.set(list, chosenPicture(main, words, list, unit).width / SPRITE_SOURCE_TEXELS_PER_METER);
    return { image: pictureName(main, { list, mirrored }), palette: paletteName(palette), width: widths.get(list)! };
  };
  const built = readCourses(main).map((course, c) => {
    const sections = course.sections.map((n) => readSection(programs, n, positions.length));
    const plans = sections.map((s) => sectionPlan(s.path, metres));
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
      plans: plans.map((p) => p.segments),
      metres,
      length: positions.length,
      middle: amounts.middle,
      transition: positions.transition,
      goal: GOAL_POSITIONS,
      stripe: (amounts.phases * amounts.speedUnits * rules.advance) / 65536,
      steps: amounts.steps,
      step: amounts.stepTicks * tick,
      gatePass: Math.ceil(rules.passes / depthStep) * tick,
      startGate: ((rules.passes - gates[0]!.depth) * 2 * rules.advance) / 65536,
      cross,
      scenery: spots,
      crowd,
      crowdAt: CROWD_AT,
      ending: ENDING[c]!,
      endingAt: ENDING_AT,
      gates,
      banners,
      picture,
      spriteList: (sprite) => spriteList(main, sprite),
      hitWidth: (sprite) => hitWidth(main, sprite),
      sky: (order) => skyName(course.name, order),
      yawOrigin,
      cameraDistance: cameraDistance(CAMERA_DEFINITION),
    });
    const skies = sections.map((section, order) => {
      const name = skyName(course.name, order);
      return { name, document: bakeSky(name, sectionBands(main, planes, c, order, section.sky.rgb555)) };
    });
    return { course, plans, dropped, road, skies };
  });
  const pictures = superHangOnPictures(main, words, uses, unit);
  // A picture shown both on the ground and raised off it shows its `-raised` image raised.
  const split = new Set(pictures.filter((p) => p.split).map((p) => p.name));
  const raised = built.map((b) => ({
    ...b,
    road: {
      ...b.road,
      document: {
        ...b.road.document,
        sections: b.road.document.sections.map((s) => ({ ...s, sprites: raisedSplit(s.sprites, split) })),
      },
    },
  }));
  return { built: raised, pictures, metres, cross, unit, rules, amounts };
}
