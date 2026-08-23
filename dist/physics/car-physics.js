import { guideCourseToWorld, locateWorldOnGuideLocal, } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
const G = 9.80665;
const LOW_SPEED = 3;
export const M5_CAR_PROFILE = {
    mass: 1320,
    bodyWidth: 2.0,
    yawInertia: 2350,
    frontAxle: 1.16,
    rearAxle: 1.44,
    frontCornerStiffness: 78000,
    rearCornerStiffness: 86000,
    maxSteer: 31 * Math.PI / 180,
    steeringTau: 0.10,
    maxDriveForce: 7600,
    maxBrakeForce: 15000,
    topSpeed: 82,
    aeroDrag: 0.39,
    rollingSpeedEpsilon: 0.25,
    maxFallSpeed: 55,
};
export function createM5Car(guide, height, surfaces, s = 45) {
    // Reuse the Guide chart only for the initial pose; thereafter world state is authoritative.
    const sample = guidePoint(guide, s, 0);
    const surface = surfaces.sample(sample.s, 0);
    const longitudinalSpeed = 45;
    return {
        x: sample.x,
        y: height.samplePhysics(sample.s),
        z: sample.z,
        yaw: sample.heading,
        speed: longitudinalSpeed,
        sprungRoll: 0,
        course: {
            s: sample.s,
            l: 0,
            segmentIndex: sample.segmentIndex,
            distanceSquared: 0,
        },
        verticalSpeed: 0,
        longitudinalSpeed,
        lateralSpeed: 0,
        yawRate: 0,
        steerAngle: 0,
        supported: surface.material.supported,
        surfaceType: surface.type,
        lateralAcceleration: 0,
    };
}
export function updateM5Car(guide, height, surfaces, car, input, dt, profile = M5_CAR_PROFILE) {
    const before = surfaces.sample(car.course.s, car.course.l);
    car.surfaceType = before.type;
    car.supported = before.material.supported;
    const speedAbs = Math.abs(car.longitudinalSpeed);
    // High-speed steering travel is deliberately reduced. This is an input/vehicle-rack
    // characteristic, not a physics yaw clamp: the vehicle yaw itself remains unconstrained.
    const steerEnvelope = 0.16 + 0.84 / (1 + (speedAbs / 24) ** 2);
    const steerTarget = input.steering * profile.maxSteer * steerEnvelope;
    const steerAlpha = 1 - Math.exp(-dt / Math.max(profile.steeringTau, 1e-4));
    car.steerAngle += (steerTarget - car.steerAngle) * steerAlpha;
    if (car.supported) {
        integrateGroundDynamics(car, input, before.material.friction, before.material.rollingResistance, before.material.driveScale, dt, profile);
    }
    else {
        integrateUnsupportedPlanar(car, dt, profile);
    }
    // Integrate world XZ from body-frame velocity. +l / lateral velocity is vehicle-right.
    const sin = Math.sin(car.yaw);
    const cos = Math.cos(car.yaw);
    car.x += (sin * car.longitudinalSpeed + cos * car.lateralSpeed) * dt;
    car.z += (cos * car.longitudinalSpeed - sin * car.lateralSpeed) * dt;
    car.yaw = wrapAngle(car.yaw + car.yawRate * dt);
    car.course = locateWorldOnGuideLocal(guide, { x: car.x, z: car.z }, car.course.segmentIndex, 3, false);
    const after = surfaces.sample(car.course.s, car.course.l);
    const groundY = height.samplePhysics(car.course.s);
    if (after.material.supported) {
        if (!car.supported) {
            // Re-contact is intentionally simple in M5: land when the falling body reaches Y_phys.
            if (car.y <= groundY || car.verticalSpeed <= 0) {
                car.y = groundY;
                car.verticalSpeed = 0;
                car.supported = true;
            }
        }
        else {
            car.y = groundY;
            car.verticalSpeed = 0;
            car.supported = true;
        }
    }
    else {
        if (car.supported)
            car.verticalSpeed = Math.min(car.verticalSpeed, 0);
        car.supported = false;
        car.verticalSpeed = Math.max(car.verticalSpeed - G * dt, -profile.maxFallSpeed);
        car.y += car.verticalSpeed * dt;
    }
    car.surfaceType = after.type;
    car.speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
    const rollTarget = clamp(car.lateralAcceleration / G, -1.2, 1.2) * 0.16;
    const rollAlpha = 1 - Math.exp(-dt / 0.18);
    car.sprungRoll += (rollTarget - car.sprungRoll) * rollAlpha;
}
function integrateGroundDynamics(car, input, mu, rollingResistance, driveScale, dt, profile) {
    const m = profile.mass;
    const a = profile.frontAxle;
    const b = profile.rearAxle;
    const wheelbase = a + b;
    const u = car.longitudinalSpeed;
    const v = car.lateralSpeed;
    const r = car.yawRate;
    const uForSlip = Math.max(Math.abs(u), LOW_SPEED);
    const speedRatio = clamp(Math.abs(u) / profile.topSpeed, 0, 1);
    const drive = input.throttle
        ? profile.maxDriveForce * driveScale * Math.max(0, 1 - speedRatio * speedRatio)
        : 0;
    const brakeDirection = u > 0.15 ? -1 : u < -0.15 ? 1 : 0;
    const brake = input.brake ? profile.maxBrakeForce * brakeDirection : 0;
    const drag = -profile.aeroDrag * u * Math.abs(u);
    const rolling = Math.abs(u) > profile.rollingSpeedEpsilon
        ? -Math.sign(u) * rollingResistance * m * G
        : 0;
    const fxTotalRequested = drive + brake + drag + rolling;
    const fzFront = m * G * b / wheelbase;
    const fzRear = m * G * a / wheelbase;
    // AWD-biased DEV drivetrain plus front-biased service braking. Drag/rolling are split by static load.
    // Combined friction-circle clipping below still makes throttle/brake consume cornering grip.
    const driveTotal = Math.max(0, drive);
    const brakeTotal = Math.min(0, brake);
    let fxFront = driveTotal * 0.35 + brakeTotal * 0.62 + (drag + rolling) * (fzFront / (m * G));
    let fxRear = driveTotal * 0.65 + brakeTotal * 0.38 + (drag + rolling) * (fzRear / (m * G));
    const frontLimit = mu * fzFront;
    const rearLimit = mu * fzRear * 1.16;
    fxFront = clamp(fxFront, -frontLimit, frontLimit);
    fxRear = clamp(fxRear, -rearLimit, rearLimit);
    if (Math.abs(u) < LOW_SPEED) {
        const yawTarget = u / wheelbase * Math.tan(car.steerAngle);
        const yawAlpha = 1 - Math.exp(-dt / 0.11);
        car.yawRate += (yawTarget - car.yawRate) * yawAlpha;
        car.lateralSpeed *= Math.exp(-dt / 0.08);
        const du = (fxFront + fxRear) / m;
        car.longitudinalSpeed = Math.max(0, u + du * dt);
        car.lateralAcceleration = car.longitudinalSpeed * car.yawRate;
        return;
    }
    const alphaFront = Math.atan2(v + a * r, uForSlip) - car.steerAngle;
    const alphaRear = Math.atan2(v - b * r, uForSlip);
    let fyFront = -profile.frontCornerStiffness * alphaFront;
    let fyRear = -profile.rearCornerStiffness * alphaRear;
    const fyFrontLimit = Math.sqrt(Math.max(0, frontLimit * frontLimit - fxFront * fxFront));
    const fyRearLimit = Math.sqrt(Math.max(0, rearLimit * rearLimit - fxRear * fxRear));
    fyFront = clamp(fyFront, -fyFrontLimit, fyFrontLimit);
    fyRear = clamp(fyRear, -fyRearLimit, fyRearLimit);
    const fx = fxFront + fxRear;
    const fy = fyFront + fyRear;
    const du = fx / m + v * r;
    const dv = fy / m - u * r;
    const dr = (a * fyFront - b * fyRear) / profile.yawInertia;
    car.longitudinalSpeed += du * dt;
    car.lateralSpeed += dv * dt;
    car.yawRate += dr * dt;
    if (car.longitudinalSpeed < 0) {
        car.longitudinalSpeed = 0;
        if (input.brake)
            car.lateralSpeed *= 0.9;
    }
    car.lateralAcceleration = fy / m;
    // Guard only against numerical runaway outside the intended DEV envelope.
    car.lateralSpeed = clamp(car.lateralSpeed, -45, 45);
    car.yawRate = clamp(car.yawRate, -2.5, 2.5);
    void fxTotalRequested; // retained as a readable total-force check during tuning.
}
function integrateUnsupportedPlanar(car, dt, profile) {
    const dragAccel = profile.aeroDrag * car.longitudinalSpeed * Math.abs(car.longitudinalSpeed) / profile.mass;
    car.longitudinalSpeed -= Math.sign(car.longitudinalSpeed) * dragAccel * dt;
    car.lateralSpeed *= Math.exp(-dt * 0.05);
    car.yawRate *= Math.exp(-dt * 0.08);
    car.lateralAcceleration = 0;
}
function guidePoint(guide, s, l) {
    return guideCourseToWorld(guide, s, l);
}
