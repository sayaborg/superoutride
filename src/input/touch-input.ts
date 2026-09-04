import { clamp } from '../core/math.js';
import type { DrivingInput } from './driving-input.js';
import { PedalInputArbiter } from './pedal-input-arbiter.js';
import { SteeringInputArbiter, type SteeringDirection } from './steering-input-arbiter.js';

type MomentaryKey = 'throttle' | 'brake';
type AnalogRole = 'steering' | 'pedal';

interface AnalogPointer {
  readonly pointerId: number;
  readonly role: AnalogRole;
  readonly startX: number;
  readonly startY: number;
  readonly fullScaleDistance: number;
}

export interface TouchPedalRequests {
  readonly throttle: number;
  readonly brake: number;
}

export const TOUCH_ANALOG_FULL_SCALE_SHORT_SIDE_FRACTION = 0.25;
export const TOUCH_ANALOG_FULL_SCALE_MIN_PX = 72;
export const TOUCH_ANALOG_FULL_SCALE_MAX_PX = 120;

export function touchAnalogFullScaleDistance(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)
    || !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    throw new RangeError('touch analog viewport dimensions must be finite and > 0');
  }
  return clamp(
    Math.min(viewportWidth, viewportHeight) * TOUCH_ANALOG_FULL_SCALE_SHORT_SIDE_FRACTION,
    TOUCH_ANALOG_FULL_SCALE_MIN_PX,
    TOUCH_ANALOG_FULL_SCALE_MAX_PX,
  );
}

export function touchSteeringRequest(
  startX: number,
  currentX: number,
  fullScaleDistance: number,
): number {
  assertFiniteTouchAxis(startX, currentX, fullScaleDistance);
  return clamp((currentX - startX) / fullScaleDistance, -1, 1);
}

export function touchPedalRequests(
  startY: number,
  currentY: number,
  fullScaleDistance: number,
): TouchPedalRequests {
  assertFiniteTouchAxis(startY, currentY, fullScaleDistance);
  const axis = clamp((startY - currentY) / fullScaleDistance, -1, 1);
  return axis >= 0
    ? { throttle: axis, brake: 0 }
    : { throttle: 0, brake: -axis };
}

export class TouchInput {
  private throttlePointers = new Set<number>();
  private brakePointers = new Set<number>();
  private readonly steerLeftButton: HTMLElement;
  private readonly steerRightButton: HTMLElement;
  private steeringPointer: AnalogPointer | null = null;
  private pedalPointer: AnalogPointer | null = null;
  private readonly steeringIndicator: HTMLElement | null;
  private readonly pedalIndicator: HTMLElement | null;

  constructor(
    steerLeftButton: HTMLElement,
    steerRightButton: HTMLElement,
    throttleButton: HTMLElement,
    brakeButton: HTMLElement,
    private readonly lifecycleTarget: Window = window,
    visibilityDocument: Document = document,
    private readonly pedals = new PedalInputArbiter(),
    private readonly steering = new SteeringInputArbiter(),
  ) {
    this.steerLeftButton = steerLeftButton;
    this.steerRightButton = steerRightButton;
    this.steeringIndicator = createAnalogIndicator(visibilityDocument, 'steering');
    this.pedalIndicator = createAnalogIndicator(visibilityDocument, 'pedal');

    // Retain the existing non-touch button path for desktop/test fallback. Real touch pointers use
    // the full-screen relative-displacement path below and never publish the old digital buttons.
    this.bindSteeringButton(steerLeftButton, 'left', -1);
    this.bindSteeringButton(steerRightButton, 'right', 1);
    this.bindMomentary(throttleButton, 'throttle');
    this.bindMomentary(brakeButton, 'brake');

    lifecycleTarget.addEventListener('pointerdown', (event) => this.beginAnalogPointer(event), true);
    lifecycleTarget.addEventListener('pointermove', (event) => this.moveAnalogPointer(event), true);
    lifecycleTarget.addEventListener('pointerup', (event) => this.releasePointer(event.pointerId), true);
    lifecycleTarget.addEventListener('pointercancel', (event) => this.releasePointer(event.pointerId), true);
    lifecycleTarget.addEventListener('blur', () => this.reset());
    lifecycleTarget.addEventListener('pagehide', () => this.reset());
    visibilityDocument.addEventListener('visibilitychange', () => {
      if (visibilityDocument.visibilityState === 'hidden') this.reset();
    });
  }

