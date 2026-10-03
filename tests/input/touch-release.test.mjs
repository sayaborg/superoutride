import assert from 'node:assert/strict';
import test from 'node:test';
import { InputManager } from '../../src/input/input-manager.js';
import { TouchPointers } from '../../src/input/touch-pointers.js';

// A page whose events are dispatched by hand: no Gamepad API, a visible document.
function fakePage() {
  const page = new EventTarget();
  page.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  return page;
}
const fire = (target, type, fields) => target.dispatchEvent(Object.assign(new Event(type), fields));

test('a touch whose up and cancel never arrive holds no input once no finger touches the screen', () => {
  const page = fakePage();
  const pointers = new TouchPointers(page);
  const input = new InputManager(page, pointers, () => ({ left: 0, top: 0, width: 400, height: 300 }));
  // A pedal finger in the right half pushed up to full throttle.
  fire(page, 'pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 300, clientY: 200 });
  fire(page, 'pointermove', { pointerType: 'touch', pointerId: 7, clientX: 300, clientY: 100 });
  assert.equal(input.sample().throttle, 1);
  // Neither pointerup nor pointercancel arrives; only the fact that no touch remains.
  fire(page, 'touchend', { touches: [] });
  const sample = input.sample();
  assert.equal(Number(sample.throttle), 0);
  assert.equal(Number(sample.brake), 0);
  assert.equal(sample.steering, 0);
  assert.deepEqual(input.touch, { steering: null, pedal: null });
});
