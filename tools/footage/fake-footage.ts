import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';

/**
 * Raw 8-bit RGB in, RGB out: `PNG.sync.write` reads these from its options, not from the PNG's own, and writes into
 * the options it is given, so each write takes a fresh copy.
 */
const rgbPng = () => ({ colorType: 2, inputColorType: 2, inputHasAlpha: false }) as const;
import { formatSavedJson } from '../../src/content/saved-json.js';
import { atomicWrite, loadCourse } from '../course/authoring-io.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { cameraRightDistance, horizonY, pseudoProject } from '../../src/view/projection.js';
import { RENDER_FAR_DEPTH_METERS, RENDER_NEAR_DEPTH_METERS, type CameraState } from '../../src/view/camera.js';
import { createDynamicVehicleCourseSprite } from '../../src/view/dynamic-vehicle-sprite.js';
import type { CourseSprite } from '../../src/view/course-sprite.js';
import { drawScaledSprite } from '../../src/view/sprite.js';
import { selectVehicleSprite } from '../../src/vehicle/vehicle-sprite-set.js';
import { createTextLayer } from '../../src/view/text-layer.js';
import { compileTextTiles, TEXT_PALETTES } from '../../src/image/text-tiles.js';
import { rgb555ToRgba } from '../../src/image/rgb555.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { fakeTruthCourse } from './fake-course.js';
import {
  FAKE_CAMERA,
  FAKE_CORRUPTION,
  FAKE_COURSE,
  FAKE_GAME,
  FAKE_PLAYER,
  FAKE_TRAFFIC,
  FAKE_VIDEOS,
  type FakeVideo,
} from './fake-plan.js';
import {
  fakeRoute,
  FRAME_SECONDS,
  interpolate,
  planDrive,
  sampleRoute,
  trafficAt,
  type FakeDrive,
  type RouteProfile,
} from './fake-drive.js';

/** The truth record's format: everything a round trip compares with, beside the video. */
export const FAKE_TRUTH_FORMAT = Object.freeze({ format: 'superoutride.fake-footage-truth', version: 2 } as const);

/** The HUD the fake original draws in text tiles: its places, in text cells, and how long an event's text stays. */
export const FAKE_HUD = Object.freeze({
  time: Object.freeze({ label: cell(1, 1), value: cell(6, 1), start: 120, bonus: 130 }),
  stage: Object.freeze({ label: cell(31, 1), value: cell(37, 1) }),
  speed: Object.freeze({ value: cell(2, 26), digits: 3, unit: cell(6, 26) }),
  event: Object.freeze({ row: 8, seconds: 2 }),
});
function cell(column: number, row: number) {
  return Object.freeze({ column, row });
}

/** The directory of the fake original's course: its truth course document and one directory per video. */
export function fakeCourseDirectory(root: string) {
  return path.join(root, FAKE_GAME, FAKE_COURSE);
}

/**
 * Write the truth course and every named video of the fake original (all of `FAKE_VIDEOS` when none is named) under
 * `root` (`reference-media/` by default): `<video>/video.mp4` and `<video>/truth.json`.
 */
/**
 * How to draw: the first `seconds` only (a preview), every `exact`th kept frame and the one after it also written as
 * game-pixel PNGs under `<video>/exact/` (the frames as the original drew them, before capture: the pairs let a
 * frame-to-frame shift be measured too), and whether to encode the video at all.
 */
export interface FakeDrawing {
  readonly seconds: number;
  readonly exact: number;
  readonly encode: boolean;
}

export async function writeFakeFootage(
  root: string,
  names: readonly string[],
  drawing: FakeDrawing = { seconds: Infinity, exact: 0, encode: true },
) {
  const videos = names.length ? FAKE_VIDEOS.filter((video) => names.includes(video.id)) : FAKE_VIDEOS;
  if (videos.length !== (names.length || FAKE_VIDEOS.length)) throw new RangeError('Unknown fake video');
  const directory = fakeCourseDirectory(root);
  const file = path.join(directory, `${FAKE_COURSE}.course.json`);
  const outrunTest = JSON.parse(
    await readFile(new URL('../../content/courses/outrun-test.course.json', import.meta.url), 'utf8'),
  );
  await atomicWrite(file, formatSavedJson(fakeTruthCourse(outrunTest)));
  const { course, content } = await loadCourse(file);
  const tiles = compileTextTiles(
    JSON.parse(await readFile(new URL('../../content/text-tiles/default.json', import.meta.url), 'utf8')),
  );
  const written = [];
  for (const video of videos)
    written.push(await writeVideo(directory, course, content.definitions.vehicles, tiles, video, drawing));
  const player = content.definitions.vehicles.find((v) => v.compiledVehicle.id === FAKE_PLAYER)!;
  return { written, gauge: pictureGauge(createVehicleSprites(player).off) };
}

