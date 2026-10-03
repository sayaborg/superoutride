import { standardGamepads } from './gamepads.js';
import { TOUCH_FLICK_DISTANCE_PX, type TouchArea } from './touch-input.js';
import type { TouchPointer, TouchPointers } from './touch-pointers.js';

/** A menu command. */
export type MenuCommand = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'CONFIRM' | 'BACK' | 'PAUSE';
/**
 * Where devices go: while driving, driving input takes them and only PAUSE reaches the menu; in a menu every command
 * does; off (page hidden) nothing does.
 */
export type InputRoute = 'driving' | 'menu' | 'off';

const KEYS: ReadonlyMap<string, MenuCommand> = new Map<string, MenuCommand>([
  ['ArrowUp', 'UP'],
  ['ArrowDown', 'DOWN'],
  ['ArrowLeft', 'LEFT'],
  ['ArrowRight', 'RIGHT'],
  ['Enter', 'CONFIRM'],
  ['NumpadEnter', 'CONFIRM'],
]);
/** Standard-mapping buttons: D-pad, A and B; Start is PAUSE while driving and CONFIRM in a menu. */
const BUTTONS: readonly (readonly [index: number, command: MenuCommand])[] = [
  [12, 'UP'],
  [13, 'DOWN'],
  [14, 'LEFT'],
  [15, 'RIGHT'],
  [0, 'CONFIRM'],
  [1, 'BACK'],
];
const START_BUTTON = 9;
/** A left-stick axis beyond this magnitude is a direction. */
const STICK_DIRECTION_THRESHOLD = 0.5;

/**
 * The one menu-command authority, apart from driving input. Keys follow the operating system's repeat; gamepad
 * controls and touch never repeat. A gamepad control commands on its press only, so a control already held when the
 * route changes commands nothing until pressed again. A menu touch is a flick in the touch area's left half (its larger
 * axis gives the direction) or a tap in its right half, decided when the finger lifts; a cancelled touch commands
 * nothing. The shell's corner buttons `press` BACK and PAUSE.
 */
export class MenuInput {
  private route: InputRoute = 'off';
  private readonly queue: MenuCommand[] = [];
  private readonly held = new Map<number, Set<string>>();
  private readonly touches = new Map<
    number,
    { readonly left: boolean; readonly x: number; readonly y: number; at: TouchPointer }
  >();

  constructor(
    private readonly target: Window,
    pointers: TouchPointers,
    private readonly touchArea: () => TouchArea,
  ) {
    target.addEventListener('keydown', (event) => this.key(event));
    pointers.subscribe({
      begin: (pointer) => this.beginTouch(pointer),
      move: (pointer) => {
        const touch = this.touches.get(pointer.pointerId);
        if (touch) touch.at = pointer;
      },
      end: (pointerId, lifted) => this.endTouch(pointerId, lifted),
    });
  }

  setRoute(route: InputRoute): void {
    if (route === this.route) return;
    this.route = route;
    this.queue.length = 0;
    this.touches.clear();
  }

  /** A corner button's command. */
  press(command: 'BACK' | 'PAUSE'): void {
    this.accept(command);
  }

  /** Read the gamepads once and return the commands since the last poll, in order. */
  poll(): MenuCommand[] {
    for (const gamepad of standardGamepads(this.target)) {
      const pressed = new Set<string>();
      const fire = (name: string, command: MenuCommand) => {
        pressed.add(name);
        if (!this.held.get(gamepad.index)?.has(name)) this.accept(command);
      };
      for (const [index, command] of BUTTONS) if (gamepad.buttons[index]?.pressed) fire(`b${index}`, command);
      if (gamepad.buttons[START_BUTTON]?.pressed) fire('start', this.route === 'driving' ? 'PAUSE' : 'CONFIRM');
      const [x = 0, y = 0] = gamepad.axes;
      if (Math.max(Math.abs(x), Math.abs(y)) > STICK_DIRECTION_THRESHOLD)
        fire('stick', Math.abs(x) > Math.abs(y) ? (x < 0 ? 'LEFT' : 'RIGHT') : y < 0 ? 'UP' : 'DOWN');
      this.held.set(gamepad.index, pressed);
    }
    return this.queue.splice(0);
  }

  private accept(command: MenuCommand): boolean {
    if (this.route === 'off' || (this.route === 'driving' && command !== 'PAUSE')) return false;
    this.queue.push(command);
    return true;
  }

  private key(event: KeyboardEvent): void {
    const command = event.code === 'Escape' ? (this.route === 'driving' ? 'PAUSE' : 'BACK') : KEYS.get(event.code);
    if (command === undefined || (command === 'PAUSE' && event.repeat)) return;
    if (this.accept(command)) event.preventDefault();
  }

  private beginTouch(pointer: TouchPointer): void {
    if (this.route !== 'menu') return;
    const area = this.touchArea();
    this.touches.set(pointer.pointerId, {
      left: pointer.x < area.left + area.width * 0.5,
      x: pointer.x,
      y: pointer.y,
      at: pointer,
    });
  }

  /** A lifted touch commands by its path; a cancelled one commands nothing. */
  private endTouch(pointerId: number, lifted: boolean): void {
    const touch = this.touches.get(pointerId);
    if (!touch) return;
    this.touches.delete(pointerId);
    if (!lifted) return;
    const dx = touch.at.x - touch.x,
      dy = touch.at.y - touch.y;
    const flick = Math.max(Math.abs(dx), Math.abs(dy)) >= TOUCH_FLICK_DISTANCE_PX;
    if (touch.left && flick)
      this.accept(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'LEFT' : 'RIGHT') : dy < 0 ? 'UP' : 'DOWN');
    else if (!touch.left && !flick) this.accept('CONFIRM');
  }
}
