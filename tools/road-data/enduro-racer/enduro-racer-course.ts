/**
 * ENDURO RACER's course from its ROMs ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-course)):
 * its conversion, and the course's inputs read from the ROM set, laid out by `enduro-racer-layout`, with the pictures
 * its objects show and its skies.
 */
import { crestTrials } from '../shared/crest-trials.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import type { RomSet } from '../shared/rom-set.js';
import { moundHeight } from '../shared/jump-mound.js';
import { enduroRacerInputs } from './enduro-racer-screen-frames.js';
import { bakeSky, skyYawOrigin } from '../shared/sky-baking.js';
import { backgroundScroll, stageSky } from './enduro-racer-backgrounds.js';
import { pathHeadings } from '../shared/heading-plan.js';
import {
  assembleEnduroRacerPrograms,
  assembleEnduroRacerSprites,
  assembleEnduroRacerTiles,
  enduroRacerRoadRom,
} from './enduro-racer-rom.js';
import {
  readGroundColors,
  readRoadColors,
  readStripeBands,
  readPastGoal,
  readRoadPaths,
  readHills,
  readStage3Background,
  readFords,
  readStages,
  bikeAhead,
  hitWidth,
  lateralLimit,
  positionMetres,
  readGrid,
  topKmh,
  readJumpKind,
  readJumps,
  readScenery,
  readStartTemplates,
} from './enduro-racer-road.js';
import { roadCrossSection } from './enduro-racer-cross-section.js';
import { enduroRacerBoards, jumpColor, pictureNames, type PictureUse } from './enduro-racer-boards.js';
import { paletteName } from '../shared/pixel-grid.js';
import { acrossPixels, enduroRacerObjects, objectZoom, type ObjectSpot } from './enduro-racer-scenery.js';
import { enduroRacerJoining } from './enduro-racer-joined.js';
import { readEnduroRacerScreen } from './enduro-racer-screen.js';
import { CHECK_TYPE, GOAL_TYPE, JUMP, LANE, COURSE_ID } from './enduro-racer-constants.js';
import { BACK_WIDTH, PIXEL_ASPECT } from '../sega-16/display.js';
import { fidelityReport, gradeReport, round1, round3, OriginalOutputs, type Conversion } from '../shared/conversion.js';
import { layCourse, pair, skyName } from './enduro-racer-layout.js';

/** The conversion's version, recorded in the specification beside the course it wrote. */
export const ENDURO_RACER_CONVERSION_VERSION = 52;