/** OUTRUN TEST's start gantry stands over its grid, 205 m into its entry stage (`tools/course/outrun-test.ts`). */
const START_GANTRY_STATION = 205;

/** The route's landmarks in route stations: the truth the landmark step must recover. */
function routeLandmarks(course: CompiledCourse, route: RouteProfile) {
  const stages = route.stages;
  const pole = course.gates.grid[0]!;
  const last = stages.at(-1)!;
  const finish =
    course.gates.intervals.find((interval) => interval.section === last.section)!.finish!.at.s + last.start;
  // A fork begins where its median first widens from zero toward the fork, after any earlier divided stretch.
  const forkBeginnings = stages
    .filter((stage) => stage.exit)
    .map((stage) => {
      const median = stage.section.lanes.elements.find((element) => element.kind === 'median');
      if (!median || median.kind !== 'median') throw new Error(`${stage.section.id} has no median`);
      const vertices = median.width.vertices;
      let begin = NaN;
      for (let i = 1; i < vertices.length; i++)
        if (vertices[i - 1]!.l === 0 && vertices[i]!.l > 0) begin = vertices[i - 1]!.at.s;
      return begin + stage.start;
    });
  return {
    /** The start line: OUTRUN TEST's start gantry, 205 m into its entry stage. */
    startLine: START_GANTRY_STATION,
    pole: pole.at.s,
    poleL: pole.l,
    checkpoints: stages.slice(1).map((stage) => stage.start),
    forkBeginnings,
    finish,
  };
}

async function writeVideo(
  directory: string,
  course: CompiledCourse,
  vehicles: Parameters<typeof createCourseScene>[2],
  tiles: ReturnType<typeof compileTextTiles>,
  video: FakeVideo,
  drawing: FakeDrawing,
) {
  const started = Date.now();
  const stages = fakeRoute(course);
  const route = sampleRoute(stages);
  const landmarks = routeLandmarks(course, route);
  // A planning scene answers where things are; the drawing scene below walks the route once more.
  const planning = createScene(course, vehicles, stages);
  const sample = createPlanCoordinateSample(),
    other = createPlanCoordinateSample();
  const playerRight = (s: number, l: number, yaw: number, playerS: number, playerL: number) => {
    planning.runtime.refresh(s, playerS);
    const coordinates = planning.world.coordinates;
    const camera = coordinates.toWorld(s, l, sample);
    const player = coordinates.toWorld(playerS, playerL, other);
    return cameraRightDistance(player, { x: camera.x, z: camera.z, yaw: camera.heading + yaw });
  };
  const player = vehicles.find((v) => v.compiledVehicle.id === FAKE_PLAYER)!;
  const anchorDistance = playerAnchorDistance(createVehicleSprites(player).off);
  const planned = planDrive(
    route,
    landmarks.pole,
    landmarks.finish,
    landmarks.checkpoints,
    video.seed,
    video.pitch,
    anchorDistance,
    playerRight,
  );
  // A preview keeps the first `seconds` of the drive.
  const previewFrames = planned.frames.filter((frame) => frame.t < drawing.seconds);
  const drive = {
    ...planned,
    frames: previewFrames,
    events: planned.events.filter((event) => event.frame < previewFrames.length),
  };
  const hills = hillCorruption(route);
  const out = path.join(directory, video.id);
  await mkdir(out, { recursive: true });
  const frames = await renderAndEncode(out, course, vehicles, stages, route, drive, tiles, video, hills, drawing);
  const traffic = FAKE_TRAFFIC.map((id) => vehicles.find((v) => v.compiledVehicle.id === id)!);
  const step = 60 / video.fps;
  const kept = drive.frames.filter((_, index) => index % step === 0);
  // The camera's heading in the world, which the background turns with (its yaw from the road on the road's heading),
  // on a scene of its own: a scene's resident window only moves forward.
  const walk = createScene(course, vehicles, stages);
  const headings = kept.map((frame) => {
    walk.runtime.refresh(frame.s, frame.playerS);
    return walk.world.coordinates.toWorld(frame.s, frame.l, sample).heading + frame.yaw;
  });
  const truth = {
    ...FAKE_TRUTH_FORMAT,
    game: FAKE_GAME,
    course: FAKE_COURSE,
    stages: stages.map((stage) => ({ id: stage.section.id, start: stage.start, exit: stage.exit?.id ?? null })),
    video,
    camera: { ...FAKE_CAMERA, anchorDistance, pitch: video.pitch },
    // Each vehicle's overall width and its picture's gauge width: the width the fake original draws it at the road's
    // scale of its picture's lowest row, which the round trip's gauge takes as the vehicle's width.
    gauge: {
      vehicle: FAKE_PLAYER,
      overallWidth: player.compiledVehicle.overallWidth,
      ...pictureGauge(createVehicleSprites(player).off),
      traffic: traffic.map((v) => ({
        vehicle: v.compiledVehicle.id,
        overallWidth: v.compiledVehicle.overallWidth,
        ...pictureGauge(createVehicleSprites(v).off),
      })),
    },
    corruption:
      video.corruption === 'hills'
        ? { kind: 'hills', rows: FAKE_CORRUPTION.hillRows, intervals: hills.intervals }
        : video.corruption === 'player'
          ? { kind: 'player', scale: FAKE_CORRUPTION.playerScale }
          : video.corruption === 'background'
            ? {
                kind: 'background',
                vertical: 'road-horizon',
                horizontal: 'curvature',
                factor: FAKE_CAMERA.backgroundScroll,
                ...FAKE_CORRUPTION.background,
              }
            : null,
    landmarks,
    events: drive.events.map((event) => ({ ...event, frame: event.frame / step })),
    hud: FAKE_HUD,
    traffic: drive.traffic,
    frames: {
      t: kept.map((f) => f.t),
      s: kept.map((f) => f.s),
      l: kept.map((f) => f.l),
      yaw: kept.map((f) => f.yaw),
      heading: headings,
      pitch: kept.map((f) => f.pitch),
      y: kept.map((f) => f.y),
      playerS: kept.map((f) => f.playerS),
      playerL: kept.map((f) => f.playerL),
      speed: kept.map((f) => f.speed),
      displayedKmh: kept.map((f) => f.displayedKmh),
    },
  };
  await writeFile(path.join(out, 'truth.json'), JSON.stringify(truth));
  return {
    video: video.id,
    frames,
    seconds: Math.round(kept.at(-1)!.t),
    routeMeters: route.length,
    traffic: drive.traffic.length,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
  };
}

