/** Product targets remain visible even while a measured shortfall is an Open decision. */
export const SCENE_TARGETS = Object.freeze({
  allocationBytesPerFrame: 200000,
  fixedStepMedianMilliseconds: 3,
  frameP95Milliseconds: 10,
});
/** Regression ceiling for the measured P1 implementation, not acceptance of the allocation target. */
export const SCENE_REGRESSION_LIMITS = Object.freeze({ ...SCENE_TARGETS, allocationBytesPerFrame: 650000 });
export function sceneBudgetFailures(report, limits = SCENE_REGRESSION_LIMITS) {
  const failures = [];
  if (report.sampledBytesPerFrame > limits.allocationBytesPerFrame) failures.push('allocation');
  if (report.fixedStepMilliseconds.median > limits.fixedStepMedianMilliseconds) failures.push('fixed step');
  if (report.frameMilliseconds.p95 > limits.frameP95Milliseconds) failures.push('frame p95');
  if (report.gc.slowestFrameGcMilliseconds > (report.frameMilliseconds.max - report.frameMilliseconds.median) / 2)
    failures.push('GC dominates slowest-frame excess');
  return failures;
}
