import path from 'node:path';
import { loadCourse, atomicWrite, reportError } from './authoring-io.js';
import { createCourseFrameRenderer } from '../authoring/course-views.js';
import { blit, createRaster, encodePng, fillRect, writeText, type Raster } from '../graphics/drawn/raster.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { referenceLine } from './reference-driving-policy.js';
import { readFile } from 'node:fs/promises';
import { readRacingLines } from '../../src/content/racing-line.js';
import { requireLoaded } from '../../src/content/content-load-error.js';

/**
 * OUTRUN TEST's contact sheets, for review by eye: `npm run outrun-test-sheets -- [stage ...] [--crossing link ...]
 * [--out directory]` compiles the content once and writes, for each named stage (every stage when none and no
 * crossing is named), `<stage>.png`: frames of the game's logical frame through the product scene with TESTAROSSA at
 * rest on lane a's centre, from the stage's start through every eighth of it to its fork or goal, each labelled with its
 * station, and every change of environment 150 m past its knot; and for each named Link, `crossing-<link>.png`: a drive across its seam at 30 m/s with the scene's fixed
 * steps, every sixth step, so the background's transition shows. Disposable outputs; nothing reads them.
 */
const args = process.argv.slice(2);
const options = new Map<string, string[]>();
let current: string[] = [];
const names = current;
for (const arg of args)
  if (arg.startsWith('--')) options.set(arg, (current = []));
  else current.push(arg);
const out = path.resolve(options.get('--out')?.[0] ?? 'dist/outrun-test-sheets');
const crossings = options.get('--crossing') ?? [];
const COLUMNS = 4;

/** A sheet of frames in rows of `COLUMNS`, each labelled, under a title. */
function sheetOf(title: string, frames: readonly { pixels: Uint16Array; label: string }[]): Raster {
  const rows = Math.ceil(frames.length / COLUMNS);
  const sheet = createRaster(COLUMNS * 322, rows * 252 + 14);
  fillRect(sheet, 0, 0, sheet.width, sheet.height, 0x101018);
  writeText(sheet, 4, 3, title, 1, 0xf8d030);
  frames.forEach((frame, i) => {
    const tile = createRaster(320, 240);
    frame.pixels.forEach((value, k) => {
      const { r, g, b } = unpackRgba(rgb555ToRgba(value));
      tile.pixels[k] = 0x1000000 | (r << 16) | (g << 8) | b;
    });
    const x = (i % COLUMNS) * 322 + 1,
      y = 14 + Math.floor(i / COLUMNS) * 252;
    blit(sheet, tile, x, y);
    writeText(sheet, x, y + 242, frame.label, 1, 0xe0e0e0);
  });
  return sheet;
}

try {
  const { course, content } = await loadCourse(
    new URL('../../content/courses/outrun-test.course.json', import.meta.url).pathname,
  );
  const written: string[] = [];
  const write = async (name: string, sheet: Raster) => {
    const file = path.join(out, `${name}.png`);
    await atomicWrite(file, encodePng(sheet));
    written.push(file);
  };
  const stages = names.length
    ? course.sections.filter((s) => names.includes(s.id))
    : crossings.length
      ? []
      : course.sections;
  for (const section of stages) {
    const length = section.coordinates.domain.end;
    // Lane a's centre, the centreline.
    const stations = [10, ...Array.from({ length: 7 }, (_, i) => ((i + 1) * length) / 8)];
    if (section.fork) stations.push(section.fork.lock.s - 120, section.fork.lock.s + 40, section.fork.closure.s + 100);
    else stations.push(length - 600, length - 470, length - 300);
    stations.push(length - 5);
    // Each change of environment within the stage (a wet stretch's sky, a tunnel), seen 150 m past its knot.
    stations.push(...section.appearance.environments.slice(1).map((e) => Math.min(length - 5, e.at.s + 150)));
    stations.sort((a, b) => a - b);
    const renderer = createCourseFrameRenderer(content, course, section, {
      vehicle: 'TESTAROSSA',
      ...(section.outgoing[0] ? { exit: section.outgoing[0].id, through: length } : {}),
    });
    const frames = stations.map((s) => ({
      pixels: renderer.render(Math.min(length, Math.max(0, s)), 0).pixels,
      label: `S ${Math.round(s)}`,
    }));
    await write(section.id, sheetOf(`${section.id.toUpperCase()} ${Math.round(length)} M`, frames));
  }
  const entry = content.definitions.vehicles.find((e) => e.compiledVehicle.id === 'TESTAROSSA')!;
  // The course's saved racing lines, which the car keeps to.
  const lines = requireLoaded(
    readRacingLines(
      course,
      JSON.parse(await readFile(new URL(`../../content/racing-lines/${course.id}.json`, import.meta.url), 'utf8')),
    ),
  );
  for (const id of crossings) {
    const section = course.sections.find((s) => s.outgoing.some((link) => link.id === id));
    if (!section) throw new RangeError(`Unknown Link ${id}`);
    const link = section.outgoing.find((l) => l.id === id)!,
      end = section.coordinates.domain.end;
    const scene = createCourseScene(section, course.gates, content.definitions.vehicles);
    scene.runtime.selectSuccessor(link);
    scene.runtime.refresh(0, end);
    const model = createVehicleModel(createRunVehicle(entry, content.definitions.driving), SIM_DT),
      sprites = createVehicleSprites(entry),
      rig = createCameraRig(),
      target = createLogicalFrame();
    // The car keeps to the reference line toward the Link's exit.
    const exit = section.fork!.exits.findIndex((e) => e.link === link);
    const lane = referenceLine(scene.runtime.route, lines, () => exit);
    const frames: { pixels: Uint16Array; label: string }[] = [];
    // From 30 m before the seam at 30 m/s: the camera, 6 m behind, crosses it after about 1.2 s.
    for (let step = 0; step <= 150; step++) {
      const s = end - 30 + 30 * step * SIM_DT;
      scene.runtime.refresh(s, s);
      const vehicle = createVehicle(model, scene.world, { s, l: lane(s), initialSpeed: 0 });
      const camera = updateCamera(rig, scene.world, vehicle, CAMERA_DEFINITION, 'FACING');
      scene.advance(camera);
      if (step % 6 || step < 54) continue;
      scene.render(target, { vehicle, set: sprites.off, reach: entry.compiledVehicle.reach }, camera, [], [], []);
      frames.push({ pixels: target.pixels.slice(), label: `T ${(step * SIM_DT).toFixed(1)} S ${camera.s.toFixed(0)}` });
    }
    await write(`crossing-${id}`, sheetOf(`CROSSING ${id.toUpperCase()}`, frames));
  }
  console.log(JSON.stringify({ ok: true, written }));
} catch (error) {
  reportError(error);
}
