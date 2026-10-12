import assert from 'node:assert/strict';
import test from 'node:test';
import { createScreenHost, TRANSITION_STEPS } from '../../src/shell/screen-host.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

// The host's frame loop on a stepped clock: each frame advances one fixed step.
function steppedFrames() {
  let now = 0;
  const pending = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => pending.push(callback);
  globalThis.cancelAnimationFrame = () => {};
  return (count) => {
    for (let i = 0; i < count; i++) {
      now += SIM_DT * 1000;
      pending.splice(0).forEach((callback) => callback(now));
    }
  };
}

const events = () => ({ addEventListener: () => {}, hidden: false, location: { reload: () => {} } });
const screen = (name, log) => ({
  live: false,
  tick: () => log.push(`tick ${name}`),
  render: () => log.push(`render ${name}`),
  command: () => null,
  leave: () => log.push(`leave ${name}`),
});

test('a screen shown before the page has brightened becomes current through black', () => {
  const frames = steppedFrames();
  const log = [],
    brightness = [];
  const devices = { setRoute() {}, menuCommands: () => [], menuSound() {}, setBrightness: (b) => brightness.push(b) };
  const host = createScreenHost(events(), events(), devices, screen('first', log));
  // The page starts from black; the next screen is asked for at once.
  host.show(screen('second', log));
  frames(4 * TRANSITION_STEPS);
  assert.ok(log.includes('leave first'));
  assert.equal(log.at(-1), 'render second');
  assert.ok(log.includes('tick second'), 'the second screen advances once it is fully bright');
  assert.ok(brightness.every((b) => Number.isInteger(b) && b >= 0 && b <= TRANSITION_STEPS));
  assert.equal(brightness.at(-1), TRANSITION_STEPS);
});