/**
 * From the camera to the player picture's base point: `playerDistance` to the road under the picture's lowest row, which
 * stands nearer than its base point by as much as the picture seen from behind reaches below it. On level road the rows
 * below the horizon are `K/D′ = K/D + e·f/D` for a reach `e` below the base point, so `D = D′·(h + e)/h`.
 */
function playerAnchorDistance(set: ReturnType<typeof createVehicleSprites>['off']): number {
  return (FAKE_CAMERA.playerDistance * (FAKE_CAMERA.height + pictureGauge(set).reach)) / FAKE_CAMERA.height;
}

/**
 * A vehicle picture seen from behind, at full size: its opaque width and how far it reaches below its base point (m at
 * 40 texels per metre), and its gauge width, the width it is drawn at the road's scale of its lowest row. On level road
 * that row lies at depth `d·h/(h + e)` for a base point at `d`, so the gauge width is `width·h/(h + e)`: a product
 * picture is a view in perspective, wider than the vehicle at its base point.
 */
export function pictureGauge(set: ReturnType<typeof createVehicleSprites>['off']) {
  const level = set.assets[0]![0]!.levels[0]!;
  let lowest = -1,
    left = Infinity,
    right = -Infinity;
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++)
      if (level.pattern.indexAt(y * level.width + x)) {
        lowest = y;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
      }
  const width = (right - left) / 40,
    reach = (lowest + 1 - (level.anchorY + 0.5)) / 40;
  return { width, reach, gaugeWidth: (width * FAKE_CAMERA.height) / (FAKE_CAMERA.height + reach) };
}

/** A scene on the route with every exit selected, so it extends through the whole route as the camera moves. */
function createScene(
  course: CompiledCourse,
  vehicles: Parameters<typeof createCourseScene>[2],
  stages: ReturnType<typeof fakeRoute>,
) {
  const scene = createCourseScene(course.entry, course.gates, vehicles);
  for (const stage of stages) if (stage.exit) scene.runtime.selectSuccessor(stage.exit);
  return scene;
}