  sample(): DrivingInput {
    const pedals = this.pedals.sample();
    this.syncSteeringButtons();
    return {
      steering: this.steering.sample(),
      ...pedals,
    };
  }

  private beginAnalogPointer(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    const viewportWidth = this.lifecycleTarget.innerWidth;
    const viewportHeight = this.lifecycleTarget.innerHeight;
    const fullScaleDistance = touchAnalogFullScaleDistance(viewportWidth, viewportHeight);
    const role: AnalogRole = event.clientX < viewportWidth * 0.5 ? 'steering' : 'pedal';

    if (role === 'steering') {
      if (this.steeringPointer !== null) return;
      this.steeringPointer = {
        pointerId: event.pointerId,
        role,
        startX: event.clientX,
        startY: event.clientY,
        fullScaleDistance,
      };
      this.steering.setValue(touchAnalogSteeringSource(event.pointerId), 0);
      showIndicator(this.steeringIndicator, event.clientX, event.clientY, 0, 0, 'STEER 0%');
    } else {
      if (this.pedalPointer !== null) return;
      this.pedalPointer = {
        pointerId: event.pointerId,
        role,
        startX: event.clientX,
        startY: event.clientY,
        fullScaleDistance,
      };
      showIndicator(this.pedalIndicator, event.clientX, event.clientY, 0, -90, 'PEDAL 0%');
    }
  }

  private moveAnalogPointer(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;

    if (this.steeringPointer?.pointerId === event.pointerId) {
      const pointer = this.steeringPointer;
      const request = touchSteeringRequest(
        pointer.startX,
        event.clientX,
        pointer.fullScaleDistance,
      );
      this.steering.setValue(touchAnalogSteeringSource(event.pointerId), request);
      showIndicator(
        this.steeringIndicator,
        pointer.startX,
        pointer.startY,
        Math.abs(request) * pointer.fullScaleDistance,
        request < 0 ? 180 : 0,
        `STEER ${Math.round(request * 100)}%`,
      );
      return;
    }

    if (this.pedalPointer?.pointerId === event.pointerId) {
      const pointer = this.pedalPointer;
      const requests = touchPedalRequests(
        pointer.startY,
        event.clientY,
        pointer.fullScaleDistance,
      );
      const source = touchAnalogPedalSource(event.pointerId);
      if (requests.throttle > 0) {
        this.pedals.setSource(source, 'throttle', requests.throttle);
        showIndicator(
          this.pedalIndicator,
          pointer.startX,
          pointer.startY,
          requests.throttle * pointer.fullScaleDistance,
          -90,
          `ACCEL ${Math.round(requests.throttle * 100)}%`,
        );
      } else if (requests.brake > 0) {
        this.pedals.setSource(source, 'brake', requests.brake);
        showIndicator(
          this.pedalIndicator,
          pointer.startX,
          pointer.startY,
          requests.brake * pointer.fullScaleDistance,
          90,
          `BRAKE ${Math.round(requests.brake * 100)}%`,
        );
      } else {
        this.pedals.setSource(source, 'throttle', false);
        showIndicator(this.pedalIndicator, pointer.startX, pointer.startY, 0, -90, 'PEDAL 0%');
      }
    }
  }

