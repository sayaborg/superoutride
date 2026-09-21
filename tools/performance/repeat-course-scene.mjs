import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { options } from '../course/authoring-io.mjs';

// One benchmark child at a time; every repetition starts a fresh V8 process.
// Keep the ordinary probe's 300 frames, 30-frame warmup, 16 rivals and separate allocation pass.
const flags = options(process.argv.slice(2), ['--out', '--baseline']);
if (!flags.has('--out')) throw new TypeError('Expected --out directory');
const output = path.resolve(flags.get('--out'));
await mkdir(output, { recursive: true });
const variants = [{ name: 'candidate', directory: process.cwd() }];
if (flags.has('--baseline')) variants.unshift({ name: 'before', directory: path.resolve(flags.get('--baseline')) });
const runs = [];
for (let repetition = 0; repetition < 3; repetition++) {
  for (let offset = 0; offset < variants.length; offset++) {
    const variant = variants[(offset + repetition) % variants.length];
    const loadBefore = os.loadavg();
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: variant.directory, encoding: 'utf8' }).trim();
    const result = JSON.parse(
      execFileSync(process.execPath, ['tools/performance/course-scene.mjs', '--rivals', '16', '--frames', '300'], {
        cwd: variant.directory,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
    const run = {
      variant: variant.name,
      repetition: repetition + 1,
      sha,
      loadBefore,
      loadAfter: os.loadavg(),
      ...result,
    };
    await writeFile(path.join(output, `${variant.name}-${repetition + 1}.json`), JSON.stringify(run, null, 2) + '\n');
    runs.push(run);
  }
}
const range = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return { median: sorted[1], min: sorted[0], max: sorted[2] };
};
const summary = {
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0]?.model,
  method:
    'Three sequential fresh-process repetitions; variant order rotates; no benchmark children overlap. Physical-host exclusivity is not certified.',
  reports: variants.flatMap(({ name }) =>
    ['linear', 'seam', 'circuit', 'branch'].map((mode) => {
      const reports = runs.filter((run) => run.variant === name).map((run) => run.reports.find((r) => r.mode === mode));
      return {
        variant: name,
        mode,
        renderMedianMilliseconds: range(reports.map((r) => r.renderMilliseconds.median)),
        renderP95Milliseconds: range(reports.map((r) => r.renderMilliseconds.p95)),
        fixedStepMedianMilliseconds: range(reports.map((r) => r.fixedStepMilliseconds.median)),
        frameP95Milliseconds: range(reports.map((r) => r.frameMilliseconds.p95)),
        allocationBytesPerFrame: range(reports.map((r) => r.sampledBytesPerFrame)),
        renderAllocationBytesPerFrame: range(reports.map((r) => r.allocation.categoriesPerFrame.render ?? 0)),
        gc: reports.map((r) => r.gc),
      };
    }),
  ),
};
await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
