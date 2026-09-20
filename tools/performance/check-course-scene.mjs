import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { SCENE_TARGETS, sceneBudgetFailures } from './scene-budgets.mjs';

// Run after the parallel functional suite: host budgets require an uncontended process.
const result = JSON.parse(
  execFileSync(process.execPath, ['tools/performance/course-scene.mjs', '--rivals', '16'], { encoding: 'utf8' }),
);
for (const report of result.reports) {
  const summary = {
    mode: report.mode,
    allocationBytesPerFrame: report.sampledBytesPerFrame,
    fixedStepMedianMilliseconds: report.fixedStepMilliseconds.median,
    frameP95Milliseconds: report.frameMilliseconds.p95,
    gc: report.gc,
    remainingTargets: sceneBudgetFailures(report, SCENE_TARGETS),
  };
  console.log(JSON.stringify(summary));
}

for (const report of result.reports)
  assert.deepEqual(sceneBudgetFailures(report), [], `${report.mode}: measured scene regression budget`);
