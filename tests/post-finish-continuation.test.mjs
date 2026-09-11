import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('validated point-to-point finish records result without freezing the live simulation loop', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(source, /updateRunObjectiveFromValidatedFinish/);
  assert.doesNotMatch(source, /POINT_TO_POINT_OBJECTIVE|REPEATABLE_DEV/);
  assert.doesNotMatch(source, /if\s*\(runObjective\.status\s*===\s*['"]FINISHED['"]\)\s*\{[\s\S]*?continue;/);
});
