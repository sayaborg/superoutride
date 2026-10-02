import { clamp } from '../core/math.js';
import type { DrivingInputPublisher } from './driving-input-publisher.js';
import { createInputOwner, type InputOwner } from './input-owner.js';
import type { PedalChannel } from './pedal-input-arbiter.js';
import type { TouchPointer, TouchPointers } from './touch-pointers.js';

/** Compact touch calibration. CSS px is independent of backing-store/device pixel ratio. */
export const TOUCH_ANALOG_FULL_SCALE_DISTANCE_PX = 64;

/**
 * The client rectangle (CSS px) where driving pointers may start. Its left half selects steering;
 * the midpoint and right half select pedals.
 */
export interface TouchArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** An active steering pointer: its origin (client CSS px), request in [-1,1] and vector length (CSS px). */
export interface TouchSteeringObservation {
  readonly originX: number;
  readonly originY: number;
  readonly request: number;
  readonly vectorLength: number;
}

/** An active pedal pointer: its origin (client CSS px), pedal and request in [0,1], and vector length (CSS px). */
export interface TouchPedalObservation {
  readonly originX: number;
  readonly originY: number;
  readonly pedal: PedalChannel;
  readonly request: number;
  readonly vectorLength: number;
}

/** Each role's active pointer, or null while that role is inactive. */
export interface TouchObservation {
  readonly steering: TouchSteeringObservation | null;
  readonly pedal: TouchPedalObservation | null;
}

interface TrackedPointer<Observation> {
  readonly pointerId: number;
  readonly owner: InputOwner;
  readonly observation: Observation;
}

const INACTIVE_TOUCH: TouchObservation = Object.freeze({ steering: null, pedal: null });

function touchSteeringRequest(originX: number, currentX: number): number {
  assertFiniteTouchAxis(originX, currentX);
  return clamp((currentX - originX) / TOUCH_ANALOG_FULL_SCALE_DISTANCE_PX, -1, 1);
}

/** Upward displacement is throttle and downward displacement is brake; the origin is neutral throttle. */
function touchPedalRequest(
  originY: number,
  currentY: number,
): { readonly pedal: PedalChannel; readonly request: number } {
  assertFiniteTouchAxis(originY, currentY);
  const axis = clamp((originY - currentY) / TOUCH_ANALOG_FULL_SCALE_DISTANCE_PX, -1, 1);
  return axis >= 0 ? { pedal: 'throttle', request: axis } : { pedal: 'brake', request: -axis };
}

/**
 * Touch adapter: each role's pointer is one DIRECT owner created on press, with its role and origin fixed
 * until release. Its only local state is that pointer tracking, which the input manager resets.
 */
export class TouchInput {
  private steering: TrackedPointer<TouchSteeringObservation> | null = null;
  private pedal: TrackedPointer<TouchPedalObservation> | null = null;
  private current: TouchObservation = INACTIVE_TOUCH;

  constructor(
    pointers: TouchPointers,
    private readonly publisher: DrivingInputPublisher,
    private readonly touchArea: () => TouchArea,
  ) {
    pointers.subscribe({
      begin: (pointer) => this.beginPointer(pointer),
      move: (pointer) => this.movePointer(pointer),
      end: (pointerId) => this.releasePointer(pointerId),
    });
  }

  get observation(): TouchObservation {
    return this.current;
  }

  reset(): void {
    this.steering = null;
    this.pedal = null;
    this.publish();
  }

  private beginPointer({ pointerId, x, y }: TouchPointer): void {
    const area = admittedTouchArea(this.touchArea());
    if (x < area.left || x >= area.left + area.width || y < area.top || y >= area.top + area.height) return;

    if (x < area.left + area.width * 0.5) {
      if (this.steering !== null) return;
      const owner = createInputOwner('DIRECT');
      if (!this.publisher.setSteering(owner, 0)) return;
      this.steering = { pointerId, owner, observation: steeringObservation(x, y, 0) };
    } else {
      if (this.pedal !== null) return;
      const owner = createInputOwner('DIRECT');
      if (!this.publisher.setPedal(owner, 'throttle', 0)) return;
      this.pedal = { pointerId, owner, observation: pedalObservation(x, y, 'throttle', 0) };
    }
    this.publish();
  }

  private movePointer({ pointerId, x, y }: TouchPointer): void {
    const steering = this.steering;
    if (steering?.pointerId === pointerId) {
      const { originX, originY } = steering.observation;
      const request = touchSteeringRequest(originX, x);
      if (!this.publisher.setSteering(steering.owner, request)) return;
      this.steering = { ...steering, observation: steeringObservation(originX, originY, request) };
      this.publish();
      return;
    }

    const pedal = this.pedal;
    if (pedal?.pointerId === pointerId) {
      const { originX, originY } = pedal.observation;
      const { pedal: channel, request } = touchPedalRequest(originY, y);
      if (!this.publisher.setPedal(pedal.owner, channel, request)) return;
      this.pedal = { ...pedal, observation: pedalObservation(originX, originY, channel, request) };
      this.publish();
    }
  }

  private releasePointer(pointerId: number): void {
    if (this.steering?.pointerId === pointerId) {
      this.publisher.releaseSteering(this.steering.owner);
      this.steering = null;
      this.publish();
    }
    if (this.pedal?.pointerId === pointerId) {
      this.publisher.releasePedal(this.pedal.owner);
      this.pedal = null;
      this.publish();
    }
  }

  private publish(): void {
    this.current =
      this.steering === null && this.pedal === null
        ? INACTIVE_TOUCH
        : Object.freeze({ steering: this.steering?.observation ?? null, pedal: this.pedal?.observation ?? null });
  }
}

function steeringObservation(originX: number, originY: number, request: number): TouchSteeringObservation {
  return Object.freeze({
    originX,
    originY,
    request,
    vectorLength: Math.abs(request) * TOUCH_ANALOG_FULL_SCALE_DISTANCE_PX,
  });
}

function pedalObservation(
  originX: number,
  originY: number,
  pedal: PedalChannel,
  request: number,
): TouchPedalObservation {
  return Object.freeze({
    originX,
    originY,
    pedal,
    request,
    vectorLength: request * TOUCH_ANALOG_FULL_SCALE_DISTANCE_PX,
  });
}

function admittedTouchArea(area: TouchArea): TouchArea {
  if (
    ![area.left, area.top, area.width, area.height].every(Number.isFinite) ||
    !(area.width > 0) ||
    !(area.height > 0)
  ) {
    throw new RangeError('touch area must be finite with width and height > 0');
  }
  return area;
}

function assertFiniteTouchAxis(origin: number, current: number): void {
  if (!Number.isFinite(origin) || !Number.isFinite(current)) {
    throw new RangeError('touch analog axis values must be finite');
  }
}
