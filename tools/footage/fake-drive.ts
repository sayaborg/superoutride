import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledSection } from '../../src/course/compiler/course-graph.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import { courseLane } from '../../src/course/course-lanes.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { FAKE_CAMERA, FAKE_DRIVING, FAKE_STAGES, FAKE_TRAFFIC } from './fake-plan.js';

/** The frame step: the fake original updates at 60 Hz. */
export const FRAME_SECONDS = 1 / 60;

/** One Section of the route: where it starts on the route ruler, its lateral origin and the lanes of its taken road. */
export interface RouteStage {
  readonly section: CompiledSection;
  readonly start: number;
  readonly lateralOrigin: number;
  /** The Link the route leaves by, or null at the goal. */
  readonly exit: CompiledSection['outgoing'][number] | null;
}

/** The route the footage drives: `FAKE_STAGES` through their taken exits, with each Section's place on it. */
export function fakeRoute(course: CompiledCourse): readonly RouteStage[] {
  const stages: RouteStage[] = [];
  let start = 0,
    lateralOrigin = 0,
    section = course.entry;
  for (let index = 0; index < FAKE_STAGES.length; index++) {
    if (section.id !== FAKE_STAGES[index])
      throw new Error(`The route reached ${section.id}, not ${FAKE_STAGES[index]}`);
    const next = FAKE_STAGES[index + 1];
    const exit = next ? section.outgoing.find((link) => link.to.section.id === next)! : null;
    stages.push({ section, start, lateralOrigin, exit });
    if (!exit) break;
    start += section.coordinates.domain.end;
    lateralOrigin += exit.to.lateralOrigin - exit.from.lateralOrigin;
    section = exit.to.section;
  }
  return stages;
}

/** The route sampled every metre: curvature, height and the taken road's two lane centres (route laterals). */
export interface RouteProfile {
  readonly length: number;
  readonly curvature: Float64Array;
  readonly height: Float64Array;
  readonly laneCenters: readonly [Float64Array, Float64Array];
  readonly stages: readonly RouteStage[];
}

export function sampleRoute(stages: readonly RouteStage[]): RouteProfile {
  const last = stages.at(-1)!;
  const length = Math.floor(last.start + last.section.coordinates.domain.end);
  const n = length + 1;
  const curvature = new Float64Array(n),
    height = new Float64Array(n);
  const laneCenters = [new Float64Array(n), new Float64Array(n)] as const;
  const sample = createPlanCoordinateSample();
  for (let i = 0, k = 0; i < n; i++) {
    while (k + 1 < stages.length && i >= stages[k + 1]!.start) k++;
    const stage = stages[k]!,
      section = stage.section;
    const s = Math.min(i - stage.start, section.coordinates.domain.end);
    // Curvature from the Section's own headings a metre either side, within the Section.
    const end = section.coordinates.domain.end;
    const a = Math.max(0, s - 1),
      b = Math.min(end, s + 1);
    const ha = section.coordinates.toWorld(a, 0, sample).heading,
      hb = section.coordinates.toWorld(b, 0, sample).heading;
    curvature[i] = Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha)) / (b - a);
    height[i] = section.height.sample(s);
    // The taken road's lanes: the exit lane's road once the fork's second road has opened, else lanes a and b.
    const exitLane = stage.exit?.from.lane.id ?? 'a';
    const fork = section.coordinates.domain.end - 900;
    const ids = exitLane === 'c' && s > fork + 60 ? (['c', 'd'] as const) : (['a', 'b'] as const);
    ids.forEach((id, j) => {
      laneCenters[j]![i] = courseBoundaryAt(courseLane(section.lanes, id)!.center, s) - stage.lateralOrigin;
    });
  }
  return { length, curvature, height, laneCenters, stages };
}

