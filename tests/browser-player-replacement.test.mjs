import assert from 'node:assert/strict';
import test from 'node:test';
import { installBrowserDom } from './helpers/browser-dom.mjs';

for (const [root, mode] of [
  ['main-linear', 'linear'],
  ['main', 'branching'],
  ['main-circuit', 'circuit'],
  ['main-circuit', 'fisco'],
]) {
  test(`${mode}: vehicle replacement renders before the next physics tick`, async (t) => {
    const browser = installBrowserDom(t, `?mode=${mode}`);
    await import(`../dist/${root}.js?replacement=${mode}`);
    browser.frame();
    const select = (name) =>
      browser.elements
        .get('vehicle-selector-buttons')
        .children.find((element) => element.textContent === name)
        .emit('click');
    for (const name of ['RC30', 'F110']) {
      select(name);
      // No elapsed simulation time: rendering must use the recovered player's camera.
      browser.frame();
    }
    assert.equal(browser.calls.filter((call) => call[0] === 'putImageData').length, 3);
  });
}
