import assert from 'node:assert/strict';
import test from 'node:test';
import { pathLine, PATH_ROOT } from '../../src/shell/card-rows.ts';

const line = (levels, focus) => pathLine(levels, focus).map((piece) => [piece.part, piece.text]);

test('the path writes the choices above the row and the card in focus in full, joined by >', () => {
  assert.deepEqual(line([PATH_ROOT], 'SERIES'), [
    ['levels', 'SUPER OUTRIDE>'],
    ['focus', 'SERIES'],
  ]);
  assert.deepEqual(line([], 'ALONE'), [['focus', 'ALONE']]);
  // Forty characters fit the grid's row exactly.
  const levels = [PATH_ROOT, 'SERIES', 'ARCADE'];
  assert.equal(line(levels, 'X'.repeat(40 - 'SUPER OUTRIDE>SERIES>ARCADE>'.length)).length, 2);
});

test('a path longer than the row is cut on the left and marked, the card in focus whole', () => {
  const pieces = pathLine([PATH_ROOT, 'SERIES', 'ARCADE TRIBUTE - OUTRUN', 'OUTRUN A'], 'FERRARI TESTAROSSA');
  assert.deepEqual(
    pieces.map((piece) => piece.part),
    ['cut', 'levels', 'focus'],
  );
  const text = pieces.map((piece) => piece.text).join('');
  assert.equal(text.length, 40);
  assert.equal(text, '..E - OUTRUN>OUTRUN A>FERRARI TESTAROSSA');
});
