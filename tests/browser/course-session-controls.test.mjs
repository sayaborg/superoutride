import assert from 'node:assert/strict';
import test from 'node:test';
import { installBrowserDom } from '../helpers/browser-dom.mjs';
import { mountCourseSessionControls, readBrowserSessionSettings } from '../../dist/browser/course-session-controls.js';

test('Session setup owns preset locking, editable settings, keyboard focus and a fresh run', (t) => {
  const dom = installBrowserDom(t, '?mode=circuit');
  const preset = readBrowserSessionSettings(new URLSearchParams(), {
    vehicleId: 'TESTAROSSA',
    rivalCount: 2,
    lapCount: 2,
  });
  const panels = [],
    actions = [];
  const canvas = dom.elements.get('game');
  canvas.insertAdjacentElement = (_, panel) => panels.push(panel);
  const controls = mountCourseSessionControls(canvas, preset, preset, 99, {
    start: () => actions.push('start'),
    pause: (paused) => actions.push(paused),
  });
  const form = panels.find((p) => p.tagName === 'FORM');
  const fields = [...form.querySelectorAll('select'), ...form.querySelectorAll('input')];
  const field = (name) => fields.find((f) => f.getAttribute('aria-label') === name);
  assert.ok(fields.filter((f) => f !== field('Mode')).every((f) => f.disabled));
  let stopped = 0;
  form.emit('keydown', {
    stopPropagation() {
      stopped++;
    },
  });
  form.emit('keyup', {
    stopPropagation() {
      stopped++;
    },
  });
  assert.equal(stopped, 2, 'typing numbers never changes the selected course');
  field('Mode').value = 'CUSTOM';
  field('Mode').emit('change');
  assert.ok(fields.every((f) => !f.disabled));
  field('Rivals').value = '16';
  field('Laps').value = '3';
  field('Checkpoint clock').value = 'off';
  form.emit('submit', { preventDefault() {} });
  const next = new URLSearchParams(location.search);
  assert.equal(next.get('mode'), 'circuit');
  assert.equal(next.get('autostart'), '1');
  assert.deepEqual(readBrowserSessionSettings(next, preset), {
    mode: 'CUSTOM',
    rivalCount: 16,
    lapCount: 3,
    countdown: false,
    vehicleId: 'TESTAROSSA',
  });
  assert.deepEqual(actions, [], 'changed settings are admitted on a fresh load before starting');
  controls.begin();
  const toolbar = panels.find((p) => p.className === 'session-actions');
  assert.equal(form.hidden, true);
  toolbar.children[0].click();
  toolbar.children[0].click();
  assert.deepEqual(actions, ['start', true, false]);
  assert.equal(canvas.focused, true);
  controls.complete();
  assert.equal(toolbar.children[0].hidden, true);
  toolbar.children[1].click();
  assert.equal(new URLSearchParams(location.search).has('autostart'), false);
});
