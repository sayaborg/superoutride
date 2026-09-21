import { mkdir, writeFile } from 'node:fs/promises';
import { options } from '../course/authoring-io.mjs';
import { createBandSceneProbe } from './band-scene-setup.mjs';
import { loadWholePlaneTrialRenderer } from './band-renderer-probe.mjs';
import { courseTrialBands } from './band-ground-prototype.mjs';
import { unpackRgba } from '../../dist/graphics/software-surface.js';

const flags = options(process.argv.slice(2), ['--out']);
if (!flags.has('--out')) throw new RangeError('External evidence directory required');
const directory = flags.get('--out');
await mkdir(directory, { recursive: true });
const placements = [];
const probe = await createBandSceneProbe('linear', 'revised', 0, (section) => {
  const bands = courseTrialBands(section, true),
    length = section.raster.length;
  const boundary = (a, b = a) => ({
    knots: [
      { anchor: { s: 0 }, l: a },
      { anchor: { s: length }, l: b },
    ],
  });
  const origin = (section.outgoing[0]?.source.anchor.s ?? 900) - 20;
  const append = (start, end, left, right, color, flags = {}) =>
    bands.push({ start, end, left, right, color, ...flags });
  // Authored synthetic geometry only, not reference-video pixels or committed generated data.
  for (const distance of [50, 100, 180]) {
    const start = origin + distance;
    if (start + 20 > length) continue;
    append(start, start + 10, boundary(-0.8), boundary(0.8), 32736);
    const sloped = (a, b) => ({
      knots: [
        { anchor: { s: 0 }, l: a },
        { anchor: { s: start + 10 }, l: a },
        { anchor: { s: start + 20 }, l: b },
        { anchor: { s: length }, l: b },
      ],
    });
    append(start + 10, start + 20, sloped(-3.5, 0), sloped(3.5, 0), 32736);
    placements.push({ section: section.id, kind: 'arrow', start, end: start + 20 });
  }
  append(0, length, boundary(0), boundary(-4.2), null, { openLeft: true });
  placements.push({ section: section.id, kind: 'transparent-cliff', right: -4.2 });
  return bands;
});
probe.step();
probe.trial.captureRows(true);
probe.render();
const bytes = Buffer.alloc(probe.target.pixels.length * 3);
for (let i = 0; i < probe.target.pixels.length; i++) {
  const { r, g, b } = unpackRgba(probe.target.pixels[i]);
  bytes[i * 3] = r;
  bytes[i * 3 + 1] = g;
  bytes[i * 3 + 2] = b;
}
await writeFile(`${directory}/arrows-cliff.ppm`, Buffer.concat([Buffer.from('P6\n320 240\n255\n'), bytes]));
await writeFile(
  `${directory}/visual-proof.json`,
  JSON.stringify(
    {
      scope:
        'Actual ordinary renderer with synthetic ordered arrow/cliff Bands; separate from timed four-course controls',
      placements,
      trial: probe.trial.report(),
    },
    null,
    2,
  ),
);
// Retain exact source and modified renderer bodies as disposable reproducibility evidence.
const evidence = await loadWholePlaneTrialRenderer();
await writeFile(`${directory}/renderer-source.js`, evidence.source);
await writeFile(`${directory}/renderer-instrumented.js`, evidence.instrumented);
console.log('Wrote actual whole-plane arrow/cliff scene and instrumentation evidence');
