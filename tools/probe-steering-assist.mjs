import { pathToFileURL } from 'node:url';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import {
  BROWSER_STEERING_RESPONSES,
  BROWSER_YAW_TRANSIENT_GAINS,
  BROWSER_YAW_WASHOUT_TIMES,
} from '../dist/browser/steering-calibration-selection.js';
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
  name: 'M9.7 BOUNDED WASHOUT STEERING ASSIST PROBE',
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

export function runSteeringAssistProbe({
  profile,
  speed,
  pressSeconds,
  driven,
  yawTransientGain = profile.steeringYawTransientGain,
  yawWashoutTime = profile.steeringYawWashoutTime,
  steeringActuatorResponse = profile.actuator.steering,
}) {
  const vehicle = createArcadeVehicle(
    profile,
    highway.guide,
    flatHeight,
    wideAsphalt,
    800,
    -1.75,
    speed,
    { yawTransientGain, yawWashoutTime, steeringActuatorResponse },
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
    yawTransientGain,
    yawWashoutTime,
    steeringActuatorResponse,
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
      travelDirection: oppositePeak.bodySideslip * RAD_TO_DEG,
      yawTransient: oppositePeak.yawTransient * RAD_TO_DEG,
      residualDriverOffset: oppositePeak.driverOffset * RAD_TO_DEG,
    }),
  });
}

