import assert from 'node:assert/strict';
import test from 'node:test';
import { TouchPointers } from '../../src/input/touch-pointers.js';
import { MenuInput } from '../../src/input/menu-input.js';

// A page whose events are dispatched by hand, and one standard gamepad whose buttons the test holds.
const page = Object.assign(new EventTarget(), {
  document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
});
const held = new Set();
const gamepads = {
  get gamepads() {
    return [
      {
        index: 0,
        id: 'pad',
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.has(i) })),
      },
    ];
  },
};
const RT = 7,
  LT = 6;

test('in menus the accelerator confirms and the brake goes back; a pedal held from driving waits for its release', () => {
  const menu = new MenuInput(page, new TouchPointers(page), gamepads, () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 300,
  }));
  menu.setRoute('menu');
  // The gamepad's first reading commands nothing.
  assert.deepEqual(menu.poll(), []);
  held.add(RT);
  assert.deepEqual(menu.poll(), ['CONFIRM']);
  held.clear();
  held.add(LT);
  assert.deepEqual(menu.poll(), ['BACK']);
  held.clear();
  menu.poll();
  // While driving the pedals are driving input; the accelerator held into a menu commands nothing until pressed again.
  menu.setRoute('driving');
  held.add(RT);
  assert.deepEqual(menu.poll(), []);
  menu.setRoute('menu');
  assert.deepEqual(menu.poll(), []);
  held.clear();
  menu.poll();
  held.add(RT);
  assert.deepEqual(menu.poll(), ['CONFIRM']);
});
