import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import type { PseudoCamera } from './projection.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { SIM_DT } from '../race/fixed-step.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from './display-scale.js';
import { basePoint, type BasePoint } from './base-point.js';
import type { VehicleMotionRead } from '../vehicle/physics/vehicle-contract.js';

export const RENDER_NEAR_DEPTH_METERS = 2.5;
export const RENDER_FAR_DEPTH_METERS = 200;

/** The camera yaw's source: `BODY` (the product's), or `TRAVEL`, the player's velocity direction. */
export type CameraYawSource = 'BODY' | 'TRAVEL';

/**
 * The speed, m/s, from which a `TRAVEL` camera takes the whole direction of travel. Below it the camera takes that
 * fraction of the travel direction's angle from the body's heading, so at rest, where no direction is defined, it is
 * the body's, and starting or stopping turns it continuously.
 */
const TRAVEL_YAW_FULL_SPEED = 2;

export interface CameraDefinition {
  /** The focal length, px: the one authority for the field of view and, through it, the player depth. */
  readonly focalLength: number;
  readonly centerX: number;
  /** The horizon's row with a level body. */
  readonly horizonRow: number;
  /** The camera's height above the player's base point with a level body, metres. */
  readonly height: number;
  /** The natural frequency, Hz, of the critically damped spring the camera follows the base point's height through. */
  readonly heightFrequency: number;
  /** What the camera yaw follows: the body's heading, or the player's direction of travel (DEV). */
  readonly yawSource: CameraYawSource;
  /** The camera yaw's limit about the road heading at the car, radians. */
  readonly yawLimit: number;
  /** The camera yaw's response time constant, seconds; 0 follows the limited body yaw at once. */
  readonly yawResponseSeconds: number;
}

/**
 * The player depth `D_cam`, metres: from the camera to the player's base point, where the focal length gives the
 * fixed player-depth display scale, `f / 40 px/m`. The camera stands this far behind the player's route position,
 * and the race's view of the camera reads this distance.
 */
export function cameraDistance(definition: Pick<CameraDefinition, 'focalLength'>): number {
  return definition.focalLength / PLAYER_DEPTH_PIXELS_PER_METER;
}

/** The camera's reader: the plan, for the player's base point and the road heading. */
export interface CameraWorld {
  readonly coordinates: PlanCoordinateReader;
}

/**
 * The camera's state between fixed steps: its yaw, and the sprung height of the player's base point with its vertical
 * velocity and the base point's height in the last step, from which its vertical velocity follows.
 */
export interface CameraRig {
  yaw: number;
  height: number;
  heightVelocity: number;
  previousTarget: number;
  initialized: boolean;
}

export type CameraState = PseudoCamera;

const planWorkspaces = new WeakMap<
  CameraRig,
  {
    point: ReturnType<typeof createPlanCoordinateSample>;
    base: BasePoint;
    baseSample: ReturnType<typeof createPlanCoordinateSample>;
  }
>();

/**
 * The player's direction of travel as a yaw: the body yaw turned by the direction of its velocity in the body frame,
 * by the fraction `speed / TRAVEL_YAW_FULL_SPEED` (at most 1) of that turn. Moving backward, the direction is taken
 * forward (its sideways part kept), so the turn stays within a quarter turn and never flips across the reverse
 * direction.
 */
function travelYaw(vehicle: VehicleMotionRead): number {
  const { longitudinalSpeed, lateralSpeed } = vehicle;
  const speed = Math.hypot(longitudinalSpeed, lateralSpeed);
  if (speed === 0) return vehicle.yaw;
  return wrapAngle(
    vehicle.yaw + Math.min(1, speed / TRAVEL_YAW_FULL_SPEED) * Math.atan2(lateralSpeed, Math.abs(longitudinalSpeed)),
  );
}

export function createCameraRig(): CameraRig {
  return { yaw: 0, height: 0, heightVelocity: 0, previousTarget: 0, initialized: false };
}

/** The next update places the camera at its target again, at rest relative to it. */
export function resetCameraRig(rig: CameraRig): void {
  rig.yaw = 0;
  rig.initialized = false;
}

