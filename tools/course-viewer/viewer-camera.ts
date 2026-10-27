import type { ViewParameters } from './viewer-gl.js';

/**
 * The viewer's camera: where it stands and where it looks, no point it turns about. World axes are the course's: +Y
 * up, yaw 0 facing +Z and positive yaw turning toward +X; positive pitch looks down. It looks round where it stands and
 * moves along its view, sideways and up, as a first-person game's does.
 */
export interface FlyCamera {
  /** Where the eye stands, relative to the layout's origin. */
  position: [number, number, number];
  yaw: number;
  pitch: number;
  perspective: boolean;
  /** A parallel view's scale: the distance at which a perspective view shows things as large. */
  distance: number;
  /** Metres per second the eye moves at. */
  speed: number;
}

/** The steepest the eye may look up or down by hand (Top looks straight down). */
export const PITCH_LIMIT = (89 * Math.PI) / 180;
/** Metres per second the eye moves at first, the step a wheel notch multiplies or divides it by, and Shift's factor. */
export const INITIAL_SPEED = 30;
const SPEED_STEP = 1.25;
const FAST = 5;
/** Radians a CSS pixel of looking turns the eye. */
const LOOK = 0.004;
/** CSS pixels from where it touched at which the touch stick gives full speed. */
const STICK_REACH = 80;

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

export function cameraBasis(camera: FlyCamera) {
  const cp = Math.cos(camera.pitch),
    sp = Math.sin(camera.pitch);
  // Looking down at `pitch`: forward descends. Right stays level, by the yaw alone, so straight down is defined.
  const forward = [Math.sin(camera.yaw) * cp, -sp, Math.cos(camera.yaw) * cp];
  const right = [Math.cos(camera.yaw), 0, -Math.sin(camera.yaw)];
  // up = forward × right
  const up = [
    forward[1]! * right[2]! - forward[2]! * right[1]!,
    forward[2]! * right[0]! - forward[0]! * right[2]!,
    forward[0]! * right[1]! - forward[1]! * right[0]!,
  ];
  return { forward, right, up, eye: [...camera.position] };
}

/** The view and projection for a viewport of `width` by `height` device pixels. */
export function viewParameters(
  camera: FlyCamera,
  width: number,
  height: number,
  pixelRatio: number,
  focal: number,
  heightScale = 1,
): ViewParameters & { readonly eye: number[]; readonly forward: number[]; readonly rayFromScreen: Float32Array } {
  const { forward, right, up, eye } = cameraBasis(camera);
  // In parallel projection the eye stands far back, so nothing before it is behind it.
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
    // The parallel view shows things as large as the perspective view shows them at its distance.
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
export function screenRay(camera: FlyCamera, x: number, y: number, width: number, height: number, focal: number) {
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

/** A moment's movement of the eye: metres along its view, to its right and straight up, and radians of yaw and pitch. */
export interface Motion {
  readonly ahead: number;
  readonly aside: number;
  readonly rise: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** Move and turn the eye: along its view (rising or falling with it), to its right, up; its pitch within the limit. */
export function moveCamera(camera: FlyCamera, motion: Motion) {
  const { forward, right } = cameraBasis(camera);
  for (let i = 0; i < 3; i++)
    camera.position[i] = camera.position[i]! + forward[i]! * motion.ahead + right[i]! * motion.aside;
  camera.position[1] += motion.rise;
  camera.yaw += motion.yaw;
  camera.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, camera.pitch + motion.pitch));
}

/**
 * The first-person controls. With a mouse: the first button's drag looks round, a double click holds the pointer (Esc
 * lets it go) to look without dragging, W/S move along the view, A/D sideways, E/Q up and down, Shift five times as
 * fast, and the wheel sets the speed (or, in a parallel view, the scale). On a touch screen: one finger on the right
 * half looks round, one on the left half is a stick whose direction and distance from where it touched move the eye,
 * and two fingers moving up or down together raise or lower it. Every movement goes to `move`, which applies it.
 */
export function attachFlyControls(element: HTMLElement, camera: FlyCamera, move: (motion: Motion) => void) {
  const keys = new Set<string>();
  const touches = new Map<number, { x: number; y: number; startX: number; startY: number; role: 'look' | 'stick' }>();
  let dragging: { x: number; y: number } | null = null;
  let last = 0;
  let running = false;
  const still = { ahead: 0, aside: 0, rise: 0, yaw: 0, pitch: 0 };
  const turn = (dx: number, dy: number) => move({ ...still, yaw: dx * LOOK, pitch: dy * LOOK });

  // Each frame while a key is held or the stick is out: the movement over the time since the last.
  const sticks = () => [...touches.values()].filter((touch) => touch.role === 'stick');
  const frame = (time: number) => {
    const seconds = Math.min(0.1, (time - last) / 1000);
    last = time;
    let ahead = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0),
      aside = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const rise = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
    for (const stick of sticks()) {
      ahead -= Math.max(-1, Math.min(1, (stick.y - stick.startY) / STICK_REACH));
      aside += Math.max(-1, Math.min(1, (stick.x - stick.startX) / STICK_REACH));
    }
    const step = camera.speed * (keys.has('shift') ? FAST : 1) * seconds;
    if (ahead || aside || rise) move({ ...still, ahead: ahead * step, aside: aside * step, rise: rise * step });
    running = keys.size > 0 || sticks().length > 0;
    if (running) requestAnimationFrame(frame);
  };
  const run = () => {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };

  const MOVES = new Set(['w', 'a', 's', 'd', 'e', 'q', 'shift']);
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    const key = event.key.toLowerCase();
    if (!MOVES.has(key)) return;
    keys.add(key);
    run();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') {
      if (event.button === 0 && document.pointerLockElement !== element)
        dragging = { x: event.clientX, y: event.clientY };
      return;
    }
    element.setPointerCapture(event.pointerId);
    const rect = element.getBoundingClientRect();
    const role = event.clientX - rect.left < rect.width / 2 ? 'stick' : 'look';
    touches.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      role,
    });
    if (role === 'stick') run();
  });
  element.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') {
      if (document.pointerLockElement === element) turn(event.movementX, event.movementY);
      else if (dragging) {
        turn(event.clientX - dragging.x, event.clientY - dragging.y);
        dragging = { x: event.clientX, y: event.clientY };
      }
      return;
    }
    const touch = touches.get(event.pointerId);
    if (!touch) return;
    const dx = event.clientX - touch.x,
      dy = event.clientY - touch.y;
    touch.x = event.clientX;
    touch.y = event.clientY;
    // Two fingers together rise and fall: a drag the screen's height is as far as two seconds at the speed.
    if (touches.size === 2) move({ ...still, rise: (-dy / element.clientHeight) * camera.speed * 2 });
    else if (touch.role === 'look') turn(dx, dy);
  });
  const end = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') dragging = null;
    else touches.delete(event.pointerId);
  };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  element.addEventListener('dblclick', () => void element.requestPointerLock());
  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const notches = event.deltaY / (event.deltaMode === 1 ? 3 : 100);
      if (camera.perspective) camera.speed = Math.max(0.1, Math.min(10000, camera.speed * SPEED_STEP ** -notches));
      else camera.distance = Math.max(0.5, Math.min(2e5, camera.distance * SPEED_STEP ** notches));
      move(still);
    },
    { passive: false },
  );
  element.addEventListener('contextmenu', (event) => event.preventDefault());
}
