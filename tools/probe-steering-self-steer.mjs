import { pathToFileURL } from 'node:url';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { BROWSER_SELF_STEER_GAINS } from '../dist/browser/self-steer-gain-selection.js';
import {
  createArcadeVehicle,
  updateArcadeVehicle,
} from '../dist/physics/arcade-vehicle-physics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  AWD_VEHICLE_PROFILE,
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../dist/physics/vehicle-profiles.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const DT = 1 / 60;
const RAD_TO_DEG = 180 / Math.PI;
const SETTLED_SIDESLIP_DEGREES = 0.5;
const SETTLED_YAW_RATE_DEGREES_PER_SECOND = 1;
const SETTLED_STEER_DEGREES = 0.5;
const POST_RELEASE_SECONDS = 2.5;

const highway = createM72DefaultBranchingParent();
const flatHeight = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const wideAsphalt = new SurfaceMap(highway.guide.length, [{
  sStart: 0,
  name: 'M9 STEERING SELF-STEER PROBE',
  bands: [{ lMin: -1_000, lMax: 1_000, type: 'ASPHALT' }],
}]);
const profiles = [
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  AWD_VEHICLE_PROFILE,
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
];

export function runSteeringSelfSteerProbe({
  profile,
  speed,
  pressSeconds,
  driven,
  travelDirectionGain = 1,
}) {
  const vehicle = createArcadeVehicle(
    profile,
    highway.guide,
    flatHeight,
    wideAsphalt,
    800,
    -1.75,
    speed,
    travelDirectionGain,
  );
  const pressTicks = Math.round(pressSeconds / DT);
  const totalTicks = pressTicks + Math.round(POST_RELEASE_SECONDS / DT);
  const postRelease = [];
  let peakSameYawRate = 0;
  let maxFrontUtilization = 0;
  let maxRearUtilization = 0;

  for (let tick = 0; tick < totalTicks; tick += 1) {
    const pressed = tick < pressTicks;
    updateArcadeVehicle(
      highway.guide,
      flatHeight,
      wideAsphalt,
      vehicle,
      { steering: pressed ? 1 : 0, throttle: driven, brake: false },
      DT,
    );
    peakSameYawRate = Math.max(peakSameYawRate, vehicle.yawRate);
    maxFrontUtilization = Math.max(maxFrontUtilization, vehicle.control.frontUtilization);
    maxRearUtilization = Math.max(maxRearUtilization, vehicle.control.rearUtilization);
    if (!pressed) postRelease.push(observePostRelease(vehicle, tick - pressTicks + 1));
  }

  const oppositePeak = postRelease.reduce(
    (best, sample) => sample.roadWheelAngle < best.roadWheelAngle ? sample : best,
    postRelease[0],
  );
  return Object.freeze({
    profile: profile.id,
    speedMetersPerSecond: speed,
    pressSeconds,
    driven,
    travelDirectionGain,
    peakOppositeRoadWheelDegrees: Math.max(0, -oppositePeak.roadWheelAngle * RAD_TO_DEG),
    peakSameYawRateDegreesPerSecond: peakSameYawRate * RAD_TO_DEG,
    peakReverseYawRateDegreesPerSecond: Math.max(
      0,
      maximum(postRelease, (sample) => -sample.yawRate) * RAD_TO_DEG,
    ),
    peakAbsSideslipDegreesAfterRelease: maximum(
      postRelease,
      (sample) => Math.abs(sample.bodySideslip),
    ) * RAD_TO_DEG,
    settleSeconds: findSettleTime(postRelease),
    maxFrontUtilization,
    maxRearUtilization,
    oppositePeakComponentsDegrees: Object.freeze({
      travelDirection: oppositePeak.bodySideslip * travelDirectionGain * RAD_TO_DEG,
      yawPreview: oppositePeak.yawPreview * RAD_TO_DEG,
      residualDriverOffset: oppositePeak.driverOffset * RAD_TO_DEG,
    }),
  });
}

export function collectCurrentSteeringSelfSteerEnvelope() {
  const cases = [];
  for (const speed of [15, 25, 35]) {
    for (const pressSeconds of [0.1, 0.35, 0.6]) {
      for (const driven of [false, true]) {
        cases.push(runSteeringSelfSteerProbe({
          profile: FR_VEHICLE_PROFILE,
          speed,
          pressSeconds,
          driven,
        }));
      }
    }
  }
  for (const profile of profiles.slice(1)) {
    for (const driven of [false, true]) {
      cases.push(runSteeringSelfSteerProbe({
        profile,
        speed: 25,
        pressSeconds: 0.35,
        driven,
      }));
    }
  }
  return Object.freeze(cases);
}

