import { TireModalSynthesis } from '../dist/audio/tire-modal-model.js';
import { MODAL_SETTINGS } from '../dist/audio/tire-modal-acoustics.js';
import { TireUnifiedSynthesis } from '../dist/audio/tire-unified-model.js';
import { UNIFIED_SETTINGS } from '../dist/audio/tire-unified-acoustics.js';
import { tireSoundParameters } from '../dist/audio/tire-sound-controls.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { createVehicleAudioObservation, readVehicleAudio } from '../dist/browser/vehicle-audio.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../dist/browser/tire-friction-selection.js';
import {
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
} from '../dist/browser/steering-calibration-selection.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

// Short completed-mechanics traces, not a fixed-speed/radius turn or a recording of user driving.
// Fixed gains and independent axle seeds; no engine, master compressor or browser playback.
const model = process.argv[2];
if (model !== 'modal' && model !== 'unified')
  throw new RangeError('usage: tire-input-probe.mjs modal|unified [RATE] [FREQUENCY_HZ]');
const rate = Number(process.argv[3] ?? 48000);
if (![44100, 48000, 96000].includes(rate)) throw new RangeError('probe rate: 44100, 48000 or 96000');
const settings = model === 'modal' ? MODAL_SETTINGS : UNIFIED_SETTINGS;
const frequencyKey = model === 'modal' ? 'pitchBaseHz' : 'highFrequencyHz';
const frequencyHz = Number(
  process.argv[4] ?? (model === 'modal' ? MODAL_SETTINGS.pitchBaseHz : UNIFIED_SETTINGS.modes[1].frequencyHz),
);
const Kernel = model === 'modal' ? TireModalSynthesis : TireUnifiedSynthesis;
const runtime = createLinearHighwayRuntime();
const world = { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
const vehicle = VEHICLE_CATALOG[0];
const result = [];
for (const initialKmh of [20, 100]) {
  for (const steering of [0, 0.1, 0.25, 0.75]) {
    const player = createArcadeVehicle(vehicle.profile, world, {
      s: 45,
      initialSpeed: initialKmh / 3.6,
      tireFrictionCalibration: DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
      torqueProtection: vehicle.torqueProtection,
      steeringCalibration: {
        steeringOffsetMax: DEFAULT_BROWSER_STEERING_OFFSET,
        maxRoadWheelSteer: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
        steeringActuatorResponse: {
          applyRate: DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
          releaseRate: DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
        },
      },
    });
    const observation = createVehicleAudioObservation();
    readVehicleAudio(player, observation); // Subscribe before the first completed solve.
    const pair = [settings.frontSeed, settings.rearSeed].map(
      (seed) => new Kernel(rate, seed, { [frequencyKey]: frequencyHz }),
    );
    let roadEnergy = 0,
      frictionEnergy = 0,
      work = 0,
      slip = 0,
      peakAxleWatts = 0;
    const surfaces = new Set();
    for (let frame = 0; frame < 60; frame++) {
      for (let step = 0; step < 2; step++)
        updateArcadeVehicle(world, player, { steering, throttle: false, brake: false }, 1 / 120);
      readVehicleAudio(player, observation);
      for (const [axle, tire] of [observation.front, observation.rear].entries()) {
        const value = tireSoundParameters(tire);
        pair[axle].update(value, value.surfaceIndex);
        const power = value.longitudinalPower + value.lateralPower;
        work += power;
        peakAxleWatts = Math.max(peakAxleWatts, power);
        slip += Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
        surfaces.add(tire.surface);
      }
      for (let i = Math.floor((frame * rate) / 60); i < Math.floor(((frame + 1) * rate) / 60); i++) {
        for (const kernel of pair) kernel.sample();
        if (model === 'unified') roadEnergy += (pair[0].roadOutput + pair[1].roadOutput) ** 2;
        frictionEnergy += (pair[0].frictionOutput + pair[1].frictionOutput) ** 2;
      }
    }
    result.push({
      initialKmh,
      steering,
      finalKmh: player.speed * 3.6,
      meanAxleWatts: work / 120,
      peakAxleWatts,
      meanAxleSlipMps: slip / 120,
      ...(model === 'unified' ? { roadRms: Math.sqrt(roadEnergy / rate) } : {}),
      frictionRms: Math.sqrt(frictionEnergy / rate),
      surfaces: [...surfaces],
    });
  }
}
console.log(
  JSON.stringify(
    {
      rate,
      model,
      [frequencyKey]: frequencyHz,
      secondsPerCase: 1,
      profile: vehicle.profile.id,
      note: 'Browser calibration; coast and held steering, 120 Hz mechanics / 60 Hz observations. Mixed surfaces are reported, not treated as matched asphalt. RMS is unweighted output, not perceived loudness or phone evidence.',
      result,
    },
    null,
    2,
  ),
);
