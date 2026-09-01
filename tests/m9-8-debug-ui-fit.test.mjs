import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('M9.8 debug selectors are device-independent while touch driving controls stay gated', async () => {
  const [index, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  ]);

  for (const group of ['course', 'vehicle', 'camera', 'yaw', 'wash', 'act', 'tire']) {
    assert.match(index, new RegExp(`selector-group selector-group-${group}`));
    assert.match(styles, new RegExp(`\\.selector-group-${group}`));
  }

  assert.match(
    styles,
    /\.mobile-selector-zone\s*\{[^}]*display:\s*grid;[^}]*\}/s,
  );
  assert.doesNotMatch(
    styles,
    /\.mobile-selector-zone\s*\{[^}]*display:\s*none;[^}]*\}/s,
  );
  assert.match(styles, /\.control-zone\s*\{[^}]*display:\s*none;/s);
  assert.match(styles, /\.touch-capable \.control-zone\s*\{[^}]*display:\s*flex;/s);
  assert.doesNotMatch(styles, /\.touch-capable \.mobile-selector-zone\s*\{[^}]*display:/s);

  assert.doesNotMatch(styles, /100dvh\s*-\s*(?:228|409|459)px/);
  assert.match(styles, /#app\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s);
  assert.match(styles, /grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.touch-capable #app\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) 124px;/s);
  assert.match(styles, /#game\s*\{[^}]*width:\s*auto;[^}]*height:\s*100%;[^}]*max-width:\s*100%;[^}]*max-height:\s*100%;/s);
});

test('reference touch viewports have enough selector width for every direct M9.8 choice', () => {
  const gridWidth = (width, columns, gap) => (width - gap * (columns - 1)) / columns;
  const requiredButtonsWidth = (columns, minWidth, gap) => columns * minWidth + gap * (columns - 1);

  const portraitInnerWidth = 390 - 16;
  const portraitColumnWidth = gridWidth(portraitInnerWidth, 2, 14);
  assert.ok(requiredButtonsWidth(4, 32, 4) <= portraitColumnWidth);
  assert.ok(requiredButtonsWidth(9, 32, 4) <= portraitInnerWidth);
  assert.ok(requiredButtonsWidth(6, 32, 4) <= portraitInnerWidth);
  assert.ok(requiredButtonsWidth(3, 32, 4) <= portraitColumnWidth);

  const landscapeInnerWidth = 844 - 12;
  const landscapeColumnWidth = gridWidth(landscapeInnerWidth, 12, 8);
  const spanWidth = (columns) => landscapeColumnWidth * columns + 8 * (columns - 1);
  assert.ok(requiredButtonsWidth(5, 36, 4) <= spanWidth(4));
  assert.ok(requiredButtonsWidth(6, 36, 4) <= spanWidth(5));
  assert.ok(requiredButtonsWidth(4, 36, 4) <= spanWidth(3));
  assert.ok(requiredButtonsWidth(3, 36, 4) <= spanWidth(3));
});
