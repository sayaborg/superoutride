import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

/**
 * Raw 8-bit RGB in, RGB out: `PNG.sync.write` reads these from its options, not from the PNG's own, and writes into
 * the options it is given, so each write takes a fresh copy.
 */
const rgbPng = () => ({ colorType: 2, inputColorType: 2, inputHasAlpha: false }) as const;
import { decodeYuv, probeVideo, YUV420_FORMATS, type YuvFrame } from './video.js';
import { splitTwo } from './statistics.js';
import type { TimingKind } from './footage-model.js';

/** The capture values' format: what is true of one video alone ([Capture values](../../docs/footage.md#capture-values)). */
export const CAPTURE_FORMAT = Object.freeze({ format: 'superoutride.footage-capture', version: 1 } as const);

export type ColorRange = 'limited' | 'full';
export type ColorMatrix = 'bt601' | 'bt709';

/** One axis of the game pixel grid in video pixels: the first game pixel's left (or top) edge, the period and count. */
export interface GridAxis {
  readonly origin: number;
  readonly period: number;
  readonly count: number;
  /** The share of the axis's edge energy that lies on the grid's boundaries: near 1 when scaled by nearest pixels. */
  readonly onGrid: number;
}

/**
 * What a person marks in a video's frames: the stretch where the player drives, and the times of the timing events the
 * HUD does not read, seconds on the frames' timestamps.
 */
export interface Drive {
  readonly from: number;
  readonly to: number;
  readonly events: readonly { readonly kind: TimingKind; readonly t: number }[];
}

export interface CaptureValues {
  readonly format: typeof CAPTURE_FORMAT.format;
  readonly version: typeof CAPTURE_FORMAT.version;
  readonly video: { readonly file: string; readonly sha256: string; readonly width: number; readonly height: number };
  readonly grid: { readonly x: GridAxis; readonly y: GridAxis };
  readonly color: {
    readonly range: ColorRange;
    readonly matrix: ColorMatrix;
    /** Each candidate decoding's mean squared distance of uniform game pixels from the RGB555 lattice, in 8-bit levels². */
    readonly latticeError: Readonly<Record<string, number>>;
  };
  readonly frames: {
    readonly count: number;
    readonly duration: number;
    /** The original's update period, seconds: the most frequent spacing of frames that differ from the one before. */
    readonly updatePeriod: number;
  };
  /** The stretch a person marked (`drive`); absent until then, when the whole video counts. */
  readonly drive?: Drive;
}

/** The game frames and their per-frame record, beside the capture values, under `<video directory>`. */
export const FRAMES_DIRECTORY = 'frames';

/**
 * Ingest a video: measure its game pixel grid and color decoding from a sample of frames, then cut every frame into a
 * game-pixel PNG under `directory/frames/`, and write `capture.json` (the capture values) and `frames.json` (each
 * frame's timestamp and whether the original updated it).
 */
export async function ingestVideo(file: string, directory: string): Promise<CaptureValues> {
  const probe = await probeVideo(file);
  const { width, height } = probe;
  const format = YUV420_FORMATS.find((candidate) => candidate === probe.pixelFormat);
  if (!format) throw new RangeError(`${file} is ${probe.pixelFormat}, not 8-bit 4:2:0 footage`);
  const count = probe.times.length;
  // The sample: about 120 frames spread over the video.
  const step = Math.max(1, Math.floor(count / 120));
  const sample: YuvFrame[] = [];
  await decodeYuv(file, width, height, format, (frame) => void sample.push(frame), step);
  const grid = measureGrid(sample, width, height);
  const color = measureColor(sample, width, grid);
  sample.length = 0;

  const frames = path.join(directory, FRAMES_DIRECTORY);
  await mkdir(frames, { recursive: true });
  const decode = yuvToRgb(color.range, color.matrix);
  const gameWidth = grid.x.count,
    gameHeight = grid.y.count;
  const png = new PNG({ width: gameWidth, height: gameHeight, colorType: 2, inputColorType: 2, inputHasAlpha: false });
  let previous: Uint8Array | null = null;
  const differences: number[] = [];
  const writes: Promise<void>[] = [];
  const luma = new Uint8Array(gameWidth * gameHeight);
  await decodeYuv(file, width, height, format, async (frame) => {
    const rgb = gameFrame(frame, width, grid, decode, luma);
    let difference = 0;
    if (previous) for (let i = 0; i < luma.length; i++) difference += Math.abs(luma[i]! - previous[i]!);
    differences.push(previous ? difference / luma.length : Infinity);
    previous = luma.slice();
    png.data = Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength);
    writes.push(
      writeFile(path.join(frames, `${String(frame.index).padStart(6, '0')}.png`), PNG.sync.write(png, rgbPng())),
    );
    if (writes.length >= 64) await Promise.all(writes.splice(0));
  });
  await Promise.all(writes);
  const updated = updatedFrames(differences);
  const updatePeriod = mostFrequentSpacing(probe.times, updated);
  const video = { file: path.basename(file), sha256: await sha256(file), width, height };
  // The stretch a person marked stays while the video is the same one.
  const drive = await readFile(path.join(directory, 'capture.json'), 'utf8').then(
    (text) => {
      const before = JSON.parse(text) as CaptureValues;
      return before.video.sha256 === video.sha256 ? before.drive : undefined;
    },
    () => undefined,
  );
  const capture: CaptureValues = {
    ...CAPTURE_FORMAT,
    video,
    grid,
    color,
    frames: { count, duration: probe.times.at(-1)! - probe.times[0]!, updatePeriod },
    ...(drive && { drive }),
  };
  await writeFile(path.join(directory, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  await writeFile(
    path.join(directory, 'frames.json'),
    JSON.stringify({ times: probe.times, updated: updated.map(Number), differences: differences.map(round3) }),
  );
  return capture;
}

const round3 = (value: number) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null);