/**
 * One fixed step of the camera (SIM_DT) behind the player. A reset or new rig starts at the base point's height;
 * afterwards that height reaches the camera through the sprung mount.
 */
export function updateCamera(
  rig: CameraRig,
  { coordinates }: CameraWorld,
  vehicle: VehicleMotionRead,
  definition: CameraDefinition,
): CameraState {
  let workspace = planWorkspaces.get(rig);
  if (!workspace) {
    workspace = {
      point: createPlanCoordinateSample(),
      base: { x: 0, y: 0, z: 0, s: 0 },
      baseSample: createPlanCoordinateSample(),
    };
    planWorkspaces.set(rig, workspace);
  }
  const planAtCar = coordinates.toWorld(vehicle.course.s, 0, workspace.point);

  // The camera yaw is its source's yaw limited to the definition's angle about the road heading at the car; beyond it
  // the camera stays at the limit and the vehicle is shown turned. A response time follows the limited yaw with lag.
  const sourceYaw = definition.yawSource === 'TRAVEL' ? travelYaw(vehicle) : vehicle.yaw;
  const sourcePlanYawDelta = wrapAngle(sourceYaw - planAtCar.heading);
  const limitedYaw =
    Math.abs(sourcePlanYawDelta) <= definition.yawLimit
      ? sourceYaw
      : wrapAngle(planAtCar.heading + Math.sign(sourcePlanYawDelta) * definition.yawLimit);
  rig.yaw =
    rig.initialized && definition.yawResponseSeconds > 0
      ? wrapAngle(rig.yaw + wrapAngle(limitedYaw - rig.yaw) * (1 - Math.exp(-SIM_DT / definition.yawResponseSeconds)))
      : limitedYaw;

  const dCam = cameraDistance(definition);
  // The player's picture stands at its base point: the camera keeps that point at D_cam.
  const base = basePoint(coordinates, vehicle, workspace.base, workspace.baseSample);
  const sCamera = base.s - dCam;
  // The camera occupies its yaw ray behind the player's base point. Its camera-right displacement to that point is
  // therefore exactly zero, so the renderer's projection places the player at centerX by construction; the camera
  // publishes no screen position of its own.
  const cameraX = base.x - dCam * Math.sin(rig.yaw);
  const cameraZ = base.z - dCam * Math.cos(rig.yaw);

  // Constant depth D_cam and pitch following the body: body pitch is nose-up-positive, pseudo-camera pitch
  // downward-positive.
  const pitch = -vehicle.sprungPitch;
  const target = base.y;
  if (!rig.initialized) {
    rig.height = target;
    rig.heightVelocity = 0;
    rig.initialized = true;
  } else {
    // The sprung mount: a critically damped spring on the height error and a damper on the vertical velocity relative
    // to the base point's, stepped implicitly. A base point moving at constant vertical speed (a steady grade) is
    // followed without lag.
    const omega = 2 * Math.PI * definition.heightFrequency;
    const targetVelocity = (target - rig.previousTarget) / SIM_DT;
    rig.heightVelocity =
      (rig.heightVelocity + SIM_DT * (omega * omega * (target - rig.height) + 2 * omega * targetVelocity)) /
      (1 + 2 * omega * SIM_DT + omega * omega * SIM_DT * SIM_DT);
    rig.height += SIM_DT * rig.heightVelocity;
  }
  rig.previousTarget = target;
  // Over the sprung height, the camera height that projects the base point to the row `horizonRow + f * height / D_cam`
  // at this pitch: the pitch's part passes through no spring, so pitch alone never moves the base point on screen.
  const cameraY = rig.height + (definition.height + dCam * Math.sin(pitch)) / Math.cos(pitch);

  return {
    x: cameraX,
    y: cameraY,
    z: cameraZ,
    yaw: rig.yaw,
    pitch,
    s: sCamera,
    focalLength: definition.focalLength,
    centerX: definition.centerX,
    centerY: definition.horizonRow,
  };
}