/**
 * The hills corruption: while the camera passes within 60 m of a vertical curve, rows below the horizon move down by up
 * to `hillRows` (crests) or up (sags), easing in and out over 60 m. Returned per route metre, with its intervals.
 */
function hillCorruption(route: RouteProfile) {
  const n = route.length + 1;
  const curve = new Int8Array(n);
  for (let i = 1; i < n - 1; i++) {
    const nu = route.height[i + 1]! - 2 * route.height[i]! + route.height[i - 1]!;
    curve[i] = Math.abs(nu) > 1e-7 ? (nu < 0 ? 1 : -1) : 0;
  }
  const intervals: { start: number; end: number; sign: number }[] = [];
  for (let i = 0; i < n; i++)
    if (curve[i] && (i === 0 || curve[i - 1] !== curve[i])) {
      let j = i;
      while (j + 1 < n && curve[j + 1] === curve[i]) j++;
      intervals.push({ start: i - 60, end: j + 60, sign: curve[i]! });
    }
  const shift = new Float64Array(n);
  for (const { start, end, sign } of intervals)
    for (let i = Math.max(0, start); i <= Math.min(n - 1, end); i++) {
      const ease = Math.min(1, (i - start) / 60, (end - i) / 60);
      const value = sign * FAKE_CORRUPTION.hillRows * Math.sin((Math.PI / 2) * ease) ** 2;
      if (Math.abs(value) > Math.abs(shift[i]!)) shift[i] = value;
    }
  return { intervals, shift };
}

