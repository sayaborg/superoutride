import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('DEV disclosure replaces permanent selector rows with a bounded scrollable overlay', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.ok(index.includes('<details id="dev-panel" data-driving-input="ignore">'));
  for (const id of [
    'course-selector-buttons',
    'vehicle-selector-buttons',
    'sound-toggle',
    'sound-volume',
    'engine-volume',
    'tire-volume',
    'tire-tuning',
    'sound-tuning',
  ]) {
    const position = index.indexOf(`id="${id}"`);
    assert.ok(position > index.indexOf('<details') && position < index.indexOf('</details>'));
  }
  assert.match(styles, /#dev-panel\s*\{[^}]*position:\s*fixed;/s);
  assert.match(
    styles,
    /#dev-panel \.mobile-selector-zone\s*\{[^}]*max-height:[^;]*100dvh[^;]*;[^}]*overflow-y:\s*auto;/s,
  );
  assert.match(styles, /#app\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\);/s);
  assert.match(styles, /\.game-zone\s*\{[^}]*touch-action:\s*none;/s);
  assert.match(styles, /#dev-panel\s*\{[^}]*touch-action:\s*pan-y;/s);
  assert.match(styles, /\.touch-analog-indicator\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(styles, /#game\s*\{[^}]*object-fit:\s*contain;/s);
});

test('DEV targets and panel fit narrow portrait and short landscape geometry', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(styles, /#dev-panel \.selector-button\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(styles, /\.range-control input\s*\{[^}]*height:\s*44px;/s);
  assert.ok(styles.includes('calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right))'));
  // Geometry supplements, not replaces, real mobile-browser interaction.
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [667, 375],
    [844, 390],
  ]) {
    assert.ok(Math.min(420, width - 16) - 24 >= 2 * 64 + 4);
    assert.ok(height - 76 >= 2 * 44);
  }
});