async function sha256(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/**
 * The game pixel grid on each axis, from where luma changes. Scaling by nearest pixels puts every change of the game
 * frame on a boundary between game pixels, `origin + k·period`; the period and origin chosen are those that gather the
 * most edge energy beyond what an even spread would put there. The black margins bound the grid: the game frame is the
 * whole number of game pixels between them.
 */
export function measureGrid(sample: readonly YuvFrame[], width: number, height: number) {
  const columnEnergy = new Float64Array(width),
    rowEnergy = new Float64Array(height);
  const columnPeak = new Uint8Array(width),
    rowPeak = new Uint8Array(height);
  for (const { y } of sample) {
    for (let r = 0; r < height; r++) {
      const row = r * width;
      for (let c = 0; c < width; c++) {
        const value = y[row + c]!;
        if (value > columnPeak[c]!) columnPeak[c] = value;
        if (value > rowPeak[r]!) rowPeak[r] = value;
        if (c) columnEnergy[c] = columnEnergy[c]! + Math.abs(value - y[row + c - 1]!);
        if (r) rowEnergy[r] = rowEnergy[r]! + Math.abs(value - y[row - width + c]!);
      }
    }
  }
  return { x: fitAxis(columnEnergy, columnPeak), y: fitAxis(rowEnergy, rowPeak) };
}

/**
 * Margins are black: a margin line's brightest luma over the sampled frames stays below this, limited range's black (16)
 * with the ringing compression leaves beside the game frame's edge. A game frame's own dim lines, such as sky above the
 * HUD, are brighter.
 */
const MARGIN_LUMA = 48;

/**
 * One axis's grid. Margins are the outer lines whose brightest value over the sampled frames is black
 * (`MARGIN_LUMA`); the game frame lies between them. The period is sought from 1.25 to 8 video pixels per game pixel.
 */
function fitAxis(energy: Float64Array, peak: Uint8Array): GridAxis {
  const n = energy.length;
  let first = 0,
    last = n - 1;
  while (first < n && peak[first]! < MARGIN_LUMA) first++;
  while (last > first && peak[last]! < MARGIN_LUMA) last--;
  // Boundaries are at the left edge of each line: energy[c] measures the change between c - 1 and c.
  let best = { period: 1, phase: 0, score: -Infinity, onGrid: 0 };
  let total = 0;
  for (let c = first + 1; c <= last; c++) total += energy[c]!;
  const bins = 128;
  const histogram = new Float64Array(bins);
  for (let period = 1.25; period <= 8; period += 0.0025) {
    histogram.fill(0);
    for (let c = first + 1; c <= last; c++) {
      const phase = (c - first) / period;
      const bin = Math.floor((phase - Math.floor(phase)) * bins) % bins;
      histogram[bin] = histogram[bin]! + energy[c]!;
    }
    // Energy within less than one video pixel of each candidate phase: a window just under bins/period bins, so that
    // no window holds two boundaries a whole pixel apart (as an aliased period's phases are).
    const window = Math.max(1, Math.ceil(bins / period) - 1);
    let sum = 0;
    for (let b = 0; b < window; b++) sum += histogram[b]!;
    for (let b = 0; b < bins; b++) {
      const onGrid = sum / total;
      const score = onGrid - window / bins;
      if (score > best.score) {
        // The phase is where the window's energy lies: its energy-weighted circular mean.
        let x = 0,
          y = 0;
        for (let k = 0; k < window; k++) {
          const angle = (2 * Math.PI * (b + k + 0.5)) / bins;
          x += histogram[(b + k) % bins]! * Math.cos(angle);
          y += histogram[(b + k) % bins]! * Math.sin(angle);
        }
        const mean = (((Math.atan2(y, x) / (2 * Math.PI)) % 1) + 1) % 1;
        best = { period, phase: mean * period, score, onGrid };
      }
      sum += histogram[(b + window) % bins]! - histogram[b]!;
    }
  }
  // Refine origin and period together: the column nearest each boundary (within half a video pixel) is that
  // boundary, and the boundaries' positions are fitted to origin + k·period, weighted by energy.
  let origin = first + (((best.phase % best.period) + best.period) % best.period);
  let period = best.period;
  for (let pass = 0; pass < 3; pass++) {
    let s = 0,
      sk = 0,
      skk = 0,
      sc = 0,
      skc = 0;
    for (let c = first + 1; c <= last; c++) {
      const k = Math.round((c - origin) / period);
      if (Math.abs(c - origin - k * period) >= 0.5) continue;
      const w = energy[c]!;
      s += w;
      sk += w * k;
      skk += w * k * k;
      sc += w * c;
      skc += w * k * c;
    }
    const determinant = s * skk - sk * sk;
    if (!(determinant > 0)) break;
    period = (s * skc - sk * sc) / determinant;
    origin = (sc - period * sk) / s;
  }
  // The first boundary at or after the margin (within half a video pixel), and the whole game pixels before the last line.
  while (origin - period >= first - 0.5) origin -= period;
  while (origin < first - 0.5) origin += period;
  const count = Math.floor((last + 1 - origin) / period + 0.5);
  return { origin: round3(origin)!, period: round3(period)!, count, onGrid: round3(best.onGrid)! };
}

/** A converter from 8-bit Y, U and V to 8-bit RGB under a range and matrix, unclamped. */
export function yuvToRgb(range: ColorRange, matrix: ColorMatrix) {
  const [kr, kb] = matrix === 'bt709' ? [0.2126, 0.0722] : [0.299, 0.114];
  const kg = 1 - kr - kb;
  const yScale = range === 'limited' ? 255 / 219 : 1,
    cScale = range === 'limited' ? 255 / 224 : 1,
    yOffset = range === 'limited' ? 16 : 0;
  return (y: number, u: number, v: number, out: Float64Array | number[]) => {
    const Y = (y - yOffset) * yScale,
      Cb = (u - 128) * cScale,
      Cr = (v - 128) * cScale;
    out[0] = Y + 2 * (1 - kr) * Cr;
    out[1] = Y - ((2 * kb * (1 - kb)) / kg) * Cb - ((2 * kr * (1 - kr)) / kg) * Cr;
    out[2] = Y + 2 * (1 - kb) * Cb;
  };
}

/** The nearest RGB555 level of an 8-bit channel, as an 8-bit value. */
export function latticeLevel(value: number): number {
  return Math.round((Math.round((Math.min(255, Math.max(0, value)) * 31) / 255) * 255) / 31);
}

/**
 * Game pixels as Y, U and V means: Y over each game pixel's interior (its outer video pixels left out once it is wider
 * than two), U and V over the chroma samples whose 2×2 video pixels lie inside it, or the one nearest its centre.
 */
function cellMeans(frame: YuvFrame, width: number, grid: { x: GridAxis; y: GridAxis }) {
  const { x, y } = grid;
  const n = x.count * y.count;
  const Y = new Float64Array(n),
    U = new Float64Array(n),
    V = new Float64Array(n);
  const span = (axis: GridAxis, i: number) => {
    const from = axis.origin + i * axis.period,
      to = from + axis.period;
    const inset = axis.period > 2.5 ? 1 : 0;
    const a = Math.ceil(from - 1e-9) + inset,
      b = Math.floor(to - 1e-9) - inset;
    return b >= a ? [a, b] : [Math.floor((from + to) / 2), Math.floor((from + to) / 2)];
  };
  const chromaSpan = (axis: GridAxis, i: number) => {
    const from = axis.origin + i * axis.period,
      to = from + axis.period;
    const a = Math.ceil(from / 2 - 1e-9),
      b = Math.floor(to / 2 - 1e-9) - 1;
    const centre = Math.floor((from + to) / 4);
    return b >= a ? [a, b] : [centre, centre];
  };
  const cw = width / 2;
  const cols = Array.from({ length: x.count }, (_, i) => span(x, i)),
    rows = Array.from({ length: y.count }, (_, j) => span(y, j));
  const ccols = Array.from({ length: x.count }, (_, i) => chromaSpan(x, i)),
    crows = Array.from({ length: y.count }, (_, j) => chromaSpan(y, j));
  for (let j = 0; j < y.count; j++)
    for (let i = 0; i < x.count; i++) {
      const [x0, x1] = cols[i]!,
        [y0, y1] = rows[j]!;
      let sum = 0,
        k = 0;
      for (let r = y0!; r <= y1!; r++) for (let c = x0!; c <= x1!; c++, k++) sum += frame.y[r * width + c]!;
      const [cx0, cx1] = ccols[i]!,
        [cy0, cy1] = crows[j]!;
      let su = 0,
        sv = 0,
        m = 0;
      for (let r = cy0!; r <= cy1!; r++)
        for (let c = cx0!; c <= cx1!; c++, m++) {
          su += frame.u[r * cw + c]!;
          sv += frame.v[r * cw + c]!;
        }
      const index = j * x.count + i;
      Y[index] = sum / k;
      U[index] = su / m;
      V[index] = sv / m;
    }
  return { Y, U, V };
}

/**
 * The color decoding: of the four ranges and matrices, the one under which game pixels in even areas (whose
 * neighbours share their luma, so chroma has not bled into them) lie nearest the RGB555 lattice.
 */
function measureColor(sample: readonly YuvFrame[], width: number, grid: { x: GridAxis; y: GridAxis }) {
  const candidates = (['limited', 'full'] as const).flatMap((range) =>
    (['bt601', 'bt709'] as const).map((matrix) => ({ range, matrix, decode: yuvToRgb(range, matrix), error: 0, n: 0 })),
  );
  const out = [0, 0, 0];
  const w = grid.x.count,
    h = grid.y.count;
  for (const frame of sample.filter((_, i) => i % 2 === 0)) {
    const { Y, U, V } = cellMeans(frame, width, grid);
    for (let j = 1; j < h - 1; j++)
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        let low = Y[k]!,
          high = Y[k]!;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const value = Y[k + dj * w + di]!;
            if (value < low) low = value;
            if (value > high) high = value;
          }
        if (high - low > 2) continue;
        for (const candidate of candidates) {
          candidate.decode(Y[k]!, U[k]!, V[k]!, out);
          for (const value of out) candidate.error += (value - latticeLevel(value)) ** 2;
          candidate.n += 3;
        }
      }
  }
  const best = candidates.reduce((a, b) => (b.error / b.n < a.error / a.n ? b : a));
  return {
    range: best.range,
    matrix: best.matrix,
    latticeError: Object.fromEntries(
      candidates.map((candidate) => [`${candidate.range} ${candidate.matrix}`, round3(candidate.error / candidate.n)!]),
    ),
  };
}

