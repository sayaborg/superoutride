// Experiment only (branch claude/ramp-experiment, never main): one jump ramp on a straight road, driven headless
// through the product vehicle mechanics. Measures the pitch a ramp gives at take-off, the suspension on the ramp and
// at the edge, the rotation in the air, the landing, and what throttle and brake in the air do to pitch.
//
//   node --import tsx tools/research/ramp/ramp-experiment.ts [table|trace|air] (needs `npm run build` once)
import { readDeliveredContent } from '../../course/read-content.js';
import { loadVehicleDefinitions } from '../../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../../src/content/run-vehicle.js';
import { createPlanCoordinateReader } from '../../../src/course/geometry/plan-coordinate-reader.js';
import { compilePlanPath } from '../../../src/course/geometry/plan-path.js';
import { Profile, type ProfileKnot } from '../../../src/course/geometry/profile.js';
import {
  createVehicle,
  updateVehicle,
  vehicleBodyKinematics,
  createBodyKinematicsWorkspace,
} from '../../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel, type VehicleModel } from '../../../src/vehicle/physics/vehicle-model.js';
import { createSteeringRule, driverSteering } from '../../../src/vehicle/steering-rule.js';
import { createContactWorkspace, deriveContactObservation } from '../../../src/vehicle/physics/vehicle-contact.js';
import { SIM_DT } from '../../../src/race/fixed-step.js';
import type { DrivingInput } from '../../../src/vehicle/driving-input.js';
import { dot3 } from '../../../src/core/vector3.js';

const DEG = 180 / Math.PI;
const FOOT = 400; // station of the ramp's foot (PVI of the foot kink)
const LENGTH = 2000;

/** A ramp, 1 m high: up-side length, down-side length, vertical curve at the foot (0 = kink), at the top (0 = sharp). */
export interface Ramp {
  readonly name: string;
  readonly up: number;
  readonly down: number;
  readonly footCurve: number;
  readonly topCurve?: number;
  readonly height?: number;
}

export const RAMPS: readonly Ramp[] = [
  { name: '1 triangle 3/3', up: 3, down: 3, footCurve: 0 },
  { name: '2 foot curve 3 m', up: 3, down: 3, footCurve: 3 },
  { name: '2b foot curve 6 m (whole up-side concave)', up: 3, down: 3, footCurve: 6 },
  { name: '3 long up 6 m', up: 6, down: 3, footCurve: 0 },
  { name: '3b long up 6 m + foot curve 6 m', up: 6, down: 3, footCurve: 6 },
  { name: '3c long up 6 m + foot curve 12 m (whole up-side concave)', up: 6, down: 3, footCurve: 12 },
  { name: '4 long up 9 m', up: 9, down: 3, footCurve: 0 },
  { name: '4b long up 9 m + foot curve 9 m', up: 9, down: 3, footCurve: 9 },
  { name: '5 up 4.5 m + foot curve 3 m', up: 4.5, down: 3, footCurve: 3 },
];

function rampWorld(ramp: Ramp) {
  const plan = compilePlanPath({ x: 0, z: 0, heading: 0 }, [{ kind: 'straight', length: LENGTH }]);
  const coordinates = createPlanCoordinateReader(plan.segments, plan.length, (_s, out) => {
    out.left = -20;
    out.right = 20;
    return out;
  });
  const h = ramp.height ?? 1;
  const knots: ProfileKnot[] = [
    { s: 0, y: 0, curveLength: 0 },
    { s: FOOT, y: 0, curveLength: ramp.footCurve },
    { s: FOOT + ramp.up, y: h, curveLength: ramp.topCurve ?? 0 },
    { s: FOOT + ramp.up + ramp.down, y: 0, curveLength: 0 },
    { s: plan.length, y: 0, curveLength: 0 },
  ];
  const height = new Profile(plan.length, knots);
  const surface = Object.freeze({ id: 'ASPHALT', gripFactor: 1, rollingResistance: 0.014 });
  const { start, end } = coordinates.domain;
  return { extent: { start, end, terminal: end }, coordinates, height, surfaces: { sample: () => surface } };
}

type AirInput = 'hold' | 'throttle' | 'release' | 'brake';

interface RunOptions {
  readonly airInput?: AirInput;
  /** Seconds the air input lasts from take-off; afterwards the held opening returns. */
  readonly airSeconds?: number;
  readonly trace?: boolean;
  /** The keyboard player: full throttle, rate-limited, from the spawn to the landing (the air input still applies). */
  readonly fullThrottle?: boolean;
}