export function collectSteeringAuthoritySweeps() {
  const yawPreview = [];
  for (const steeringYawPreviewTime of [0, 0.06, 0.12, 0.18, 0.24]) {
    const profile = compileArcadeVehicleProfile({
      ...FR_VEHICLE_PROFILE,
      id: 'FR',
      steeringYawPreviewTime,
    });
    yawPreview.push(Object.freeze({
      steeringYawPreviewTime,
      result: runSteeringSelfSteerProbe({
        profile,
        speed: 25,
        pressSeconds: 0.35,
        driven: false,
      }),
    }));
  }

  const actuatorRelease = [];
  for (const steeringReleaseRate of [2, 3, 4, 6, 8]) {
    const profile = compileArcadeVehicleProfile({
      ...FR_VEHICLE_PROFILE,
      id: 'FR',
      actuator: {
        ...FR_VEHICLE_PROFILE.actuator,
        steering: {
          ...FR_VEHICLE_PROFILE.actuator.steering,
          releaseRate: steeringReleaseRate,
        },
      },
    });
    actuatorRelease.push(Object.freeze({
      steeringReleaseRate,
      result: runSteeringSelfSteerProbe({
        profile,
        speed: 25,
        pressSeconds: 0.35,
        driven: false,
      }),
    }));
  }
  return Object.freeze({
    yawPreview: Object.freeze(yawPreview),
    actuatorRelease: Object.freeze(actuatorRelease),
  });
}

export function collectTravelDirectionGainSweep() {
  return Object.freeze(BROWSER_SELF_STEER_GAINS.map(({ gain }) => Object.freeze({
    gain,
    result: runSteeringSelfSteerProbe({
      profile: FR_VEHICLE_PROFILE,
      speed: 25,
      pressSeconds: 0.35,
      driven: false,
      travelDirectionGain: gain,
    }),
  })));
}

function observePostRelease(vehicle, tickAfterRelease) {
  const bodySideslip = Math.atan2(
    vehicle.lateralSpeed,
    Math.sqrt(
      vehicle.longitudinalSpeed ** 2
      + vehicle.profile.lowSpeedRegularization ** 2,
    ),
  );
  return {
    secondsAfterRelease: tickAfterRelease * DT,
    roadWheelAngle: vehicle.frontSteerAngle,
    yawRate: vehicle.yawRate,
    bodySideslip,
    driverOffset: vehicle.actuator.steering * vehicle.profile.steeringOffsetMax,
    yawPreview: -vehicle.yawRate * vehicle.profile.steeringYawPreviewTime,
  };
}

function findSettleTime(samples) {
  const sideslipLimit = SETTLED_SIDESLIP_DEGREES / RAD_TO_DEG;
  const yawRateLimit = SETTLED_YAW_RATE_DEGREES_PER_SECOND / RAD_TO_DEG;
  const steerLimit = SETTLED_STEER_DEGREES / RAD_TO_DEG;
  for (let index = 0; index < samples.length; index += 1) {
    if (samples.slice(index).every((sample) => (
      Math.abs(sample.bodySideslip) <= sideslipLimit
      && Math.abs(sample.yawRate) <= yawRateLimit
      && Math.abs(sample.roadWheelAngle) <= steerLimit
    ))) {
      return samples[index].secondsAfterRelease;
    }
  }
  return null;
}

function maximum(samples, selector) {
  return Math.max(...samples.map(selector));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify({
    definition: {
      fixedHz: 60,
      postReleaseSeconds: POST_RELEASE_SECONDS,
      settleThresholds: {
        bodySideslipDegrees: SETTLED_SIDESLIP_DEGREES,
        yawRateDegreesPerSecond: SETTLED_YAW_RATE_DEGREES_PER_SECOND,
        roadWheelDegrees: SETTLED_STEER_DEGREES,
      },
    },
    currentEnvelope: collectCurrentSteeringSelfSteerEnvelope(),
    travelDirectionGainSweep: collectTravelDirectionGainSweep(),
    authoritySweeps: collectSteeringAuthoritySweeps(),
  }, null, 2));
}