export function collectCurrentSteeringAssistEnvelope() {
  const cases = [];
  for (const speed of [15, 25, 35]) {
    for (const pressSeconds of [0.1, 0.35, 0.6]) {
      for (const driven of [false, true]) {
        cases.push(runSteeringAssistProbe({
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
      cases.push(runSteeringAssistProbe({
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
  const yawTransient = BROWSER_YAW_TRANSIENT_GAINS.map((yawTransientGain) => Object.freeze({
    yawTransientGain,
    result: runSteeringAssistProbe({
      profile: FR_VEHICLE_PROFILE,
      speed: 25,
      pressSeconds: 0.35,
      driven: false,
      yawTransientGain,
    }),
  }));
  const yawWashout = BROWSER_YAW_WASHOUT_TIMES.map((yawWashoutTime) => Object.freeze({
    yawWashoutTime,
    result: runSteeringAssistProbe({
      profile: FR_VEHICLE_PROFILE,
      speed: 25,
      pressSeconds: 0.35,
      driven: false,
      yawWashoutTime,
    }),
  }));
  const actuatorResponse = BROWSER_STEERING_RESPONSES.map(({ traversalSeconds, rate }) => {
    const steeringActuatorResponse = Object.freeze({ applyRate: rate, releaseRate: rate });
    return Object.freeze({
      traversalSeconds,
      steeringActuatorRate: rate,
      result: runSteeringAssistProbe({
        profile: FR_VEHICLE_PROFILE,
        speed: 25,
        pressSeconds: 0.35,
        driven: false,
        steeringActuatorResponse,
      }),
    });
  });
  return Object.freeze({
    yawTransient: Object.freeze(yawTransient),
    yawWashout: Object.freeze(yawWashout),
    actuatorResponse: Object.freeze(actuatorResponse),
  });
}

export function collectSteeringSelectorCrossProduct() {
  const cases = [];
  for (const yawTransientGain of BROWSER_YAW_TRANSIENT_GAINS) {
    for (const yawWashoutTime of BROWSER_YAW_WASHOUT_TIMES) {
      for (const { traversalSeconds, rate } of BROWSER_STEERING_RESPONSES) {
        cases.push(Object.freeze({
          yawTransientGain,
          yawWashoutTime,
          traversalSeconds,
          result: runSteeringAssistProbe({
            profile: FR_VEHICLE_PROFILE,
            speed: 25,
            pressSeconds: 0.1,
            driven: false,
            yawTransientGain,
            yawWashoutTime,
            steeringActuatorResponse: Object.freeze({ applyRate: rate, releaseRate: rate }),
          }),
        }));
      }
    }
  }
  return Object.freeze(cases);
}

/** Calm full-input constant-speed envelope, averaged over the final two seconds. */
export function runSteadyFullInputProbe({
  profile,
  speed,
  steeringSign,
  seconds = 12,
}) {
  if (steeringSign !== -1 && steeringSign !== 1) {
    throw new RangeError('steady steering sign must be -1 or +1');
  }
  const vehicle = createArcadeVehicle(
    profile,
    highway.guide,
    flatHeight,
    wideAsphalt,
    800,
    0,
    speed,
  );
  const samples = [];
  const ticks = Math.round(seconds / DT);
  const averagingTicks = Math.round(2 / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    updateArcadeVehicle(
      highway.guide,
      flatHeight,
      wideAsphalt,
      vehicle,
      { steering: steeringSign, throttle: false, brake: false },
      DT,
    );
    clampPlanarSpeed(vehicle, speed);
    if (tick >= ticks - averagingTicks) {
      samples.push({
        sideslip: observeBodySideslip(vehicle),
        yawRate: vehicle.yawRate,
        frontUtilization: vehicle.control.frontUtilization,
        rearUtilization: vehicle.control.rearUtilization,
      });
    }
  }
  const meanYawRate = mean(samples, (sample) => sample.yawRate);
  const meanSideslip = mean(samples, (sample) => sample.sideslip);
  return Object.freeze({
    profile: profile.id,
    speedMetersPerSecond: speed,
    steeringSign,
    radiusMeters: speed / Math.abs(meanYawRate),
    lateralAccelerationMetersPerSecondSquared: speed * Math.abs(meanYawRate),
    sideslipDegrees: meanSideslip * RAD_TO_DEG,
    maxAbsSideslipDegrees: maximum(samples, (sample) => Math.abs(sample.sideslip)) * RAD_TO_DEG,
    frontUtilization: mean(samples, (sample) => sample.frontUtilization),
    rearUtilization: mean(samples, (sample) => sample.rearUtilization),
  });
}

/** Fixed-horizon natural-speed deep-slide recovery; no constant-speed or hidden assist is used. */
export function runDeepSlideRecoveryProbe({
  inputKind,
  speed = 22,
  initialSideslipDegrees = -40,
  initialYawRate = 0.6,
  seconds = 3,
}) {
  if (!['correct', 'neutral', 'wrong'].includes(inputKind)) {
    throw new RangeError('deep-slide recovery input must be correct, neutral or wrong');
  }
  const vehicle = createArcadeVehicle(
    FR_VEHICLE_PROFILE,
    highway.guide,
    flatHeight,
    wideAsphalt,
    800,
    0,
    speed,
  );
  const initialSideslip = initialSideslipDegrees / RAD_TO_DEG;
  seedBodySideslip(vehicle, speed, initialSideslip);
  vehicle.yawRate = initialYawRate;
  vehicle.steeringAssist.yawRateBaseline = initialYawRate;
  vehicle.frontSteerAngle = Math.sign(initialSideslip) * vehicle.profile.steeringAutomaticMax;
  const correctSign = Math.sign(initialSideslip);
  const recoverySteering = inputKind === 'neutral'
    ? 0
    : inputKind === 'correct' ? correctSign : -correctSign;
  const ticks = Math.round(seconds / DT);
  const recoveryThreshold = 5 / RAD_TO_DEG;
  let recoverySeconds = null;
  let sideslipIntegral = 0;
  let minimumSpeed = vehicle.speed;
  let speedAtRecovery = null;
  for (let tick = 0; tick < ticks; tick += 1) {
    updateArcadeVehicle(
      highway.guide,
      flatHeight,
      wideAsphalt,
      vehicle,
      { steering: recoverySeconds === null ? recoverySteering : 0, throttle: false, brake: false },
      DT,
    );
    const sideslip = observeBodySideslip(vehicle);
    if (recoverySeconds === null) {
      sideslipIntegral += Math.abs(sideslip) * DT;
      minimumSpeed = Math.min(minimumSpeed, vehicle.speed);
      if (Math.abs(sideslip) < recoveryThreshold) {
        recoverySeconds = (tick + 1) * DT;
        speedAtRecovery = vehicle.speed;
      }
    }
  }
  return Object.freeze({
    inputKind,
    initialSpeedMetersPerSecond: speed,
    initialSideslipDegrees,
    recoverySeconds,
    absoluteSideslipIntegralDegreeSeconds: sideslipIntegral * RAD_TO_DEG,
    minimumSpeedBeforeRecoveryMetersPerSecond: minimumSpeed,
    speedAtRecoveryMetersPerSecond: speedAtRecovery,
    finalSpeedMetersPerSecond: vehicle.speed,
    finalSideslipDegrees: observeBodySideslip(vehicle) * RAD_TO_DEG,
  });
}

/**
 * Constant-speed basin probe. It starts outside automatic authority and asks whether ordinary
 * mechanics returns inside it instead of settling on an outer saturated equilibrium. The speed
 * clamp is diagnostic energy isolation, not product mechanics.
 */
export function runDeepSideslipEscapeProbe({
  profile,
  speed,
  initialSideslipDegrees,
  steeringSign = -Math.sign(initialSideslipDegrees),
  seconds = 4,
}) {
  const initialSideslip = initialSideslipDegrees / RAD_TO_DEG;
  if (!(Math.abs(initialSideslip) > profile.steeringAutomaticMax)) {
    throw new RangeError('deep-sideslip probe must start outside automatic steering authority');
  }
  const vehicle = createArcadeVehicle(
    profile,
    highway.guide,
    flatHeight,
    wideAsphalt,
    800,
    0,
    speed,
  );
  seedBodySideslip(vehicle, speed, initialSideslip);
  if (steeringSign !== -1 && steeringSign !== 1) {
    throw new RangeError('deep-sideslip probe steering sign must be -1 or +1');
  }
  const samples = [];
  const ticks = Math.round(seconds / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    updateArcadeVehicle(
      highway.guide,
      flatHeight,
      wideAsphalt,
      vehicle,
      { steering: steeringSign, throttle: false, brake: false },
      DT,
    );
    clampPlanarSpeed(vehicle, speed);
    const sideslip = observeBodySideslip(vehicle);
    samples.push({
      seconds: (tick + 1) * DT,
      sideslip,
      frontUtilization: vehicle.control.frontUtilization,
      rearUtilization: vehicle.control.rearUtilization,
    });
  }
  const innerLimit = profile.steeringAutomaticMax - 1 / RAD_TO_DEG;
  const finalWindow = samples.slice(-Math.round(0.5 / DT));
  return Object.freeze({
    profile: profile.id,
    speedMetersPerSecond: speed,
    initialSideslipDegrees,
    steeringSign,
    automaticSteerMaxDegrees: profile.steeringAutomaticMax * RAD_TO_DEG,
    enteredInnerRegion: samples.some(({ sideslip }) => Math.abs(sideslip) < innerLimit),
    finalInsideAutomaticAuthority: finalWindow.every(
      ({ sideslip }) => Math.abs(sideslip) < profile.steeringAutomaticMax,
    ),
    finalSideslipDegrees: samples.at(-1).sideslip * RAD_TO_DEG,
    peakFrontUtilization: maximum(samples, (sample) => sample.frontUtilization),
    peakRearUtilization: maximum(samples, (sample) => sample.rearUtilization),
  });
}

function seedBodySideslip(vehicle, speed, sideslip) {
  vehicle.velocityX = Math.cos(vehicle.yaw) * speed * Math.sin(sideslip)
    + Math.sin(vehicle.yaw) * speed * Math.cos(sideslip);
  vehicle.velocityY = 0;
  vehicle.velocityZ = -Math.sin(vehicle.yaw) * speed * Math.sin(sideslip)
    + Math.cos(vehicle.yaw) * speed * Math.cos(sideslip);
  const longitudinalSpeed = speed * Math.cos(sideslip);
  vehicle.frontWheelOmega = longitudinalSpeed / vehicle.profile.frontWheelRadius;
  vehicle.rearWheelOmega = longitudinalSpeed / vehicle.profile.rearWheelRadius;
}

function clampPlanarSpeed(vehicle, speed) {
  const planarSpeed = Math.hypot(vehicle.velocityX, vehicle.velocityZ);
  if (planarSpeed > 0) {
    vehicle.velocityX *= speed / planarSpeed;
    vehicle.velocityZ *= speed / planarSpeed;
  }
  const longitudinalSpeed = Math.max(0, vehicle.longitudinalSpeed);
  vehicle.frontWheelOmega = longitudinalSpeed / vehicle.profile.frontWheelRadius;
  vehicle.rearWheelOmega = longitudinalSpeed / vehicle.profile.rearWheelRadius;
}

function observePostRelease(vehicle, tickAfterRelease) {
  const bodySideslip = observeBodySideslip(vehicle);
  const transientYawRate = vehicle.yawRate - vehicle.steeringAssist.yawRateBaseline;
  return {
    secondsAfterRelease: tickAfterRelease * DT,
    roadWheelAngle: vehicle.frontSteerAngle,
    yawRate: vehicle.yawRate,
    bodySideslip,
    driverOffset: vehicle.actuator.steering * vehicle.profile.steeringOffsetMax,
    yawTransient: -transientYawRate * vehicle.steeringCalibration.yawTransientGain,
  };
}

function observeBodySideslip(vehicle) {
  return Math.atan2(
    vehicle.lateralSpeed,
    Math.sqrt(
      vehicle.longitudinalSpeed ** 2
      + vehicle.profile.steeringLowSpeedRegularization ** 2,
    ),
  );
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

function mean(samples, selector) {
  return samples.reduce((sum, sample) => sum + selector(sample), 0) / samples.length;
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
    currentEnvelope: collectCurrentSteeringAssistEnvelope(),
    authoritySweeps: collectSteeringAuthoritySweeps(),
  }, null, 2));
}