export function runRamp(model: VehicleModel, ramp: Ramp, kph: number, options: RunOptions = {}) {
  const world = rampWorld(ramp);
  const steering = driverSteering(createSteeringRule('center', 0.95), model);
  const target = kph / 3.6;
  const rampStart = FOOT - ramp.footCurve / 2;
  const edge = FOOT + ramp.up;
  // Spawned at rest on its static ride, at the entry speed, close enough that every vehicle enters at that speed.
  const spawn = rampStart - 25;
  const v = createVehicle(model, world, { s: spawn, l: 0, initialSpeed: target });
  const { compiledVehicle: cv } = model;
  const fw = createContactWorkspace(cv.frontStation),
    rw = createContactWorkspace(cv.rearStation),
    bw = createBodyKinematicsWorkspace();
  const contacts = () => {
    const body = vehicleBodyKinematics(v, bw);
    const f = deriveContactObservation(
      world.coordinates,
      world.height,
      world.surfaces,
      body,
      cv.frontStation,
      0,
      v.course.s,
      fw,
    );
    const r = deriveContactObservation(
      world.coordinates,
      world.height,
      world.surfaces,
      body,
      cv.rearStation,
      0,
      v.course.s,
      rw,
    );
    return { f: { q: f.q, load: f.normalLoad }, r: { q: r.q, load: r.normalLoad }, body };
  };
  const qTravelF = cv.frontStation.suspension.qTravel,
    qTravelR = cv.rearStation.suspension.qTravel;
  const input: { -readonly [K in keyof DrivingInput]: DrivingInput[K] } = {
    steering: 0,
    throttle: 0,
    brake: 0,
    pedalApplyMethod: 'DIRECT',
  };
  let integral = 0.3;
  let held = -1;
  let entryKph = NaN;
  let phase: 'runup' | 'ramp' | 'air' | 'landed' = 'runup';
  let unwrapped = v.pitch;
  let lastPitch = v.pitch;
  const stop = 0.003; // metres short of qTravel that counts as the bump stop (q sampled at the step's end)
  const r = {
    entryKph: 0,
    rateFrontEdge: NaN,
    rampPeakRate: -Infinity,
    rampMaxQF: 0,
    rampMaxQR: 0,
    rampStopF: false,
    rampStopR: false,
    lastQF: 0,
    lastQR: 0,
    lastLoadF: 0,
    lastLoadR: 0,
    takeoffT: NaN,
    takeoffS: NaN,
    takeoffPitch: NaN,
    takeoffRate: NaN,
    takeoffPath: NaN,
    takeoffKph: NaN,
    airPitchMin: Infinity,
    airPitchMax: -Infinity,
    apexY: -Infinity,
    landT: NaN,
    landS: NaN,
    landPitch: NaN,
    landPath: NaN,
    landRate: NaN,
    landStopF: false,
    landStopR: false,
    landMaxQF: 0,
    landMaxQR: 0,
    overturned: false,
    afterPitchMin: Infinity,
    afterPitchMax: -Infinity,
    omegaF0: 0,
    omegaR0: 0,
    omegaF1: 0,
    omegaR1: 0,
    reactionRate: 0,
    trace: [] as string[],
  };
  let t = 0;
  for (let tick = 0; tick < 20 / SIM_DT; tick++) {
    const s = v.course.s;
    if (phase === 'runup') {
      // PI speed hold on an analog throttle; frozen two metres before the ramp: the rider holds the opening.
      const error = target - v.speed;
      integral = Math.min(1, Math.max(0, integral + error * 0.5 * SIM_DT));
      input.throttle = Math.min(1, Math.max(0, integral + error * 0.5));
      input.brake = 0;
      if (options.fullThrottle) {
        input.throttle = 1;
        input.pedalApplyMethod = 'RATE_LIMITED';
      }
      if (s >= rampStart - 2) {
        held = input.throttle as number;
        entryKph = v.speed * 3.6;
        phase = 'ramp';
      }
    }
    if (phase === 'air' && options.airInput && options.airInput !== 'hold') {
      const inside = t - r.takeoffT < (options.airSeconds ?? Infinity);
      input.pedalApplyMethod = 'RATE_LIMITED';
      if (inside) {
        input.throttle = options.airInput === 'throttle' ? 1 : 0;
        input.brake = options.airInput === 'brake' ? 1 : 0;
      } else {
        input.throttle = held;
        input.brake = 0;
      }
    }
    updateVehicle(world, v, model, input, steering);
    t += SIM_DT;
    unwrapped += ((v.pitch - lastPitch + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    lastPitch = v.pitch;
    const c = contacts();
    const fl = v.tires.front.load,
      rl = v.tires.rear.load;
    const path = Math.atan2(v.velocityY, Math.hypot(v.velocityX, v.velocityZ));
    if (options.trace && v.course.s > rampStart - 3 && phase === 'ramp')
      r.trace.push(
        [
          t.toFixed(3),
          (v.course.s - edge).toFixed(2),
          (unwrapped * DEG).toFixed(2),
          (v.pitchRate * DEG).toFixed(1),
          (path * DEG).toFixed(2),
          c.f.q.toFixed(3),
          c.r.q.toFixed(3),
          fl.toFixed(0),
          rl.toFixed(0),
        ].join('\t'),
      );
    if (phase === 'ramp') {
      const frontS = v.course.s + cv.frontAxle;
      if (Number.isNaN(r.rateFrontEdge) && frontS >= edge) r.rateFrontEdge = v.pitchRate * DEG;
      if (frontS < edge) r.rampPeakRate = Math.max(r.rampPeakRate, v.pitchRate * DEG);
      r.rampMaxQF = Math.max(r.rampMaxQF, c.f.q);
      r.rampMaxQR = Math.max(r.rampMaxQR, c.r.q);
      if (c.f.q >= qTravelF - stop) r.rampStopF = true;
      if (c.r.q >= qTravelR - stop) r.rampStopR = true;
      if (fl > 0) r.lastQF = c.f.q;
      if (rl > 0) r.lastQR = c.r.q;
      if (fl > 0) r.lastLoadF = fl;
      if (rl > 0) r.lastLoadR = rl;
      if (fl === 0 && rl === 0 && v.course.s > FOOT) {
        phase = 'air';
        r.takeoffT = t;
        r.takeoffS = v.course.s - edge;
        r.takeoffPitch = unwrapped * DEG;
        r.takeoffRate = v.pitchRate * DEG;
        r.takeoffPath = path * DEG;
        r.takeoffKph = v.speed * 3.6;
        r.omegaF0 = v.frontWheelOmega;
        r.omegaR0 = v.rearWheelOmega;
      }
    } else if (phase === 'air') {
      if (options.trace)
        r.trace.push(
          `air t+${(t - r.takeoffT).toFixed(3)} gear ${v.powertrain.gear} rpm ${v.powertrain.engineRpm.toFixed(0)} thr ${v.actuator.throttle.toFixed(2)} brk ${v.actuator.brake.toFixed(2)} ωR ${v.rearWheelOmega.toFixed(1)} ωF ${v.frontWheelOmega.toFixed(1)} rate ${(v.pitchRate * DEG).toFixed(1)}`,
        );
      r.airPitchMin = Math.min(r.airPitchMin, unwrapped * DEG);
      if (fl === 0 && rl === 0) r.landRate = v.pitchRate * DEG; // the last rate in the air, before any contact
      r.airPitchMax = Math.max(r.airPitchMax, unwrapped * DEG);
      r.apexY = Math.max(r.apexY, v.y - cv.desiredCgHeight);
      const ground = world.height.sample(v.course.s);
      if (fl > 0 || rl > 0 || v.y - ground <= cv.desiredCgHeight || v.course.s > LENGTH - 50) {
        phase = 'landed';
        r.landT = t;
        r.landS = v.course.s - edge;
        r.landPitch = unwrapped * DEG;
        r.landPath = path * DEG;
        r.omegaF1 = v.frontWheelOmega;
        r.omegaR1 = v.rearWheelOmega;
        // Pitch-rate change the wheels' spin changes in the air put on the body (their reaction), nose up positive.
        r.reactionRate =
          ((-(cv.frontStation.wheelInertia * (r.omegaF1 - r.omegaF0)) -
            cv.rearStation.wheelInertia * (r.omegaR1 - r.omegaR0)) /
            cv.pitchInertia) *
          -DEG;
      }
    } else if (phase === 'landed') {
      r.landMaxQF = Math.max(r.landMaxQF, c.f.q);
      r.landMaxQR = Math.max(r.landMaxQR, c.r.q);
      if (c.f.q >= qTravelF - stop) r.landStopF = true;
      if (c.r.q >= qTravelR - stop) r.landStopR = true;
      r.afterPitchMin = Math.min(r.afterPitchMin, unwrapped * DEG);
      r.afterPitchMax = Math.max(r.afterPitchMax, unwrapped * DEG);
      if (dot3(c.body.up, { x: 0, y: 1, z: 0 }) <= 0) r.overturned = true;
      if (t - r.landT > 2.5) break;
    }
  }
  r.entryKph = entryKph;
  return r;
}

export function vehicleModels() {
  return (async () => {
    const content = await readDeliveredContent();
    const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
    return (id: string) => {
      const entry = definitions.vehicles.find((e) => e.compiledVehicle.id === id);
      if (!entry) throw new Error(id);
      return createVehicleModel(createRunVehicle(entry, definitions.driving), SIM_DT);
    };
  })();
}

export const VEHICLES = ['FXRT_SPORT_GLIDE', 'PX200E_ARCOBALENO', 'TESTAROSSA'];
export const SPEEDS = [60, 80, 100, 130, 160, 199];

function verdict(r: ReturnType<typeof runRamp>) {
  const total = r.landPitch - r.takeoffPitch;
  const flip = r.airPitchMin < -90 ? 'FRONT FLIP' : r.airPitchMax > 90 ? 'BACK FLIP' : '';
  const crash = r.overturned ? 'overturned' : '';
  const side = total < 0 ? 'nose-down' : 'nose-up';
  return [flip, crash].filter(Boolean).join(' ') || side;
}

const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');

async function main() {
  const mode = process.argv[2] ?? 'table';
  const model = await vehicleModels();
  if (mode === 'table') {
    const ramps = process.argv[3] ? RAMPS.filter((r) => r.name.startsWith(process.argv[3]!)) : RAMPS;
    const vehicles = process.argv[4] ? process.argv[4].split(',') : VEHICLES;
    const fullThrottle = process.argv[5] === 'full';
    for (const ramp of ramps) {
      console.log(`\n### ${ramp.name}`);
      console.log(
        '| vehicle | entry km/h | takeoff pitch° | takeoff rate °/s | air rot° | land pitch° | ramp qF/qR max m | edge qF/qR m | bump stop on ramp F/R | result | peak rate on ramp °/s | rate front at edge °/s | edge Δ °/s | −g/v °/s | path° | air s | apex m | reaction °/s |',
      );
      console.log('|' + ' --- |'.repeat(18));
      for (const id of vehicles)
        for (const kph of SPEEDS) {
          const r = runRamp(model(id), ramp, kph, { fullThrottle });
          console.log(
            `| ${id} | ${f(r.entryKph, 0)} | ${f(r.takeoffPitch)} | ${f(r.takeoffRate, 0)} | ${f(r.landPitch - r.takeoffPitch, 0)} | ${f(r.landPitch)} | ${f(r.rampMaxQF, 2)}/${f(r.rampMaxQR, 2)} | ${f(r.lastQF, 2)}/${f(r.lastQR, 2)} | ${r.rampStopF ? 'Y' : '-'}/${r.rampStopR ? 'Y' : '-'} | ${verdict(r)} | ${f(r.rampPeakRate, 0)} | ${f(r.rateFrontEdge, 0)} | ${f(r.takeoffRate - r.rateFrontEdge, 0)} | ${f((-9.80665 / (r.takeoffKph / 3.6)) * DEG, 0)} | ${f(r.takeoffPath)} | ${f(r.landT - r.takeoffT, 2)} | ${f(r.apexY, 2)} | ${f(r.reactionRate, 0)} |`,
          );
        }
    }
  } else if (mode === 'trace') {
    const [, , , id = 'FXRT_SPORT_GLIDE', kph = '100', rampName = '1'] = process.argv;
    const ramp = RAMPS.find((r) => r.name.startsWith(rampName))!;
    const airInput = (process.argv[6] ?? 'hold') as AirInput;
    const r = runRamp(model(id), ramp, Number(kph), { trace: true, airInput });
    console.log('t\ts-edge\tpitch°\trate°/s\tpath°\tqF\tqR\tloadF\tloadR');
    for (const line of r.trace) console.log(line);
  } else if (mode === 'air') {
    const kph = Number(process.argv[3] ?? 100);
    const ramp = RAMPS.find((r) => r.name.startsWith(process.argv[4] ?? '1'))!;
    const fullThrottle = process.argv[5] === 'full';
    console.log(`\n### air inputs, ${ramp.name}, ${kph} km/h${fullThrottle ? ', full throttle up to take-off' : ''}`);
    console.log(
      '| vehicle | air input | air s | takeoff rate °/s | land rate °/s | air rot° | reaction °/s | land pitch° | rear ω take-off→land rad/s | front ω take-off→land rad/s | result |',
    );
    console.log('|' + ' --- |'.repeat(11));
    for (const id of VEHICLES)
      for (const [airInput, airSeconds] of [
        ['hold', undefined],
        ['release', undefined],
        ['throttle', undefined],
        ['brake', undefined],
        ['brake', 0.2],
        ['throttle', 0.3],
      ] as const) {
        const r = runRamp(model(id), ramp, kph, { airInput, airSeconds, fullThrottle });
        console.log(
          `| ${id} | ${airInput}${airSeconds ? ` ${airSeconds}s` : ''} | ${f(r.landT - r.takeoffT, 2)} | ${f(r.takeoffRate, 0)} | ${f(r.landRate, 0)} | ${f(r.landPitch - r.takeoffPitch, 0)} | ${f(r.reactionRate, 0)} | ${f(r.landPitch)} | ${f(r.omegaR0, 0)}→${f(r.omegaR1, 0)} | ${f(r.omegaF0, 0)}→${f(r.omegaF1, 0)} | ${verdict(r)} |`,
        );
      }
  }
}

await main();
