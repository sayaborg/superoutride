import { cross3, dot3, sub3, WORLD_UP, type Vec3 } from '../../core/vector3.js';
import type { VehicleModel } from './vehicle-model.js';
import type { BodyKinematics, VehicleDynamicsState } from './vehicle-state.js';
import type { ContactObservation } from './vehicle-contact.js';

/** The dynamic values the bump stop reads and changes: body velocity and the yaw and pitch rates. */
type BumpStopState = Pick<VehicleDynamicsState, 'velocityX' | 'velocityY' | 'velocityZ'> & {
  yawRate: number;
  pitchRate: number;
};

export function createBumpStopWorkspace() {
  const row = () => ({
    active: false,
    normal: { x: 0, y: 0, z: 0 } as Vec3,
    arm: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    excess: 0,
    impulse: 0,
  });
  return { front: row(), rear: row(), omega: { x: 0, y: 0, z: 0 }, scratch: { x: 0, y: 0, z: 0 } };
}
type BumpStopWorkspace = ReturnType<typeof createBumpStopWorkspace>;
type BumpStopRow = BumpStopWorkspace['front'];

/**
 * Suspension travel is an inelastic unilateral stop at each supported upright contact. After the
 * substep's force update, the compression rate along the surface normal at the contact may not
 * exceed max(0,(qTravel-q)/dt), so the next position does not pass qTravel. Nonnegative normal
 * impulses at the contact points solve that two-row complementarity problem exactly; they act on
 * translation, yaw and pitch through the same inertias as contact forces and never add energy.
 */
export function applySuspensionBumpStops(
  vehicle: BumpStopState,
  compiledVehicle: VehicleModel['compiledVehicle'],
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  dt: number,
  workspace: BumpStopWorkspace,
): void {
  const a = prepareBumpStopRow(vehicle, compiledVehicle, body, front, dt, workspace.front, workspace);
  const b = prepareBumpStopRow(vehicle, compiledVehicle, body, rear, dt, workspace.rear, workspace);
  if (!((a.active && a.excess > 0) || (b.active && b.excess > 0))) return;
  const { mass } = compiledVehicle;
  if (!a.active || !b.active) {
    const row = a.active ? a : b;
    row.impulse = row.excess / bumpStopResponse(row, row, body, mass, workspace);
  } else {
    // Compression-rate reduction per unit impulse; the matrix is symmetric positive definite.
    const kaa = bumpStopResponse(a, a, body, mass, workspace),
      kbb = bumpStopResponse(b, b, body, mass, workspace),
      kab = bumpStopResponse(a, b, body, mass, workspace);
    const determinant = kaa * kbb - kab * kab;
    // The unique complementary solution has one of three active sets; keep the one that satisfies it.
    let best = Infinity;
    for (let set = 0; set < 3; set += 1) {
      const ia =
        set === 0 ? (a.excess * kbb - b.excess * kab) / determinant : set === 1 ? Math.max(0, a.excess) / kaa : 0;
      const ib =
        set === 0 ? (b.excess * kaa - a.excess * kab) / determinant : set === 2 ? Math.max(0, b.excess) / kbb : 0;
      const violation = Math.max(
        -ia,
        -ib,
        (a.excess - kaa * ia - kab * ib) / kaa,
        (b.excess - kab * ia - kbb * ib) / kbb,
      );
      if (violation < best) {
        best = violation;
        a.impulse = ia;
        b.impulse = ib;
      }
    }
  }
  applyBumpStopImpulse(vehicle, a, mass);
  applyBumpStopImpulse(vehicle, b, mass);
}

function applyBumpStopImpulse(vehicle: BumpStopState, row: BumpStopRow, mass: number): void {
  if (!row.active || !(row.impulse > 0)) return;
  vehicle.velocityX += (row.normal.x * row.impulse) / mass;
  vehicle.velocityY += (row.normal.y * row.impulse) / mass;
  vehicle.velocityZ += (row.normal.z * row.impulse) / mass;
  vehicle.yawRate += row.yaw * row.impulse;
  vehicle.pitchRate += row.pitch * row.impulse;
}

function prepareBumpStopRow(
  vehicle: BumpStopState,
  compiledVehicle: VehicleModel['compiledVehicle'],
  body: BodyKinematics,
  contact: ContactObservation,
  dt: number,
  row: BumpStopRow,
  workspace: BumpStopWorkspace,
): BumpStopRow {
  const normal = contact.surface.normal;
  row.active = contact.supportAvailable && dot3(body.up, normal) > 0;
  row.impulse = 0;
  if (!row.active) return row;
  const { omega, scratch } = workspace;
  row.normal = normal;
  sub3(contact.contactPoint, body.position, row.arm);
  omega.x = WORLD_UP.x * vehicle.yawRate - body.right.x * vehicle.pitchRate;
  omega.y = WORLD_UP.y * vehicle.yawRate - body.right.y * vehicle.pitchRate;
  omega.z = WORLD_UP.z * vehicle.yawRate - body.right.z * vehicle.pitchRate;
  cross3(omega, row.arm, scratch);
  // Compression rate of the body point at the contact along the surface normal.
  const rate = -(
    normal.x * (vehicle.velocityX + scratch.x) +
    normal.y * (vehicle.velocityY + scratch.y) +
    normal.z * (vehicle.velocityZ + scratch.z)
  );
  row.excess = rate - Math.max(0, (contact.station.suspension.qTravel + contact.gap) / dt);
  const moment = cross3(row.arm, normal, scratch);
  row.yaw = moment.y / compiledVehicle.yawInertia;
  row.pitch = -dot3(moment, body.right) / compiledVehicle.pitchInertia;
  return row;
}

/** Compression-rate reduction at row i per unit normal impulse at row j. */
function bumpStopResponse(
  i: BumpStopRow,
  j: BumpStopRow,
  body: BodyKinematics,
  mass: number,
  workspace: BumpStopWorkspace,
): number {
  const { omega, scratch } = workspace;
  omega.x = WORLD_UP.x * j.yaw - body.right.x * j.pitch;
  omega.y = WORLD_UP.y * j.yaw - body.right.y * j.pitch;
  omega.z = WORLD_UP.z * j.yaw - body.right.z * j.pitch;
  return dot3(i.normal, j.normal) / mass + dot3(i.normal, cross3(omega, i.arm, scratch));
}