/** One frame's game pixels as 8-bit RGB under `decode`, and their luma (Y) into `luma`. */
function gameFrame(
  frame: YuvFrame,
  width: number,
  grid: { x: GridAxis; y: GridAxis },
  decode: ReturnType<typeof yuvToRgb>,
  luma: Uint8Array,
) {
  const { Y, U, V } = cellMeans(frame, width, grid);
  const rgb = new Uint8Array(Y.length * 3);
  const out = [0, 0, 0];
  for (let k = 0; k < Y.length; k++) {
    decode(Y[k]!, U[k]!, V[k]!, out);
    rgb[k * 3] = clamp(out[0]!);
    rgb[k * 3 + 1] = clamp(out[1]!);
    rgb[k * 3 + 2] = clamp(out[2]!);
    luma[k] = clamp(Y[k]!);
  }
  return rgb;
}
const clamp = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

/**
 * Which frames the original updated: those whose game pixels changed from the frame before by more than a repeat's
 * compression noise. The log differences are split into two kinds when they are two (repeats and updates); when they
 * are one kind (every frame differs), every frame is an update.
 */
function updatedFrames(differences: readonly number[]): boolean[] {
  const values = differences.filter(Number.isFinite).map((d) => Math.log(d + 1e-3));
  const kinds = splitTwo(values, 1e-6);
  return differences.map((d) => !Number.isFinite(d) || !kinds || Math.log(d + 1e-3) > kinds.threshold);
}

/** The most frequent spacing in seconds between consecutive updated frames. */
function mostFrequentSpacing(times: readonly number[], updated: readonly boolean[]): number {
  const counts = new Map<number, number>();
  let last = -1;
  for (let i = 0; i < updated.length; i++)
    if (updated[i]) {
      if (last >= 0) {
        const key = Math.round((times[i]! - times[last]!) * 1e4);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      last = i;
    }
  let best = 0,
    most = 0;
  for (const [key, count] of counts)
    if (count > most) {
      best = key;
      most = count;
    }
  return best / 1e4;
}
