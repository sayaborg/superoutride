import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('M6.20 validated point-to-point finish records result without freezing the live simulation loop', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(source, /updateRunObjectiveFromValidatedFinish/);
  assert.match(source, /POINT_TO_POINT_OBJECTIVE/);
  assert.match(source, /A validated point-to-point finish records the objective; it does not pause DEV simulation\./);
  assert.doesNotMatch(
    source,
    /if\s*\(runObjective\.status\s*===\s*['"]FINISHED['"]\)\s*\{[\s\S]*?continue;/,
  );
});
