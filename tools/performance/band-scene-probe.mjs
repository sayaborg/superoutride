import { Session } from 'node:inspector/promises';
import { PerformanceObserver } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { loadavg, cpus } from 'node:os';
import { options } from '../course/authoring-io.mjs';
import { unpackRgba } from '../../dist/graphics/software-surface.js';
import { createBandSceneProbe } from './band-scene-setup.mjs';
import { summarizeSceneProfile } from './scene-profile.mjs';

const flags = options(process.argv.slice(2), ['--mode', '--variant', '--out']);
const mode = flags.get('--mode');
const variant = flags.get('--variant');
const frames = 300;
const allocationFrames = 30;
const rivals = 16;
const started = performance.now();
const probe = await createBandSceneProbe(mode, variant, rivals);
const setupMilliseconds = performance.now() - started;
for (let i = 0; i < 30; i++) {
  probe.step();
  probe.render();
  probe.afterFrame();
}
const bounds = new Float64Array(frames * 2);
const step = new Float64Array(frames);
const render = new Float64Array(frames);
const actors = [probe.race.player, ...probe.race.rivals];
const state = new Float64Array(frames * actors.length * 15);
const gcEntries = [];
const observer = new PerformanceObserver((list) => gcEntries.push(...list.getEntries()));
observer.observe({ entryTypes: ['gc'] });
const initialLoad = loadavg();
for (let i = 0; i < frames; i++) {
  const begin = performance.now();
  probe.step();
  const afterStep = performance.now();
  probe.render();
  const end = performance.now();
  bounds[i * 2] = begin;
  bounds[i * 2 + 1] = end;
  step[i] = afterStep - begin;
  render[i] = end - afterStep;
  for (let actor = 0; actor < actors.length; actor++) {
    const c = actors[actor];
    const v = c.actor.vehicle;
    const j = (i * actors.length + actor) * 15;
    state[j] = v.x;
    state[j + 1] = v.y;
    state[j + 2] = v.z;
    state[j + 3] = v.yaw;
    state[j + 4] = v.pitch;
    state[j + 5] = v.velocityX;
    state[j + 6] = v.velocityY;
    state[j + 7] = v.velocityZ;
    state[j + 8] = v.course.s;
    state[j + 9] = v.course.l;
    state[j + 10] = v.frontWheelOmega;
    state[j + 11] = v.rearWheelOmega;
    state[j + 12] = v.yawRate;
    state[j + 13] = v.pitchRate;
    state[j + 14] = c.session.history.active.ordinal;
  }
  probe.afterFrame();
}
await new Promise(setImmediate);
await new Promise(setImmediate);
observer.disconnect();
const overlap = (event, start, end) =>
  Math.max(0, Math.min(end, event.startTime + event.duration) - Math.max(start, event.startTime));
const gc = Array.from({ length: frames }, (_, i) =>
  gcEntries.reduce((sum, event) => sum + overlap(event, bounds[i * 2], bounds[i * 2 + 1]), 0),
);
const statistics = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
    max: sorted.at(-1),
  };
};
const inspector = new Session();
inspector.connect();
await inspector.post('HeapProfiler.startSampling', {
  samplingInterval: 16384,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true,
});
for (let i = 0; i < allocationFrames; i++) {
  probe.step();
  probe.render();
  probe.afterFrame();
}
const { profile } = await inspector.post('HeapProfiler.stopSampling');
inspector.disconnect();
const allocation = summarizeSceneProfile(profile, allocationFrames);
probe.trial?.captureRows(true);
probe.render();
const trial = probe.trial?.report() ?? null;
if (flags.has('--out')) {
  const out = flags.get('--out');
  await mkdir(out, { recursive: true });
  // PPM is a disposable, lossless still; no preview image is committed.
  const data = Buffer.alloc(probe.target.pixels.length * 3);
  for (let i = 0; i < probe.target.pixels.length; i++) {
    const { r, g, b } = unpackRgba(probe.target.pixels[i]);
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }
  await writeFile(`${out}/${mode}-${variant}.ppm`, Buffer.concat([Buffer.from('P6\n320 240\n255\n'), data]));
}
const rows = trial?.rows.filter((row) => row.sections > 0) ?? [];
const probes = [50, 100, 200].map((distance) => ({
  requestedDistance: distance,
  actualRow: rows.toSorted((a, b) => Math.abs(a.distance - distance) - Math.abs(b.distance - distance))[0] ?? null,
}));
console.log(
  JSON.stringify({
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cpus: cpus().length,
    initialLoad,
    finalLoad: loadavg(),
    mode,
    variant,
    frames,
    rivals,
    warmupFrames: 30,
    allocationFrames,
    setupMilliseconds,
    step: statistics(step),
    render: statistics(render),
    frame: statistics(Array.from(step, (value, i) => value + render[i])),
    allocation,
    renderBytesPerFrame: allocation.categoriesPerFrame.render ?? 0,
    totalBytesPerFrame: Object.values(allocation.categoriesPerFrame).reduce((a, b) => a + b, 0),
    gc: {
      events: gcEntries.filter((event) => overlap(event, bounds[0], bounds.at(-1)) > 0).length,
      milliseconds: gc.reduce((a, b) => a + b, 0),
      maxFrameMilliseconds: Math.max(...gc),
    },
    stateSha256: createHash('sha256').update(new Uint8Array(state.buffer)).digest('hex'),
    scene: probe.scene.metrics,
    resident: probe.scene.groundMetrics,
    rowProbes: probes,
    trial,
  }),
);
