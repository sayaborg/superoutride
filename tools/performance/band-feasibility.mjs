import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { options } from '../course/authoring-io.mjs';
import { measureBandTransition } from './band-transition-probe.mjs';
import { measureRevisedBandQualification } from './band-revised-qualification.mjs';

const flags = options(process.argv.slice(2), ['--out']);
if (!flags.has('--out')) throw new RangeError('An external output directory is required');
const out = path.resolve(flags.get('--out'));
const probe = fileURLToPath(new URL('./band-scene-probe.mjs', import.meta.url));
const variants = ['resident', 'filtered', 'revised'];
const modes = ['linear', 'seam', 'circuit', 'branch'];
const runs = [];
await mkdir(out, { recursive: true });
// No concurrent children. Fresh processes avoid one variant warming another variant's JIT.
for (let repetition = 0; repetition < 3; repetition++) {
  for (const mode of modes) {
    for (let order = 0; order < variants.length; order++) {
      const variant = variants[(order + repetition) % variants.length];
      const result = spawnSync(
        process.execPath,
        [
          probe,
          '--mode',
          mode,
          '--variant',
          variant,
          '--out',
          `${out}/stills/${repetition + 1}`,
          ...(repetition === 2 && variant === 'revised' ? ['--visuals', 'true'] : []),
        ],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Probe failed: ${result.stderr || result.stdout}`);
      const run = { repetition: repetition + 1, ...JSON.parse(result.stdout) };
      runs.push(run);
      await writeFile(`${out}/${repetition + 1}-${mode}-${variant}.json`, JSON.stringify(run, null, 2));
      console.error(
        `${repetition + 1} ${mode} ${variant}: render ${run.render.median.toFixed(3)} ms, ${Math.round(run.renderBytesPerFrame)} B/frame`,
      );
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
  const first = selected.find((run) => run.variant === 'revised');
  const performanceQualified = [1, 2, 3].every((repetition) => {
    const baseline = selected.find((run) => run.variant === 'resident' && run.repetition === repetition);
    const candidate = selected.find((run) => run.variant === 'revised' && run.repetition === repetition);
    return (
      candidate.render.median <= baseline.render.median &&
      candidate.render.p95 <= baseline.render.p95 &&
      candidate.renderBytesPerFrame <= baseline.renderBytesPerFrame
    );
  });
  return {
    mode,
    stateSha256: first.stateSha256,
    reports,
    performanceQualified,
    nearBudgetQualified: first.trial.sections.every((section) => section.maximumIntervals <= 64),
    farBudgetQualified: first.trial.sections.every((section) =>
      section.far.every((range) => range.levels.every((level) => level.rowLength <= level.structuralMaximum)),
    ),
    representation: {
      residentPayloadBytes: first.resident,
      nearPackedBytes: first.trial.sections.reduce((sum, section) => sum + section.near.packedBytes, 0),
      farPackedBytes: first.trial.sections.reduce(
        (sum, section) => sum + section.far.reduce((n, range) => n + range.packedBytes, 0),
        0,
      ),
      sections: first.trial.sections,
    },
    actualRowProbes: selected
      .filter((run) => run.variant === 'revised')
      .map((run) => ({ repetition: run.repetition, probes: run.rowProbes })),
  };
});
const priorTransition = measureBandTransition();
const transition = measureRevisedBandQualification();
const result = {
  node: process.version,
  sha: process.env.EXPECTED_SHA ?? null,
  repetitions: 3,
  frames: 300,
  rivals: 16,
  scope:
    'Revised entire ground plane replaces the ground primitive; resident and prior filtered inner-strip controls remain unchanged',
  method:
    'Sequential fresh processes, rotated variant order, 30 warmup frames; separate 30-frame V8 sampled allocation pass',
  limits:
    'Host only; physical-hardware exclusivity and phone performance are not certified. Packed files are actual bytes; mutable workspaces and VM metadata are not included.',
  comparisons,
  transition,
  priorTransition,
  qualified:
    comparisons.every((row) => row.performanceQualified && row.nearBudgetQualified && row.farBudgetQualified) &&
    transition.qualified,
  remaining: [
    'general real-content projective transition and motion acceptance beyond the recorded causal cases',
    'K ground-representation decision if any qualification condition fails',
    'K device acceptance',
  ],
};
await writeFile(`${out}/summary.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