  private bindSteeringButton(
    element: HTMLElement,
    side: 'left' | 'right',
    direction: SteeringDirection,
  ): void {
    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return;
      this.steering.press(touchSteeringSource(side, event.pointerId), direction);
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // The global terminal listeners remain authoritative when capture is unavailable.
      }
      this.syncSteeringButtons();
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      this.steering.release(touchSteeringSource(side, event.pointerId));
      this.syncSteeringButtons();
      event.preventDefault();
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      this.releasePointer(event.pointerId);
    });
  }

  private bindMomentary(element: HTMLElement, key: MomentaryKey): void {
    const pointers = key === 'throttle' ? this.throttlePointers : this.brakePointers;

    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return;
      pointers.add(event.pointerId);
      this.pedals.setSource(touchPedalSource(key, event.pointerId), key, true);
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // See the steering-button path above; window/page lifecycle remains the fallback.
      }
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointers.delete(event.pointerId);
      this.pedals.setSource(touchPedalSource(key, event.pointerId), key, false);
      event.preventDefault();
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', (event) => {
      this.releasePointer(event.pointerId);
    });
  }

  private releasePointer(pointerId: number): void {
    if (this.steeringPointer?.pointerId === pointerId) {
      this.steering.release(touchAnalogSteeringSource(pointerId));
      this.steeringPointer = null;
      hideIndicator(this.steeringIndicator);
    }
    if (this.pedalPointer?.pointerId === pointerId) {
      const source = touchAnalogPedalSource(pointerId);
      this.pedals.setSource(source, 'throttle', false);
      this.pedalPointer = null;
      hideIndicator(this.pedalIndicator);
    }

    this.steering.release(touchSteeringSource('left', pointerId));
    this.steering.release(touchSteeringSource('right', pointerId));
    this.throttlePointers.delete(pointerId);
    this.brakePointers.delete(pointerId);
    this.pedals.setSource(touchPedalSource('throttle', pointerId), 'throttle', false);
    this.pedals.setSource(touchPedalSource('brake', pointerId), 'brake', false);
    this.syncSteeringButtons();
  }

  private reset(): void {
    this.steering.reset();
    this.steeringPointer = null;
    this.pedalPointer = null;
    this.throttlePointers.clear();
    this.brakePointers.clear();
    this.pedals.reset();
    this.steerLeftButton.classList.remove('active');
    this.steerRightButton.classList.remove('active');
    hideIndicator(this.steeringIndicator);
    hideIndicator(this.pedalIndicator);
  }

  private syncSteeringButtons(): void {
    const source = this.steering.activeSource();
    this.steerLeftButton.classList.remove('active');
    this.steerRightButton.classList.remove('active');
    if (source?.startsWith('touch:left:')) this.steerLeftButton.classList.add('active');
    if (source?.startsWith('touch:right:')) this.steerRightButton.classList.add('active');
  }
}

function assertFiniteTouchAxis(start: number, current: number, fullScaleDistance: number): void {
  if (![start, current, fullScaleDistance].every(Number.isFinite) || !(fullScaleDistance > 0)) {
    throw new RangeError('touch analog axis values must be finite and full scale must be > 0');
  }
}

function createAnalogIndicator(documentRef: Document, role: AnalogRole): HTMLElement | null {
  if (typeof documentRef.createElement !== 'function' || documentRef.body == null) return null;
  const root = documentRef.createElement('div');
  root.className = `touch-analog-indicator touch-analog-${role}`;
  root.setAttribute('aria-hidden', 'true');
  const icon = documentRef.createElement('span');
  icon.className = 'touch-analog-origin-icon';
  const vector = documentRef.createElement('span');
  vector.className = 'touch-analog-vector';
  root.append(icon, vector);
  documentRef.body.appendChild(root);
  return root;
}

function showIndicator(
  indicator: HTMLElement | null,
  x: number,
  y: number,
  distance: number,
  angleDegrees: number,
  label: string,
): void {
  if (indicator === null) return;
  indicator.style.setProperty('--touch-origin-x', `${x}px`);
  indicator.style.setProperty('--touch-origin-y', `${y}px`);
  indicator.style.setProperty('--touch-vector-length', `${Math.max(0, distance)}px`);
  indicator.style.setProperty('--touch-vector-angle', `${angleDegrees}deg`);
  indicator.dataset.value = label;
  indicator.classList.add('active');
}

function hideIndicator(indicator: HTMLElement | null): void {
  indicator?.classList.remove('active');
}

function touchAnalogSteeringSource(pointerId: number): string {
  return `touch:analog-steering:${pointerId}`;
}

function touchAnalogPedalSource(pointerId: number): string {
  return `touch:analog-pedal:${pointerId}`;
}

function touchSteeringSource(side: 'left' | 'right', pointerId: number): string {
  return `touch:${side}:${pointerId}`;
}

function touchPedalSource(key: MomentaryKey, pointerId: number): string {
  return `touch:${key}:${pointerId}`;
}