/** A deterministic random sequence in [0, 1). */
export function random(seed: number) {
  let state = seed * 2654435761 + 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth random function of s: a sum of three sines of random wavelengths in [low, high] metres. */
function smoothNoise(next: () => number, low: number, high: number) {
  const terms = Array.from({ length: 3 }, () => ({
    k: (2 * Math.PI) / (low + (high - low) * next()),
    phase: 2 * Math.PI * next(),
  }));
  return (s: number) => terms.reduce((sum, term) => sum + Math.sin(term.k * s + term.phase), 0) / 3;
}

/** The camera's pose and the player's place at one frame: the truth of that frame. */
export interface FakeFrame {
  readonly t: number;
  /** Camera chainage and lateral (route), yaw relative to the road, pitch and height. */
  readonly s: number;
  readonly l: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly y: number;
  /** The player picture's base point (route) and its body yaw relative to the road. */
  readonly playerS: number;
  readonly playerL: number;
  readonly playerYaw: number;
  /** The player's speed, m/s, and the integer km/h the HUD shows. */
  readonly speed: number;
  readonly displayedKmh: number;
}

/** A timing event the HUD shows: GO, a checkpoint crossed, the goal crossed. */
export interface FakeEvent {
  readonly kind: 'go' | 'checkpoint' | 'goal';
  /** The frame index and the time the player's base point reached it. */
  readonly frame: number;
  readonly t: number;
  /** The route station of the line crossed (the player's station at GO). */
  readonly s: number;
}

/** One traffic vehicle: its model, lane index on the taken road, start station and speed; it drives from GO. */
export interface FakeTraffic {
  readonly vehicle: string;
  readonly lane: 0 | 1;
  readonly start: number;
  readonly speed: number;
}

export interface FakeDrive {
  readonly frames: readonly FakeFrame[];
  readonly events: readonly FakeEvent[];
  readonly traffic: readonly FakeTraffic[];
  /** The frame at GO. */
  readonly go: number;
}

/**
 * One video's drive: the player from the pole to past the goal along the route at a speed the road's curvature limits,
 * weaving across its road's two lanes, with the camera `playerDistance` behind it, looking aside now and then, and
 * traffic it passes clear of.
 */
export function planDrive(
  route: RouteProfile,
  pole: number,
  finish: number,
  checkpoints: readonly number[],
  seed: number,
  /** From the camera to the player picture's base point, m: `playerDistance` plus how far the picture reaches below it. */
  anchorDistance: number,
  /** The road's right-hand distance of the player's base point from a camera at (s, l) facing yaw from the road. */
  playerRight: (s: number, l: number, yaw: number, playerS: number, playerL: number) => number,
): FakeDrive {
  const next = random(seed);
  const { length } = route;
  const D = anchorDistance;
  // Timing happens where the player stands: `playerDistance` from the camera, behind the picture's base point.
  const behind = anchorDistance - FAKE_CAMERA.playerDistance;
  // The speed limit along the route: the top speed varied, the curvature's lateral limit, then braking and
  // acceleration passes; after the goal, the runout speed.
  const vary = smoothNoise(next, 800, 2500);
  const limit = new Float64Array(length + 1);
  for (let i = 0; i <= length; i++) {
    let k = 0;
    for (let j = Math.max(0, i - 20); j <= Math.min(length, i + 20); j++)
      k = Math.max(k, Math.abs(route.curvature[j]!));
    limit[i] = Math.min(
      FAKE_DRIVING.topSpeed * (0.9 + 0.1 * vary(i)),
      Math.sqrt(FAKE_DRIVING.lateralAcceleration / Math.max(k, 1e-9)),
      i > finish ? FAKE_DRIVING.runoutSpeed : Infinity,
    );
  }
  for (let i = length - 1; i >= 0; i--)
    limit[i] = Math.min(limit[i]!, Math.sqrt(limit[i + 1]! ** 2 + 2 * FAKE_DRIVING.braking));
  limit[Math.floor(pole)] = 0;
  for (let i = Math.floor(pole) + 1; i <= length; i++)
    limit[i] = Math.min(limit[i]!, Math.sqrt(limit[i - 1]! ** 2 + 2 * FAKE_DRIVING.acceleration));
  const speedAt = (s: number) => {
    const i = Math.min(length - 1, Math.max(0, Math.floor(s)));
    return limit[i]! + (limit[i + 1]! - limit[i]!) * (s - i);
  };
  // The weave: across the road's two lanes, never quite onto its edges.
  const weave = smoothNoise(next, 250, 700);
  const target = (s: number) => {
    const i = Math.min(length, Math.max(0, Math.round(s)));
    const a = route.laneCenters[0][i]!,
      b = route.laneCenters[1][i]!;
    return (a + b) / 2 + ((b - a) / 2) * 0.95 * weave(s);
  };
  // Looking aside: from time to time the camera turns by a few hundredths of a radian for two or three seconds.
  const looks: { t0: number; duration: number; amount: number }[] = [];
  const frames: FakeFrame[] = [];
  const events: FakeEvent[] = [];
  let s = pole,
    t = 0,
    l = route.laneCenters[0][Math.round(pole)]!,
    lateralSpeed = 0;
  const go = Math.round(FAKE_DRIVING.countdown / FRAME_SECONDS);
  const stop = length - FAKE_DRIVING.runoutEnd;
  let pendingCheckpoint = 0,
    goalCrossed = false,
    nextLook = go * FRAME_SECONDS + 4 + 6 * next();
  // The weave follows its target through a critically damped response of this frequency, so a road change is smooth.
  const omega = 2 * Math.PI * 0.35;
  for (let frame = 0; s < stop; frame++, t += FRAME_SECONDS) {
    if (frame === go) events.push({ kind: 'go', frame, t, s: s - behind });
    const moving = frame >= go;
    const v = moving ? Math.max(speedAt(s), frame === go ? 0 : 0.5) : 0;
    if (moving) {
      const before = s - behind;
      s += v * FRAME_SECONDS;
      const timing = s - behind;
      const accel = omega * omega * (target(s) - l) - 2 * omega * lateralSpeed;
      lateralSpeed += accel * FRAME_SECONDS;
      l += lateralSpeed * FRAME_SECONDS;
      while (pendingCheckpoint < checkpoints.length && timing >= checkpoints[pendingCheckpoint]!) {
        events.push({ kind: 'checkpoint', frame, t, s: checkpoints[pendingCheckpoint]! });
        pendingCheckpoint++;
      }
      if (!goalCrossed && before < finish && timing >= finish) {
        events.push({ kind: 'goal', frame, t, s: finish });
        goalCrossed = true;
      }
    }
    if (moving && t >= nextLook) {
      looks.push({ t0: t, duration: 2 + next(), amount: (next() < 0.5 ? -1 : 1) * (0.03 + 0.05 * next()) });
      nextLook = t + 8 + 10 * next();
    }
    let yaw = 0;
    for (const look of looks)
      if (t >= look.t0 && t <= look.t0 + look.duration)
        yaw += look.amount * Math.sin((Math.PI * (t - look.t0)) / look.duration) ** 2;
    const sc = s - D;
    const playerYaw = Math.atan2(lateralSpeed, Math.max(v, 1));
    // The camera's lateral puts the player's base point on the centre column: right distance is affine in l.
    const r0 = playerRight(sc, l, yaw, s, l);
    const cameraL = l + r0 / Math.cos(yaw);
    // Pitch follows the road's chord from the camera to the player; the camera stands h above the road under it.
    const rise = interpolate(route.height, s) - interpolate(route.height, sc);
    frames.push({
      t,
      s: sc,
      l: cameraL,
      yaw,
      pitch: -Math.atan2(rise, D),
      y: interpolate(route.height, sc) + FAKE_CAMERA.height,
      playerS: s,
      playerL: l,
      playerYaw,
      speed: v,
      displayedKmh: Math.round(v * 3.6),
    });
  }
  return { frames, events, traffic: planTraffic(route, frames, go, pole, stop, next), go };
}

/** Linear interpolation of a per-metre array at s. */
export function interpolate(values: Float64Array, s: number): number {
  const i = Math.min(values.length - 2, Math.max(0, Math.floor(s)));
  return values[i]! + (values[i + 1]! - values[i]!) * (s - i);
}

/**
 * Traffic: vehicles started ahead of the pole at `trafficPerKilometer`, each in one lane of the taken road at its own
 * speed, kept only when the player passes it with its centre at least 2.6 m aside and no other vehicle in its lane
 * catches it.
 */
function planTraffic(
  route: RouteProfile,
  frames: readonly FakeFrame[],
  go: number,
  pole: number,
  stop: number,
  next: () => number,
): FakeTraffic[] {
  const kept: FakeTraffic[] = [];
  const count = Math.round(((stop - pole) / 1000) * FAKE_DRIVING.trafficPerKilometer);
  const [low, high] = FAKE_DRIVING.trafficSpeed;
  for (let k = 0; k < count; k++) {
    const candidate: FakeTraffic = {
      vehicle: FAKE_TRAFFIC[Math.floor(next() * FAKE_TRAFFIC.length)]!,
      lane: next() < 0.5 ? 0 : 1,
      start: pole + 60 + (stop - pole - 400) * next(),
      speed: low + (high - low) * next(),
    };
    const at = (vehicle: FakeTraffic, frame: number) =>
      vehicle.start + vehicle.speed * Math.max(0, frame - go) * FRAME_SECONDS;
    let clear = true;
    for (let frame = go; frame < frames.length && clear; frame += 2) {
      const f = frames[frame]!;
      const s = at(candidate, frame);
      if (s > stop - 20) break;
      const l = route.laneCenters[candidate.lane][Math.round(s)]!;
      if (Math.abs(s - f.playerS) < 7 && Math.abs(l - f.playerL) < 2.6) clear = false;
      for (const other of kept) if (other.lane === candidate.lane && Math.abs(at(other, frame) - s) < 12) clear = false;
    }
    if (clear) kept.push(candidate);
  }
  return kept;
}

/** Where traffic vehicle `vehicle` is at frame `frame`: its route station and lateral and its yaw from the road. */
export function trafficAt(route: RouteProfile, vehicle: FakeTraffic, frame: number, go: number) {
  const s = vehicle.start + vehicle.speed * Math.max(0, frame - go) * FRAME_SECONDS;
  const i = Math.min(route.length - 1, Math.max(0, Math.round(s)));
  const lanes = route.laneCenters[vehicle.lane];
  // Smoothed over 60 m either way, so a lane's jump at a fork becomes a lane change.
  let sum = 0,
    n = 0;
  for (let j = Math.max(0, i - 60); j <= Math.min(route.length, i + 60); j += 5, n++) sum += lanes[j]!;
  const l = sum / n;
  const ahead = Math.min(route.length, i + 20),
    behind = Math.max(0, i - 20);
  let sumA = 0,
    sumB = 0,
    nA = 0,
    nB = 0;
  for (let j = Math.max(0, ahead - 60); j <= Math.min(route.length, ahead + 60); j += 5, nA++) sumA += lanes[j]!;
  for (let j = Math.max(0, behind - 60); j <= Math.min(route.length, behind + 60); j += 5, nB++) sumB += lanes[j]!;
  const yaw = Math.atan2(sumA / nA - sumB / nB, ahead - behind);
  return { s, l, yaw };
}