/** The course's document and report, from the ROM set. */
export function enduroRacerCourse(set: RomSet) {
  const lane = LANE;
  const programs = assembleEnduroRacerPrograms(set);
  const { main, sub } = programs;
  const metres = positionMetres(programs);
  const zoom = objectZoom(programs);
  const cross = roadCrossSection(enduroRacerRoadRom(set), zoom.unitsALine);
  const unit = lane / cross.surface;
  // The heading table: the stages' road paths in running order, then the path the program runs on past the goal, to the
  // position after the last scenery's (the table's points the positions, the road's steps between them).
  const run = readStages(programs);
  const paths = readRoadPaths(sub, run);
  const scenery = readScenery(main);
  const past = readPastGoal(sub, run);
  const goal = Math.max(...scenery.map((i) => i.position)) + 2 - run.count * run.positions;
  const headings = pathHeadings({
    x: [...paths.flatMap((p) => p.x), ...past.x.slice(0, goal)],
    y: [...paths.flatMap((p) => p.y), ...past.y.slice(0, goal)],
  });
  const checks = scenery.filter((i) => i.type === CHECK_TYPE).map((i) => i.position);
  const [finish] = scenery.filter((i) => i.type === GOAL_TYPE).map((i) => i.position);
  if (!(checks.length === run.count - 1 && finish !== undefined))
    throw romDiffers('The scenery has no CHECK banner at each stage after the first, or no GOAL board');
  const water = readFords(main);
  if (water.some((w) => w.frame !== 0)) throw romDiffers('A ford is not of frame 0');
  const skyChanges = [run.positions, readStage3Background(programs), 3 * run.positions, 4 * run.positions];
  const camera = cameraDistance(CAMERA_DEFINITION);
  const yawOrigin = skyYawOrigin(backgroundScroll(programs).middle, BACK_WIDTH);
  const stages = Array.from({ length: run.count }, (_, s) => {
    const road = readRoadColors(programs, s),
      ground = readGroundColors(main, s);
    return {
      road: { surface: pair(road, 0), narrow: pair(road, 2), middle: pair(road, 4) },
      ground: { left: ground.rgb555[3]!, right: ground.rgb555[1]! },
    };
  });
  const words = assembleEnduroRacerSprites(set);
  // The start's gate, where the start's templates stand; the original's hit across, lateral units.
  const starts = new Set(readStartTemplates(main).map((t) => t.position));
  if (starts.size !== 1) throw romDiffers("The start's templates do not stand at one position");
  const hit = hitWidth(programs);
  // The objects, their things of several pieces one picture each, the others' pictures named by the uses left.
  const joining = enduroRacerJoining(main, words, enduroRacerObjects(programs, unit), {
    unit,
    pixelUnits: zoom.pixelUnits,
    metres,
    hitWidth: hit,
    across: acrossPixels(programs),
  });
  const uses = joining.rest.map((o) => o.use);
  const named = pictureNames(uses);
  const pictures = enduroRacerBoards(main, words, uses, unit, zoom.pixelUnits);
  // What rests on standing pieces left as pieces goes down as the most lowered of them is drawn.
  const lower = new Map(pictures.map((p) => [p.name, p.lower]));
  const lowered = (restsOn: readonly { readonly use: PictureUse }[]) =>
    Math.max(0, ...restsOn.map((o) => lower.get(named(o.use))!));
  const spots = [
    ...joining.rest.map(({ use, rows: _rows, object, unit: _unit, palette, restsOn, ...o }): ObjectSpot => ({
      ...o,
      image: named(use),
      palette: paletteName(palette),
      height: o.height - lowered(restsOn),
      order: object,
    })),
    ...joining.things.map(({ restsOn, ...thing }) => ({ ...thing, height: thing.height - lowered(restsOn) })),
  ];
  // What was lowered, and by how much (metres), for the report.
  const loweredBy = [...joining.rest, ...joining.things].flatMap((o) => {
    const by = lowered(o.restsOn);
    return by > 0 ? [{ what: o.what, by: Math.round(by * 1e6) / 1e6 }] : [];
  });
  // The jumps: K's ramp at each (`JUMP`), in its kind's color.
  const jumps = readJumps(main).jumps;
  const kinds = new Map(
    [...new Set(jumps.map((jump) => jump.kind))].map((k) => [k, jumpColor(main, words, readJumpKind(main, k))]),
  );
  const colored = new Map(pictures.map((p) => [p.name, p.colored]));
  const width = new Map(pictures.map((p) => [p.name, p.width]));
  const built = layCourse({
    headings,
    metres,
    unit,
    lane,
    cross,
    camera,
    go: bikeAhead(programs),
    stripes: readStripeBands(programs.sub),
    reading: readEnduroRacerScreen(programs).behind,
    screen: enduroRacerInputs(readEnduroRacerScreen(programs), metres),
    startGate: [...starts][0]!,
    hitWidth: hit,
    rivals: readGrid(programs).map((rival) => ({ position: rival.position, x: rival.x * unit })),
    jumps: jumps.map((jump) => ({ position: jump.position, color: kinds.get(jump.kind)! })),
    hills: readHills(main).map((hill) => hill.start),
    limit: lateralLimit(programs) * unit,
    checks,
    finish,
    water,
    skyChanges,
    stages,
    stagePositions: run.positions,
    yawOrigin,
    spots,
    colored: (image) => colored.get(image)!,
    width: (image) => width.get(image)!,
  });
  // Each stage's sky, baked from its background over its ground's color (stage 5's the sea).
  const planes = assembleEnduroRacerTiles(set);
  const skies = stages.map(({ ground }, s) => ({
    name: skyName(s),
    document: bakeSky(skyName(s), stageSky(programs, planes, s, ground.left), PIXEL_ASPECT),
  }));
  return {
    ...built,
    cross,
    unit,
    metres,
    run,
    checks,
    finish,
    yawOrigin,
    pictures,
    joined: joining.pictures(),
    joinedPieces: joining.pieces(),
    kept: joining.kept,
    unlayered: joining.unlayered,
    loweredBy,
    skies,
    hitWidth: hit * unit,
    topKmh: topKmh(programs),
    water: built.water,
    // The jumps' shape, and how they join.
    jumps: {
      count: jumps.length,
      ...JUMP,
      height: moundHeight(JUMP),
      ...built.mounds,
      // Each kind's color, its jumps and its slopes facing the camera and away.
      kinds: [...kinds].map(([kind, color]) => {
        const slopes = built.slopes.filter((slope) => jumps[slope.mound]!.kind === kind);
        return {
          kind,
          color,
          jumps: jumps.filter((jump) => jump.kind === kind).length,
          toward: slopes.filter((slope) => slope.facing === 'toward').length,
          away: slopes.filter((slope) => slope.facing === 'away').length,
        };
      }),
    },
  };
}