async function renderAndEncode(
  out: string,
  course: CompiledCourse,
  vehicles: Parameters<typeof createCourseScene>[2],
  stages: ReturnType<typeof fakeRoute>,
  route: RouteProfile,
  drive: FakeDrive,
  tiles: ReturnType<typeof compileTextTiles>,
  video: FakeVideo,
  hills: ReturnType<typeof hillCorruption>,
  drawing: FakeDrawing,
) {
  const scene = createScene(course, vehicles, stages);
  const player = vehicles.find((v) => v.compiledVehicle.id === FAKE_PLAYER)!;
  const playerSprites = createVehicleSprites(player);
  const trafficSprites = new Map(
    FAKE_TRAFFIC.map((id) => [id, createVehicleSprites(vehicles.find((v) => v.compiledVehicle.id === id)!)] as const),
  );
  const reach = new Map(vehicles.map((v) => [v.compiledVehicle.id, v.compiledVehicle.reach] as const));
  const text = createTextLayer(tiles);
  const target = createLogicalFrame();
  const farTarget = video.corruption === 'background' ? createLogicalFrame() : null;
  const { width, height } = FAKE_CAMERA.frame;
  const rgb = Buffer.alloc(width * height * 3);
  const table = new Uint32Array(0x8000);
  for (let value = 0; value < 0x8000; value++) table[value] = rgb555ToRgba(value);
  const corrupted = new Uint16Array(width * height);
  const sample = createPlanCoordinateSample();
  const encoder = drawing.encode ? startEncoder(path.join(out, 'video.mp4'), video) : null;
  const exact = path.join(out, 'exact');
  if (drawing.exact) await mkdir(exact, { recursive: true });
  const png = new PNG({ width, height, colorType: 2, inputColorType: 2, inputHasAlpha: false });
  const step = 60 / video.fps;
  let written = 0;
  let timeLeft: number = FAKE_HUD.time.start;
  let stage = 1;
  let shownEvent: { text: string; until: number } | null = null;
  const held = new Map<number, number>();
  for (let index = 0; index < drive.frames.length; index++) {
    const frame = drive.frames[index]!;
    scene.runtime.refresh(frame.playerS, frame.playerS);
    const world = scene.world;
    const at = world.coordinates.toWorld(frame.s, frame.l, sample);
    const camera: CameraState = {
      x: at.x,
      y: frame.y,
      z: at.z,
      yaw: at.heading + frame.yaw,
      pitch: frame.pitch,
      s: frame.s,
      focalLength: FAKE_CAMERA.focalLength,
      centerX: FAKE_CAMERA.centerX,
      centerY: FAKE_CAMERA.horizonRow,
      backgroundScroll: FAKE_CAMERA.backgroundScroll,
      heldAtLimit: 0,
    };
    scene.advance(camera);
    // The HUD's clock and events, at every 60 Hz frame whether or not this video keeps it.
    for (const event of drive.events)
      if (event.frame === index) {
        if (event.kind === 'go') shownEvent = { text: 'GO', until: frame.t + FAKE_HUD.event.seconds };
        if (event.kind === 'checkpoint') {
          timeLeft += FAKE_HUD.time.bonus;
          stage++;
          shownEvent = { text: 'TIME BONUS', until: frame.t + FAKE_HUD.event.seconds };
        }
        if (event.kind === 'goal') shownEvent = { text: 'GOAL', until: frame.t + FAKE_HUD.event.seconds };
      }
    if (index > drive.go) timeLeft = Math.max(0, timeLeft - FRAME_SECONDS);
    if (index % step) continue;
    const others: CourseSprite[] = [];
    drive.traffic.forEach((vehicle, k) => {
      const place = trafficAt(route, vehicle, index, drive.go);
      const d = place.s - frame.s;
      if (d < 2.5 || d > 200) return;
      const position = world.coordinates.toWorld(place.s, place.l, sample);
      const base = { x: position.x, y: world.height.sample(place.s), z: position.z, s: place.s };
      const pose = {
        x: base.x,
        z: base.z,
        yaw: position.heading + place.yaw,
        course: { s: place.s, l: place.l },
        renderY: base.y,
        lateralAcceleration: 0,
      };
      const shadow = { y: base.y, reach: reach.get(vehicle.vehicle)! };
      const { sprite, yawIndex } = createDynamicVehicleCourseSprite(
        `traffic-${k}`,
        pose,
        base,
        shadow,
        camera,
        trafficSprites.get(vehicle.vehicle as (typeof FAKE_TRAFFIC)[number])!.off,
        held.get(k),
      );
      held.set(k, yawIndex);
      others.push(sprite);
    });
    const playerAt = world.coordinates.toWorld(frame.playerS, frame.playerL, sample);
    const playerVehicle = {
      x: playerAt.x,
      z: playerAt.z,
      yaw: playerAt.heading + frame.playerYaw,
      course: { s: frame.playerS, l: frame.playerL },
      renderY: world.height.sample(frame.playerS),
      lateralAcceleration: 0,
    };
    const drawn =
      video.corruption === 'player'
        ? null
        : { vehicle: playerVehicle, set: playerSprites.off, reach: player.compiledVehicle.reach };
    // The background corruption: down, its horizon stuck to the row where the road ahead ends; across, turning with the
    // road's heading alone, the camera's yaw from the road ignored; its rows well above that horizon a farther layer
    // turning slower.
    const pose =
      video.corruption === 'background' ? { yaw: at.heading, horizon: roadEndRow(world.height, camera) } : null;
    scene.render(target, drawn, pose ? { ...camera, background: pose } : camera, others, []);
    if (pose && farTarget) {
      const { farRows, farSpeed } = FAKE_CORRUPTION.background;
      scene.render(farTarget, drawn, { ...camera, background: { ...pose, yaw: pose.yaw * farSpeed } }, others, []);
      const rows = Math.max(0, Math.min(height, Math.floor(pose.horizon) - farRows));
      target.pixels.set(farTarget.pixels.subarray(0, rows * target.width));
    }
    if (video.corruption === 'player') {
      // The player laid over at one fixed size, off the road's scale, standing where its base point projects.
      const base = pseudoProject({ x: playerAt.x, y: playerVehicle.renderY, z: playerAt.z, s: frame.playerS }, camera);
      const { asset } = selectVehicleSprite(playerSprites.off, playerVehicle.yaw - camera.yaw);
      const scale = (FAKE_CORRUPTION.playerScale * FAKE_CAMERA.focalLength) / FAKE_CAMERA.playerDistance;
      drawScaledSprite(target, asset, base.x, base.y, scale);
    }
    let pixels = target.pixels;
    if (video.corruption === 'hills') {
      const shift = Math.round(interpolate(hills.shift, Math.max(0, frame.s)));
      if (shift) pixels = shiftGroundRows(pixels, corrupted, width, height, camera, shift);
    }
    // The HUD over the frame.
    text.clear();
    text.write(FAKE_HUD.time.label.column, FAKE_HUD.time.label.row, 'TIME', TEXT_PALETTES.YELLOW);
    text.write(
      FAKE_HUD.time.value.column,
      FAKE_HUD.time.value.row,
      String(Math.ceil(timeLeft)).padStart(3, ' '),
      TEXT_PALETTES.WHITE,
    );
    text.write(FAKE_HUD.stage.label.column, FAKE_HUD.stage.label.row, 'STAGE', TEXT_PALETTES.YELLOW);
    text.write(FAKE_HUD.stage.value.column, FAKE_HUD.stage.value.row, String(stage), TEXT_PALETTES.WHITE);
    text.write(
      FAKE_HUD.speed.value.column,
      FAKE_HUD.speed.value.row,
      String(frame.displayedKmh).padStart(FAKE_HUD.speed.digits, ' '),
      TEXT_PALETTES.WHITE,
    );
    text.write(FAKE_HUD.speed.unit.column, FAKE_HUD.speed.unit.row, 'KMH', TEXT_PALETTES.YELLOW);
    if (shownEvent && frame.t < shownEvent.until)
      text.write(
        Math.floor((40 - shownEvent.text.length) / 2),
        FAKE_HUD.event.row,
        shownEvent.text,
        TEXT_PALETTES.YELLOW,
      );
    if (pixels !== target.pixels) target.pixels.set(pixels.subarray(0, width * height));
    text.draw(target);
    for (let i = 0, o = 0; i < width * height; i++, o += 3) {
      const color = table[target.pixels[i]!]!;
      rgb[o] = color & 0xff;
      rgb[o + 1] = (color >>> 8) & 0xff;
      rgb[o + 2] = (color >>> 16) & 0xff;
    }
    if (drawing.exact && written % drawing.exact < 2) {
      png.data = rgb;
      await writeFile(path.join(exact, `${String(written).padStart(6, '0')}.png`), PNG.sync.write(png, rgbPng()));
    }
    await encoder?.write(rgb);
    written++;
  }
  await encoder?.end();
  return written;
}

