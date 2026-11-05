import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';

const places = ['../../content/courses/', '../../content/originals/courses/'].map((p) => new URL(p, import.meta.url));

test('every course has a car grid and a bike grid, each with a run of competitors', async () => {
  let courses = 0;
  for (const place of places)
    for (const file of (await readdir(place)).filter((f) => f.endsWith('.course.json'))) {
      const document = JSON.parse(await readFile(new URL(file, place), 'utf8'));
      const starts = document.sections.flatMap((s) => s.gates.filter((g) => g.kind === 'start'));
      assert.equal(starts.length, 1, file);
      const [start] = starts;
      assert.ok(start.grid.length >= RUN_RULE_LIMITS.competitors, `${file}: its car grid`);
      assert.ok(
        start.bikeGrid !== null && start.bikeGrid.length >= RUN_RULE_LIMITS.competitors,
        `${file}: its bike grid`,
      );
      courses++;
    }
  assert.ok(courses > 2);
});
