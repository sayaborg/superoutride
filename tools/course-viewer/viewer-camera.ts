import type { ViewParameters } from './viewer-gl.js';

/**
 * The viewer's camera: it turns about a point of interest (the target), comes nearer or goes back, and moves sideways.
 * World axes are the course's: +Y up, yaw 0 facing +Z and positive yaw turning toward +X. One finger (or the mouse's
 * first button) turns, two fingers pinch and move (the mouse's wheel comes nearer, its other buttons move).
 */
export interface OrbitCamera {
  /** The point of interest, relative to the layout's origin. */
  target: [number, number, number];
  /** The direction the eye looks, as a yaw. */
  yaw: number;
  /** The eye's elevation above the target, radians (positive looks down). */
  pitch: number;
  distance: number;
  perspective: boolean;
}

/** The view's vertical focal length in device pixels: the game's frame, 320 by 240 at a focal length of 240, fitted. */
export function focalPixels(
  width: number,
  height: number,
  focalLength: number,
  frameWidth: number,
  frameHeight: number,
) {
  return focalLength * Math.min(width / frameWidth, height / frameHeight);
}

export function cameraBasis(camera: OrbitCamera) {
  const cp = Math.cos(camera.pitch),
    sp = Math.sin(camera.pitch);
  // Looking down at `pitch`: forward descends.
  const forward = [Math.sin(camera.yaw) * cp, -sp, Math.cos(camera.yaw) * cp];
  const right = [Math.cos(camera.yaw), 0, -Math.sin(camera.yaw)];
  // up = forward × right
  const up = [
    forward[1]! * right[2]! - forward[2]! * right[1]!,
    forward[2]! * right[0]! - forward[0]! * right[2]!,
    forward[0]! * right[1]! - forward[1]! * right[0]!,
  ];
  const eye = camera.target.map((t, i) => t - forward[i]! * camera.distance);
  return { forward, right, up, eye };
}

/** The view and projection for a viewport of `width` by `height` device pixels. */
export function viewParameters(
  camera: OrbitCamera,
  width: number,
  height: number,
  pixelRatio: number,
  focal: number,
  heightScale = 1,
): ViewParameters & { readonly eye: number[]; readonly forward: number[]; readonly rayFromScreen: Float32Array } {
  const { forward, right, up, eye } = cameraBasis(camera);
  // In parallel projection the eye stands far back, so nothing near the target is behind it.
  const back = camera.perspective ? 0 : Math.max(10000, camera.distance * 20);
  const from = eye.map((e, i) => e - forward[i]! * back);
  const view = new Float32Array(16);
  const rows = [right, up, forward.map((f) => -f)];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) view[c * 4 + r] = rows[r]![c]!;
    view[12 + r] = -(rows[r]![0]! * from[0]! + rows[r]![1]! * from[1]! + rows[r]![2]! * from[2]!);
  }
  view[15] = 1;
  const projection = new Float32Array(16);
  const near = camera.perspective ? 0.01 : 1,
    far = camera.perspective ? 1e7 : back + camera.distance * 4 + 100000;
  if (camera.perspective) {
    projection[0] = (2 * focal) / width;
    projection[5] = (2 * focal) / height;
    projection[10] = -(far + near) / (far - near);
    projection[11] = -1;
    projection[14] = (-2 * far * near) / (far - near);
  } else {
    // The parallel view shows at the target what the perspective view shows there.
    const scale = focal / camera.distance;
    projection[0] = (2 * scale) / width;
    projection[5] = (2 * scale) / height;
    projection[10] = -2 / (far - near);
    projection[14] = -(far + near) / (far - near);
    projection[15] = 1;
  }
  // A screen point (x, y in clip units) to a world ray, for the sky.
  const rayFromScreen = new Float32Array(9);
  for (let c = 0; c < 3; c++) {
    rayFromScreen[c] = (right[c]! * width) / (2 * focal);
    rayFromScreen[3 + c] = (up[c]! * height) / (2 * focal);
    rayFromScreen[6 + c] = forward[c]!;
  }
  // Facing reads the eye: in a parallel view, a point far back along the view.
  const facingEye = camera.perspective ? eye : eye.map((e, i) => e - forward[i]! * 1e7);
  return {
    view,
    projection,
    perspective: camera.perspective,
    near,
    far,
    width,
    height,
    pixelRatio,
    heightScale,
    eye: facingEye,
    forward,
    rayFromScreen,
  };
}

/** A world ray through a viewport point (CSS pixels from the top left). */
export function screenRay(camera: OrbitCamera, x: number, y: number, width: number, height: number, focal: number) {
  const { forward, right, up, eye } = cameraBasis(camera);
  const dx = (x - width / 2) / focal,
    dy = (height / 2 - y) / focal;
  if (camera.perspective) {
    const d = forward.map((f, i) => f + right[i]! * dx + up[i]! * dy);
    const n = Math.hypot(d[0]!, d[1]!, d[2]!);
    return { origin: eye, direction: d.map((v) => v / n) };
  }
  const k = camera.distance;
  const origin = eye.map((e, i) => e + right[i]! * dx * k + up[i]! * dy * k - forward[i]! * 1e5);
  return { origin, direction: forward };
}

/** Pointer and wheel input turning, moving and bringing the camera nearer; `changed` hears every change. */
export function attachCameraInput(element: HTMLElement, camera: OrbitCamera, changed: () => void, focal: () => number) {
  const pointers = new Map<number, { x: number; y: number; button: number }>();
  let pinch: { distance: number; x: number; y: number } | null = null;
  const pan = (dx: number, dy: number) => {
    const { right, up } = cameraBasis(camera);
    const metres = camera.distance / focal();
    for (let i = 0; i < 3; i++) camera.target[i] = camera.target[i]! - right[i]! * dx * metres + up[i]! * dy * metres;
  };
  const turn = (dx: number, dy: number) => {
    camera.yaw += dx * 0.006;
    camera.pitch = Math.max(-1.55, Math.min(1.5707, camera.pitch + dy * 0.006));
  };
  const zoom = (factor: number) => {
    camera.distance = Math.max(0.5, Math.min(2e5, camera.distance * factor));
  };
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  };
  element.addEventListener('pointerdown', (event) => {
    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
    pinch = pointers.size === 2 ? pair() : null;
  });
  element.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x,
      dy = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;
    if (pointers.size === 1) {
      if (previous.button === 0 && !event.shiftKey) turn(dx, dy);
      else pan(dx, dy);
    } else if (pointers.size === 2 && pinch) {
      const now = pair();
      if (now.distance > 0 && pinch.distance > 0) zoom(pinch.distance / now.distance);
      pan(now.x - pinch.x, now.y - pinch.y);
      pinch = now;
    }
    changed();
  });
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    pinch = pointers.size === 2 ? pair() : null;
  };
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom(Math.exp(event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0015)));
      changed();
    },
    { passive: false },
  );
  element.addEventListener('contextmenu', (event) => event.preventDefault());
}
