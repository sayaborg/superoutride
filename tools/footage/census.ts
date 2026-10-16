import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { FRAMES_DIRECTORY, type CaptureValues } from './ingest.js';

/**
 * The color census a person assigns roles from: the RGB555 colors an ingested video's frames are drawn in, over every
 * `step`th frame, each with its share of the pixels. A decoded pixel goes to its nearest lattice color; a lattice color
 * within three noise deviations of a more frequent one is that one's noise and joins it. What remains is a color of its
 * own when BIC prefers it to the scatter of every other pixel: its pixels explain themselves better than an even spread
 * over the lattice does, by more than its parameter's cost.
 */
export async function colorCensus(directory: string, step: number) {
  const capture = JSON.parse(await readFile(path.join(directory, 'capture.json'), 'utf8')) as CaptureValues;
  const record = JSON.parse(await readFile(path.join(directory, 'frames.json'), 'utf8')) as { times: number[] };
  const noise = Math.sqrt(capture.color.latticeError[`${capture.color.range} ${capture.color.matrix}`]!);
  const counts = new Float64Array(32768);
  const snap = (v: number) => Math.min(31, Math.max(0, Math.round((v * 31) / 255)));
  let n = 0;
  for (let index = 0; index < record.times.length; index += step) {
    const png = PNG.sync.read(
      await readFile(path.join(directory, FRAMES_DIRECTORY, `${String(index).padStart(6, '0')}.png`)),
    );
    const channels = png.data.length / (png.width * png.height);
    for (let k = 0; k < png.width * png.height; k++) {
      const value =
        (snap(png.data[k * channels]!) << 10) |
        (snap(png.data[k * channels + 1]!) << 5) |
        snap(png.data[k * channels + 2]!);
      counts[value] = counts[value]! + 1;
      n++;
    }
  }
  const reach2 = 3 * (3 * Math.max(noise, 1)) ** 2;
  const rgb = (value: number) => [(value >> 10) & 31, (value >> 5) & 31, value & 31].map((v) => (v * 255) / 31);
  const order = Array.from({ length: 32768 }, (_, value) => value)
    .filter((value) => counts[value]! > 0)
    .sort((a, b) => counts[b]! - counts[a]!);
  const centres: { rgb555: number; count: number }[] = [];
  for (const value of order) {
    const [r, g, b] = rgb(value);
    const near = centres.find((centre) => {
      const [cr, cg, cb] = rgb(centre.rgb555);
      return (cr! - r!) ** 2 + (cg! - g!) ** 2 + (cb! - b!) ** 2 <= reach2;
    });
    if (near) near.count += counts[value]!;
    else centres.push({ rgb555: value, count: counts[value]! });
  }
  // BIC: a color of its own against the even scatter of the pixels no kept color explains.
  centres.sort((a, b) => b.count - a.count);
  let kept = centres.length;
  for (let k = 1; k <= centres.length; k++) {
    const rest = centres.slice(k).reduce((sum, centre) => sum + centre.count, 0);
    const candidate = centres[k - 1]!;
    const scatter = (rest + candidate.count) / n / 32768;
    const gain = 2 * candidate.count * Math.log(candidate.count / n / scatter);
    if (gain <= Math.log(n)) {
      kept = k - 1;
      break;
    }
  }
  const colors = centres.slice(0, kept).map((centre) => ({
    rgb555: centre.rgb555,
    hex: rgb(centre.rgb555)
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join(''),
    share: Math.round((centre.count / n) * 1e6) / 1e6,
  }));
  await writeFile(
    path.join(directory, 'colors.json'),
    JSON.stringify({ frames: Math.ceil(record.times.length / step), colors }, null, 2) + '\n',
  );
  return colors;
}
