import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTACT_SCENARIOS } from './tire-contact-scenarios.mjs';

// Paired use: run this SAME script on each build. Kernel quantities are not sound pressure.
const build = resolve(process.argv[2] ?? 'dist');
const load = (name) => import(pathToFileURL(join(build, 'audio', name)).href);
const { ContactMode, TireContactSynthesis } = await load('tire-contact-model.js');
const { CONTACT_ACOUSTICS: settings, CONTACT_TEXTURES: textures } = await load('tire-contact-acoustics.js');
const report = { build, settings, steady: [], interference: [], materials: [] };
for (const rate of [44100, 48000, 96000]) {
  for (const slip of [0.1, 0.25, 0.5, 0.8, 1.2, 3]) {
    const mode = new ContactMode(rate, settings.frictionMode);
    for (let i = 0; i < rate; i++) mode.step(slip, 5);
    const samples = Float64Array.from({ length: rate }, () => mode.step(slip, 5));
    let sum2 = 0;
    const crossings = [];
    for (let i = 0; i < samples.length; i++) {
      sum2 += samples[i] ** 2;
      if (i && samples[i - 1] < 0 && samples[i] >= 0)
        crossings.push((i - samples[i] / (samples[i] - samples[i - 1])) / rate);
    }
    const rms = Math.sqrt(sum2 / samples.length);
    const hz = rms > 1e-6 && crossings.length > 1 ? (crossings.length - 1) / (crossings.at(-1) - crossings[0]) : null;
    const amplitude = (order) => {
      let x = 0,
        y = 0;
      for (let i = 0; i < samples.length; i++) {
        const phase = (order * 2 * Math.PI * hz * i) / rate;
        x += samples[i] * Math.cos(phase);
        y += samples[i] * Math.sin(phase);
      }
      return (2 * Math.hypot(x, y)) / samples.length;
    };
    report.steady.push({
      rate,
      slip,
      load: 5,
      rmsVelocity: rms,
      hz,
      secondToFirst: hz ? amplitude(2) / amplitude(1) : null,
    });
  }
  const scene = CONTACT_SCENARIOS.find((value) => value.id === 'slip-sweep');
  const front = new TireContactSynthesis(rate, settings.frontSeed);
  const rear = new TireContactSynthesis(rate, settings.rearSeed);
  let step = 0;
  const windows = Array.from({ length: scene.seconds }, () => ({ ff: 0, rr: 0, fr: 0 }));
  for (let i = 0; i < rate * scene.seconds; i++) {
    if (step < scene.steps.length && i >= scene.steps[step][0] * rate) {
      front.update(...scene.steps[step][1]);
      rear.update(...scene.steps[step][2]);
      step++;
    }
    front.sample();
    rear.sample();
    const w = windows[Math.floor(i / rate)];
    w.ff += front.frictionOutput ** 2;
    w.rr += rear.frictionOutput ** 2;
    w.fr += front.frictionOutput * rear.frictionOutput;
  }
  report.interference.push({
    rate,
    scene: scene.id,
    windows: windows.map(({ ff, rr, fr }, startSecond) => ({
      startSecond,
      frontRms: Math.sqrt(ff / rate),
      rearRms: Math.sqrt(rr / rate),
      correlation: ff * rr > 1e-16 ? fr / Math.sqrt(ff * rr) : null,
      // Relative to the incoherent power sum, NOT the level of a single axle.
      mixPowerDb: ff + rr > 1e-8 ? 10 * Math.log10(Math.max(Number.MIN_VALUE, (ff + rr + 2 * fr) / (ff + rr))) : null,
    })),
  });
}
// Matched steady road/slip inputs at a fixed pickup gain; no loudness normalization.
for (const texture of Object.keys(textures))
  for (const slip of [0, 0.5]) {
    const rate = 48000;
    const voice = new TireContactSynthesis(rate, settings.frontSeed, texture);
    voice.update(30, slip, 5);
    for (let i = 0; i < rate; i++) voice.sample();
    let road = 0,
      friction = 0,
      peak = 0;
    for (let i = 0; i < rate; i++) {
      const value = voice.sample();
      road += voice.roadOutput ** 2;
      friction += voice.frictionOutput ** 2;
      peak = Math.max(peak, Math.abs(value));
    }
    report.materials.push({
      texture,
      travel: 30,
      slip,
      load: 5,
      rate,
      roadRms: Math.sqrt(road / rate),
      frictionRms: Math.sqrt(friction / rate),
      peak,
    });
  }
console.log(JSON.stringify(report, null, 2));