/** enduro-racer's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const ENDURO_RACER_CONVERSION: Conversion = (set) => {
  // ENDURO RACER's course from its two ROM zips, written to content, or with `--check` compared.
  const outputs = new OriginalOutputs();
  const built = enduroRacerCourse(set);
  const file = outputs.course(COURSE_ID, built.document);
  outputs.crestTrials(COURSE_ID, crestTrials(built.heights, built.write));
  for (const { image } of built.pictures) outputs.file(image.path, image.bytes);
  // The things of several pieces, one picture each from the ROMs' pixels.
  for (const { image } of built.joined) outputs.file(image.path, image.bytes);
  for (const piece of built.joinedPieces) outputs.piece(piece);
  // Each stage's sky, baked from its background; course images are saved as their exact compact bytes.
  const { skies } = built;
  for (const { name, document } of skies) {
    const text = JSON.stringify(document);
    outputs.file(`images/${name}.json`, text);
  }
  const degrees = (radians: number) => round1((radians * 180) / Math.PI);
  const arcs = built.path.elements.filter((e) => e.turn !== 0);
  const radius = (e: (typeof arcs)[number]) => e.length / Math.abs(e.turn);
  const tightest = arcs.reduce((a, b) => (radius(b) < radius(a) ? b : a));
  const { stationOf } = built;
  return {
    outputs,
    report: {
      conversion: ENDURO_RACER_CONVERSION_VERSION,
      course: file,
      metresAPosition: built.metres,
      metresAUnit: built.unit,
      crossSection: built.cross,
      metres: round1(built.path.length),
      sections: built.spans.map((p) => p.id),
      runs: built.plan.runs.length,
      elements: built.path.elements.length,
      ...fidelityReport(built.plan.fidelity),
      turn: degrees(built.plan.elements.reduce((sum, e) => sum + e.turn, 0)),
      tightest: { at: round1(tightest.start), radius: round1(radius(tightest)) },
      checkpoints: built.checks.map((q) => round1(stationOf(q))),
      finish: round1(stationOf(built.finish)),
      pastFinish: round1(built.path.length - stationOf(built.finish)),
      yawOrigin: round3(built.yawOrigin),
      // The jumps' shape, and how they join.
      jumps: Object.fromEntries(
        Object.entries(built.jumps).map(([k, v]) => [k, typeof v === 'number' ? round3(v) : v]),
      ),
      // The fords, positions, as the original's and with the ramps taken out.
      water: {
        original: built.water.original.map((w) => w.map(round1)),
        laid: built.water.laid.map((w) => w.map(round1)),
      },
      topKmh: built.topKmh,
      ...gradeReport(built.heights, built.screenProfile),
      objects: built.placed.length,
      ground: round3(built.ground),
      bodies: built.placed.filter((o) => o.body !== null).length,
      // The pictures whose bodies the original's hit narrows, with their colored widths.
      narrowed: built.pictures
        .filter((p) => p.colored > built.hitWidth && built.placed.some((o) => o.image === p.name && o.body))
        .map((p) => ({ name: p.name, colored: round3(p.colored) })),
      onOtherPassages: built.dropped,
      onRoad: built.onRoad.length,
      onRoadByStage: Array.from(
        { length: built.run.count },
        (_, stage) =>
          built.onRoad.filter(
            (o) => Math.min(built.run.count - 1, Math.floor(o.position / built.run.positions)) === stage,
          ).length,
      ),
      pictures: built.pictures.length,
      joined: built.joined.map((thing) => thing.report),
      kept: built.kept,
      unlayered: built.unlayered,
      lowered: built.loweredBy,
      skies: skies.length,
    },
  };
};
