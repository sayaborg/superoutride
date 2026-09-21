import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { options } from '../course/authoring-io.mjs';
import { measureBandTransition } from './band-transition-probe.mjs';

const flags = options(process.argv.slice(2), ['--out']);
if (!flags.has('--out')) throw new RangeError('An external output directory is required');
const out = path.resolve(flags.get('--out'));
const probe = fileURLToPath(new URL('./band-scene-probe.mjs', import.meta.url));
const variants = ['resident', 'direct', 'filtered'];
const modes = ['linear', 'seam', 'circuit', 'branch'];
const runs = [];
await mkdir(out, { recursive: true });
// No concurrent children. Fresh processes avoid one variant warming another variant's JIT.
for (let repetition = 0; repetition < 3; repetition++) {
  for (const mode of modes) {
    for (let order = 0; order < variants.length; order++) {
      const variant = variants[(order + repetition) % variants.length];
      const result = spawnSync(process.execPath, [
        probe, '--mode', mode, '--variant', variant, '--out', `${out}/stills/${repetition + 1}`,
      ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Probe failed: ${result.stderr || result.stdout}`);
      const run = { repetition: repetition + 1, ...JSON.parse(result.stdout) };
      runs.push(run);
      await writeFile(`${out}/${repetition + 1}-${mode}-${variant}.json`, JSON.stringify(run, null, 2));
      console.error(`${repetition + 1} ${mode} ${variant}: render ${run.render.median.toFixed(3)} ms, ${Math.round(run.renderBytesPerFrame)} B/frame`);
    }
  }
}
function summary(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return { median: sorted[1], min: sorted[0], max: sorted.at(-1), values };
}
const comparisons = modes.map((mode) => {
  const selected = runs.filter((run) => run.mode === mode);
  assert.equal(new Set(selected.map((run) => run.stateSha256)).size, 1, `${mode}: physical traces changed`);
  const reports = variants.map((variant) => {
    const group = selected.filter((run) => run.variant === variant);
    return {
      variant,
      renderMedianMilliseconds: summary(group.map((run) => run.render.median)),
      renderP95Milliseconds: summary(group.map((run) => run.render.p95)),
      renderBytesPerFrame: summary(group.map((run) => run.renderBytesPerFrame)),
      fixedStepMedianMilliseconds: summary(group.map((run) => run.step.median)),
      frameP95Milliseconds: summary(group.map((run) => run.frame.p95)),
      totalBytesPerFrame: summary(group.map((run) => run.totalBytesPerFrame)),
      gc: group.map((run) => run.gc),
    };
  });
  const first = selected.find((run) => run.variant === 'filtered');
  const performanceQualified = [1, 2, 3].every((repetition) => {
    const baseline = selected.find((run) => run.variant === 'resident' && run.repetition === repetition);
    const candidate = selected.find((run) => run.variant === 'filtered' && run.repetition === repetition);
    return candidate.render.median <= baseline.render.median &&
      candidate.render.p95 <= baseline.render.p95 &&
      candidate.renderBytesPerFrame <= baseline.renderBytesPerFrame;
  });
  return {
    mode,
    stateSha256: first.stateSha256,
    reports,
    performanceQualified,
    intervalBudgetQualified: first.trial.maximumIntervals <= 32,
    activeBudgetQualified: first.trial.sections.every((section) => section.maximumActive <= 64),
    representation: {
      dictionaryJsonBytes: first.trial.dictionaryBytes,
      directoryUint32Bytes: first.trial.directoryBytes,
      maximumIntervals: first.trial.maximumIntervals,
      sections: first.trial.sections,
    },
    actualRowProbes: first.rowProbes,
  };
});
const transition = measureBandTransition();
const result = {
  node: process.version,
  sha: process.env.EXPECTED_SHA ?? null,
  repetitions: 3,
  frames: 300,
  rivals: 16,
  scope: 'Offline inner-strip substitution in the unchanged product renderer; outside GroundBase is retained',
  method: 'Sequential fresh processes, rotated variant order, 30 warmup frames; separate 30-frame V8 sampled allocation pass',
  limits: 'Host only; shared hardware contention and phone performance are not certified. Dictionary JSON is not packed residency.',
  comparisons,
  transition,
  qualified: comparisons.every((row) => row.performanceQualified && row.intervalBudgetQualified && row.activeBudgetQualified) && transition.qualified,
  remaining: ['whole-plane renderer/open-side integration', 'real-content transition and motion review', 'arrow/cliff product-scene stills', 'K device acceptance'],
};
await writeFile(`${out}/summary.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