/** The frame with rows below the horizon moved down by `shift` (up when negative), the horizon row filling the gap. */
/** The topmost screen row the road ahead reaches, out to the renderer's far depth (sampled every metre). */
function roadEndRow(height: { sample(s: number): number }, camera: CameraState) {
  let top = Infinity;
  for (let d = RENDER_NEAR_DEPTH_METERS; d <= RENDER_FAR_DEPTH_METERS; d++)
    top = Math.min(
      top,
      horizonY(camera) - (camera.focalLength / d) * (height.sample(camera.s + d) - camera.y) * Math.cos(camera.pitch),
    );
  return top;
}

function shiftGroundRows(
  source: Uint16Array,
  out: Uint16Array,
  width: number,
  height: number,
  camera: CameraState,
  shift: number,
) {
  const horizon = Math.max(-1, Math.floor(camera.centerY - camera.focalLength * Math.sin(camera.pitch)));
  out.set(source.subarray(0, width * height));
  for (let y = Math.max(0, horizon + 1); y < height; y++) {
    const from = Math.min(height - 1, Math.max(horizon + 1, y - shift));
    out.set(source.subarray(from * width, from * width + width), y * width);
  }
  return out;
}

/** An ffmpeg process taking raw RGB game-pixel frames and writing the captured video. */
function startEncoder(file: string, video: FakeVideo) {
  const { width, height } = FAKE_CAMERA.frame;
  const matrix = video.matrix === 'bt709' ? 'bt709' : 'bt470bg';
  const range = video.range === 'full' ? 'pc' : 'tv';
  const filter = [
    `scale=${width * video.scale}:${height * video.scale}:flags=neighbor`,
    `pad=${video.width}:${video.height}:${video.left}:${video.top}:black`,
    `scale=out_color_matrix=${video.matrix}:out_range=${video.range === 'full' ? 'full' : 'limited'}`,
    'format=yuv420p',
  ].join(',');
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-s',
    `${width}x${height}`,
    '-r',
    String(video.fps),
    '-i',
    '-',
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    String(video.crf),
    '-colorspace',
    matrix,
    '-color_primaries',
    video.matrix === 'bt709' ? 'bt709' : 'bt470bg',
    '-color_trc',
    video.matrix === 'bt709' ? 'bt709' : 'smpte170m',
    '-color_range',
    range,
    file,
  ];
  const child = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  let failure: Error | null = null;
  const done = new Promise<void>((resolve) => {
    child.on('error', (error) => ((failure = error), resolve()));
    child.on('close', (code) => {
      if (code !== 0) failure ??= new Error(`ffmpeg exited with ${code}`);
      resolve();
    });
  });
  child.stdin.on('error', (error) => (failure ??= error));
  return {
    write: (data: Buffer) =>
      new Promise<void>((resolve, reject) => {
        if (failure) return reject(failure);
        if (child.stdin.write(data)) resolve();
        else child.stdin.once('drain', resolve);
      }),
    end: async () => {
      child.stdin.end();
      await done;
      if (failure) throw failure;
    },
  };
}
