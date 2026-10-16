import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { PNG } from 'pngjs';
import type { ColorRole, FootageModel, Readout } from './footage-model.js';
import { COLOR_ROLES } from './footage-model.js';
import { FRAMES_DIRECTORY, type CaptureValues } from './ingest.js';
import { glyphReach, knownColor, meanIsColor, rowSegments, ycc, type Segment } from './runs.js';

/** One role as a bit, so a color holding several roles is their union. */
const ROLE_BIT = Object.fromEntries(COLOR_ROLES.map((role, i) => [role, 1 << i])) as Record<ColorRole, number>;
const ROAD = ROLE_BIT.road,
  LINE = ROLE_BIT.line,
  RUMBLE = ROLE_BIT.rumble,
  MEDIAN = ROLE_BIT.median;
/** A masked pixel: never measured. */
const MASKED = 1 << 15;

/** The HUD templates a person cuts from frames: each digit's and event's ink colors (`a`, `b`, …) over ground (`.`). */
export interface HudTemplates {
  readonly digits: Readonly<Record<string, readonly string[]>>;
  readonly events: Readonly<Record<string, readonly string[]>>;
}

/** One road seen on one row: its edges (null where its neighbour does not show a clean edge) and its road color. */
export type RowRoad = readonly [left: number | null, right: number | null, color: number];

/** One frame's features, in game pixels: what the initial estimate, calibration and the comparison read. */
export interface FrameFeatures {
  readonly frame: number;
  readonly t: number;
  /** Whether the original drew this frame anew (repeats are not tracked). */
  readonly updated: boolean;
  /** The topmost row with road pixels, and the topmost row whose unmasked pixels are mostly ground colors. */
  readonly roadTop: number | null;
  readonly groundTop: number | null;
  /** Per row from `roadTop` down: the roads, each road's lines `[centre, width]` and the medians' widths. */
  readonly rows: readonly {
    readonly y: number;
    readonly roads: readonly RowRoad[];
    readonly lines: readonly (readonly [x: number, width: number])[];
    readonly rumble: readonly (readonly [x: number, width: number, color: number])[];
    readonly medians: readonly (readonly [left: number, right: number])[];
  }[];
  /** The background's shift from the frame before (game pixels; NaN when it cannot be told). */
  readonly background: readonly [dx: number, dy: number];
  /** The HUD's speed readout, km/h (null when unread), and the timing event it shows (null for none). */
  readonly speed: number | null;
  readonly clock: number | null;
  readonly event: string | null;
  /** The player picture's lowest row's bottom edge and its columns at its widest, within the player mask. */
  readonly player: { readonly bottom: number; readonly left: number; readonly right: number } | null;
  /**
   * Things on the ground: 8-connected components of unmasked pixels of no ground color from `groundTop` down, each its
   * bounding columns and rows (`[left, right)`, `[top, bottom)`), its pixel count, and whether it touches the frame's
   * edge, a mask or the ground top (so may be cut off).
   */
  readonly objects: readonly (readonly [
    left: number,
    right: number,
    top: number,
    bottom: number,
    pixels: number,
    cut: 0 | 1,
  ])[];
}

/** Which frames to measure: a directory of game-pixel PNGs under the video's, which of them, and where to write. */
export interface FeatureSource {
  readonly frames: string;
  /** The frame indices to measure, ascending; every frame of the video when absent. */
  readonly indices?: readonly number[];
  readonly out: string;
}

/**
 * Measure frames of an ingested video, every frame by default, and write them, one JSON line per frame, to
 * `features.jsonl` beside its frames. A background shift is measured only against the frame just before.
 */
export async function measureFeatures(
  directory: string,
  model: FootageModel,
  templates: HudTemplates,
  source: FeatureSource = { frames: FRAMES_DIRECTORY, out: 'features.jsonl' },
): Promise<{ frames: number }> {
  const record = JSON.parse(await readFile(path.join(directory, 'frames.json'), 'utf8')) as { times: number[] };
  const indices = source.indices ?? record.times.map((_, index) => index);
  // Contiguous chunks on one worker each, as many as the machine's cores.
  const workers = Math.max(1, Math.min(availableParallelism(), Math.ceil(indices.length / 64)));
  const chunks = Array.from({ length: workers }, (_, w) =>
    indices.slice(Math.floor((w * indices.length) / workers), Math.floor(((w + 1) * indices.length) / workers)),
  );
  const parts = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<string[]>((resolve, reject) => {
          const worker = new Worker(new URL('./features-worker.ts', import.meta.url), {
            workerData: { directory, model, templates, frames: source.frames, indices: chunk } satisfies FeatureJob,
          });
          worker.once('message', resolve);
          worker.once('error', reject);
          worker.once('exit', (code) => code !== 0 && reject(new Error(`Feature worker exited with ${code}`)));
        }),
    ),
  );
  // Line by line: a whole video's features exceed the longest string.
  const out = createWriteStream(path.join(directory, source.out));
  let frames = 0;
  for (const part of parts)
    for (const line of part) {
      if (!out.write(line + '\n')) await once(out, 'drain');
      frames++;
    }
  out.end();
  await finished(out);
  return { frames };
}

/** One worker's frames: which video, model and templates, and which frames of which directory. */
export interface FeatureJob {
  readonly directory: string;
  readonly model: FootageModel;
  readonly templates: HudTemplates;
  readonly frames: string;
  readonly indices: readonly number[];
}

/**
 * Measure one chunk of frames: each frame's features as one JSON line, in order. The frame before the chunk's first,
 * when it was measured too, is read for its luma alone, so the first frame's background shift is measured.
 */
export async function measureFrames({ directory, model, templates, frames, indices }: FeatureJob): Promise<string[]> {
  const capture = JSON.parse(await readFile(path.join(directory, 'capture.json'), 'utf8')) as CaptureValues;
  const record = JSON.parse(await readFile(path.join(directory, 'frames.json'), 'utf8')) as {
    times: number[];
    updated: number[];
  };
  const { width, height } = model.frame;
  if (capture.grid.x.count !== width || capture.grid.y.count !== height)
    throw new RangeError(
      `The video's game frame is ${capture.grid.x.count}×${capture.grid.y.count}, the footage model's ${width}×${height}`,
    );
  const noise = Math.sqrt(capture.color.latticeError[`${capture.color.range} ${capture.color.matrix}`]!);
  const known = model.colors.map(({ rgb555, roles }) =>
    knownColor(
      rgb555,
      roles.reduce((bits, role) => bits | ROLE_BIT[role], 0),
    ),
  );
  const mask = maskOf(model);
  const file = (index: number) => path.join(directory, frames, `${String(index).padStart(6, '0')}.png`);
  const read = async (index: number) => {
    const png = PNG.sync.read(await readFile(file(index)));
    return { ...planes(png, width, height), rgb: png.data, channels: png.data.length / (width * height) };
  };
  // The even-area noise of the decoding, as ingest measured it.
  const noiseModel = { sigma: Math.max(noise, 0.5) };
  // Glyph strokes are edges throughout: their luma rings as far as a pixel of known color may lie and still be likelier
  // that color than none.
  const glyphNoise = glyphReach(noiseModel.sigma) / 3;
  const inks = {
    speed: inkReader(model.hud.speed.ink, glyphNoise),
    clock: model.hud.clock && inkReader(model.hud.clock.ink, glyphNoise),
    events: model.hud.events.map((event) => inkReader(event.ink, glyphNoise)),
  };
  const lines: string[] = [];
  const first = indices[0];
  let previous: { index: number; luma: Float32Array } | null = null;
  if (first !== undefined && first > 0)
    try {
      previous = { index: first - 1, luma: (await read(first - 1)).Y };
    } catch {
      previous = null;
    }
  for (const index of indices) {
    const { Y, Cb, Cr, rgb, channels } = await read(index);
    const roles = new Uint16Array(width * height),
      picture = new Uint8Array(width * height);
    const row = (offset: number) => ({ Y, Cb, Cr, offset, width });
    const segmentRows: Segment[][] = [];
    for (let y = 0; y < height; y++) {
      const offset = y * width;
      const segments = rowSegments(row(offset), known, noiseModel, { road: ROAD, line: LINE });
      // Each pixel's roles are its centre's segment's, the mask's over them.
      let k = 0;
      for (let x = 0; x < width; x++) {
        while (k + 1 < segments.length && segments[k]!.end <= x + 0.5) k++;
        roles[offset + x] = mask[offset + x] ? MASKED : segments[k]!.bits;
      }
      for (const segment of segments) {
        const ground = meanIsColor(segment, row(offset), rgb, channels);
        for (let x = Math.ceil(segment.start - 0.5); x < Math.min(width, Math.ceil(segment.end - 0.5)); x++)
          picture[offset + x] = ground ? 0 : 1;
      }
      segmentRows.push(maskSegments(segments, mask, offset, width));
    }
    const features = frameFeatures(
      index,
      record.times[index]!,
      record.updated[index] === 1,
      roles,
      segmentRows,
      width,
      height,
    );
    const background =
      previous?.index === index - 1
        ? backgroundShift(previous.luma, Y, roles, width, features.groundTop ?? height)
        : ([NaN, NaN] as const);
    previous = { index, luma: Y };
    lines.push(
      JSON.stringify({
        ...features,
        background,
        speed: readReadout(model.hud.speed, templates.digits, Y, width, inks.speed),
        clock: model.hud.clock ? readReadout(model.hud.clock, templates.digits, Y, width, inks.clock!) : null,
        event: readEvent(model, templates, Y, width, inks.events),
        player: playerPicture(model, picture, width),
        objects: groundObjects(roles, picture, width, height, features.groundTop),
      } satisfies FrameFeatures),
    );
  }
  return lines;
}

/**
 * A HUD ink reader: a pixel's ink letter, `a` for the first of `ink`'s colors and so on, or `.` for none, as HUD
 * templates write them: the ink color whose luma is nearest the pixel's, within three deviations of `noise`.
 * Luma keeps the video's full resolution, where chroma bleeds across a glyph's thin strokes.
 */
function inkReader(ink: readonly number[], noise: number) {
  const levels = ink.map((c) => knownColor(c, 0).y);
  const reach = 3 * Math.max(noise, 1);
  return (luma: number) => {
    let best = '.',
      bestDistance = reach;
    levels.forEach((level, i) => {
      const d = Math.abs(level - luma);
      if (d <= bestDistance) [best, bestDistance] = [String.fromCharCode(97 + i), d];
    });
    return best;
  };
}

/** A decoded frame's luma and color difference planes. */
function planes(png: PNG, width: number, height: number) {
  const channels = png.data.length / (width * height);
  const Y = new Float32Array(width * height),
    Cb = new Float32Array(width * height),
    Cr = new Float32Array(width * height);
  for (let k = 0; k < width * height; k++) {
    const [y, cb, cr] = ycc(png.data[k * channels]!, png.data[k * channels + 1]!, png.data[k * channels + 2]!);
    Y[k] = y;
    Cb[k] = cb;
    Cr[k] = cr;
  }
  return { Y, Cb, Cr };
}

/** A row's segments with every masked pixel span made a masked segment of its own. */
function maskSegments(segments: readonly Segment[], mask: Uint8Array, offset: number, width: number): Segment[] {
  const spans: [number, number][] = [];
  for (let x = 0; x < width;) {
    if (!mask[offset + x]) {
      x++;
      continue;
    }
    let end = x;
    while (end < width && mask[offset + end]) end++;
    spans.push([x, end]);
    x = end;
  }
  if (!spans.length) return [...segments];
  const out: Segment[] = [];
  for (const segment of segments) {
    let start = segment.start;
    for (const [a, b] of spans) {
      if (b <= start || a >= segment.end) continue;
      if (a > start) out.push({ ...segment, start, end: a });
      start = Math.max(start, b);
    }
    if (start < segment.end) out.push({ ...segment, start });
  }
  for (const [a, b] of spans) out.push({ start: a, end: b, color: 0, bits: MASKED });
  return out.sort((p, q) => p.start - q.start);
}

function maskOf(model: FootageModel): Uint8Array {
  const { width, height } = model.frame;
  const mask = new Uint8Array(width * height);
  for (const rect of model.masks)
    for (let y = rect.y; y < rect.y + rect.height; y++)
      mask.fill(1, y * width + rect.x, y * width + rect.x + rect.width);
  return mask;
}

/** The ground's features of one frame, from its pixels' roles and colors. */
function frameFeatures(
  frame: number,
  t: number,
  updated: boolean,
  roles: Uint16Array,
  segmentRows: readonly (readonly Segment[])[],
  width: number,
  height: number,
) {
  let roadTop: number | null = null,
    groundTop: number | null = null;
  const rows: FrameFeatures['rows'][number][] = [];
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    let ground = 0,
      unmasked = 0,
      road = 0;
    for (let x = 0; x < width; x++) {
      const bits = roles[offset + x]!;
      if (bits & MASKED) continue;
      unmasked++;
      if (bits) ground++;
      if (bits & ROAD) road++;
    }
    if (groundTop === null && unmasked && ground * 2 > unmasked) groundTop = y;
    if (roadTop === null && road) roadTop = y;
    if (roadTop !== null) rows.push(rowFeatures(y, segmentRows[y]!));
  }
  return { frame, t, updated, roadTop, groundTop, rows };
}

/**
 * One row's segments of one color, read as roads: each road is a run of road and line pixels with road among them,
 * its edge measured only where the run beside it is a clean non-road ground color (not unknown, masked or a color that
 * may also be road or line). Lines are line runs with road on both sides; rumble strips are rumble runs at a road's
 * edge; medians are median runs between two roads.
 */
function rowFeatures(y: number, runs: readonly Segment[]) {
  // A run on the road is a road or line color (a line color may also be a rumble stripe's), or masked: a road continues
  // under a mask, though no edge beside one is measured. A clean neighbour is a ground color that is neither, so an edge
  // beside it is the road's.
  const roadLike = (bits: number) => (bits & MASKED) !== 0 || (bits & (ROAD | LINE)) !== 0;
  const clean = (bits: number) => !(bits & MASKED) && bits !== 0 && (bits & (ROAD | LINE)) === 0;
  // A road's end run measures its edge when it is road, or a line color that is nothing else: a color that may also
  // be a rumble stripe could lie outside the edge.
  const edgeRun = (bits: number) => (bits & ROAD) !== 0 || (bits & ~LINE) === 0;
  const roads: RowRoad[] = [];
  const lines: (readonly [number, number])[] = [];
  const rumble: (readonly [number, number, number])[] = [];
  const medians: (readonly [number, number])[] = [];
  let lastRoadEnd: number | null = null;
  for (let i = 0; i < runs.length;) {
    if (!roadLike(runs[i]!.bits)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < runs.length && roadLike(runs[j + 1]!.bits)) j++;
    const group = runs.slice(i, j + 1);
    if (group.some((run) => run.bits & ROAD)) {
      const before = runs[i - 1],
        after = runs[j + 1];
      const left = before && clean(before.bits) && edgeRun(group[0]!.bits) ? group[0]!.start : null;
      const right = after && clean(after.bits) && edgeRun(group.at(-1)!.bits) ? group.at(-1)!.end : null;
      // The road's color: its road pixels' most common color.
      const counts = new Map<number, number>();
      for (const run of group)
        if (run.bits & ROAD) counts.set(run.color, (counts.get(run.color) ?? 0) + run.end - run.start);
      let color = 0,
        most = 0;
      for (const [c, n] of counts) if (n > most) [color, most] = [c, n];
      roads.push([left, right, color]);
      for (let k = 1; k < group.length - 1; k++) {
        const run = group[k]!;
        if (run.bits & LINE && group[k - 1]!.bits & ROAD && group[k + 1]!.bits & ROAD)
          lines.push([(run.start + run.end) / 2, run.end - run.start]);
      }
      for (const side of [before, after])
        if (side && side.bits & RUMBLE && !(side.bits & (ROAD | LINE)))
          rumble.push([(side.start + side.end) / 2, side.end - side.start, side.color]);
      // A median: only median runs between this road and the one before.
      if (lastRoadEnd !== null && left !== null) {
        const between = runs.filter((run) => run.start >= lastRoadEnd! && run.end <= left);
        if (
          between.length &&
          between.every((run) => run.bits & (MEDIAN | LINE | RUMBLE)) &&
          between.some((run) => run.bits & MEDIAN)
        )
          medians.push([lastRoadEnd, left]);
      }
      lastRoadEnd = right;
    }
    i = j + 1;
  }
  return { y, roads, lines, rumble, medians };
}

/**
 * The background's shift between two frames over the rows above the ground: horizontal by the column profile of luma
 * changes, vertical by the row profile, each the integer lag of the largest cross-correlation refined by a parabola
 * through its neighbours. Masked and ground pixels are left out.
 */
function backgroundShift(
  before: Float32Array,
  after: Float32Array,
  roles: Uint16Array,
  width: number,
  groundTop: number,
): readonly [number, number] {
  const top = 0,
    bottom = Math.max(0, groundTop - 2);
  if (bottom - top < 8) return [NaN, NaN];
  const columns = (luma: Float32Array) => {
    const profile = new Float32Array(width);
    for (let y = top; y < bottom; y++)
      for (let x = 1; x < width; x++) {
        const k = y * width + x;
        if (roles[k]! & MASKED || roles[k - 1]! & MASKED) continue;
        profile[x] = profile[x]! + luma[k]! - luma[k - 1]!;
      }
    return profile;
  };
  const rows = (luma: Float32Array) => {
    const profile = new Float32Array(bottom - top);
    for (let y = top + 1; y < bottom; y++)
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        if (roles[k]! & MASKED || roles[k - width]! & MASKED) continue;
        profile[y - top] = profile[y - top]! + luma[k]! - luma[k - width]!;
      }
    return profile;
  };
  return [lag(columns(before), columns(after), 40), lag(rows(before), rows(after), 20)];
}

/** The shift `after` is from `before` (positive: moved toward higher indices), within ±`reach`, to a fraction. */
function lag(before: Float32Array, after: Float32Array, reach: number): number {
  const n = before.length;
  const score = (shift: number) => {
    let sum = 0;
    for (let i = Math.max(0, shift); i < Math.min(n, n + shift); i++) sum += after[i]! * before[i - shift]!;
    return sum / (n - Math.abs(shift));
  };
  let best = 0,
    bestScore = -Infinity;
  const scores = new Map<number, number>();
  for (let shift = -reach; shift <= reach; shift++) {
    const s = score(shift);
    scores.set(shift, s);
    if (s > bestScore) [best, bestScore] = [shift, s];
  }
  if (!(bestScore > 0)) return NaN;
  const a = scores.get(best - 1),
    c = scores.get(best + 1);
  if (a === undefined || c === undefined) return best;
  const denominator = a - 2 * bestScore + c;
  return denominator < 0 ? best + (0.5 * (a - c)) / denominator : best;
}

/** A readout's number: each cell matched to the template nearest its ink; null if any cell is no digit or blank. */
function readReadout(
  readout: Readout,
  digits: HudTemplates['digits'],
  luma: Float32Array,
  width: number,
  ink: (luma: number) => string,
): number | null {
  let text = '';
  for (let i = 0; i < readout.count; i++) {
    const x = readout.x + i * readout.advance;
    let best = '',
      bestDistance = Infinity;
    for (const [glyph, rows] of Object.entries(digits)) {
      let distance = 0;
      for (let r = 0; r < readout.height; r++)
        for (let c = 0; c < readout.width; c++)
          if (rows[r]![c] !== ink(luma[(readout.y + r) * width + x + c]!)) distance++;
      if (distance < bestDistance) [best, bestDistance] = [glyph, distance];
    }
    text += best;
  }
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * The event a frame shows: of the events whose template's every ink color is read at more than half of its pixels (a
 * misread is the exception, while the scene behind, a white sign or a dark hill, matches one ink at most), the one
 * whose ink is read at the most pixels, or none.
 */
function readEvent(
  model: FootageModel,
  templates: HudTemplates,
  luma: Float32Array,
  width: number,
  inks: readonly ((luma: number) => string)[],
): string | null {
  let best: string | null = null,
    bestMatched = 0;
  for (const [index, event] of model.hud.events.entries()) {
    const rows = templates.events[event.name];
    if (!rows) throw new RangeError(`No template for the event ${event.name}`);
    const ink = inks[index]!;
    const counts = new Map<string, { pixels: number; matched: number }>();
    for (let r = 0; r < event.height; r++)
      for (let c = 0; c < event.width; c++) {
        const expected = rows[r]![c]!;
        if (expected === '.') continue;
        const count = counts.get(expected) ?? { pixels: 0, matched: 0 };
        count.pixels++;
        if (ink(luma[(event.y + r) * width + event.x + c]!) === expected) count.matched++;
        counts.set(expected, count);
      }
    let matched = 0,
      shown = counts.size > 0;
    for (const count of counts.values()) {
      shown &&= 2 * count.matched > count.pixels;
      matched += count.matched;
    }
    if (shown && matched > bestMatched) [best, bestMatched] = [event.name, matched];
  }
  return best;
}

/**
 * The player picture inside the player mask: the largest 8-connected component of its pixels of no ground color
 * (shadows are ground's; strays such as a row the frame's edge bleeds into stand apart), found by its lowest row's
 * bottom edge and its leftmost and rightmost columns.
 */
function playerPicture(model: FootageModel, picture: Uint8Array, width: number): FrameFeatures['player'] {
  const mask = model.masks.find((m) => m.kind === 'player');
  if (!mask) return null;
  const inside = (x: number, y: number) =>
    x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height && picture[y * width + x] === 1;
  const seen = new Uint8Array(mask.width * mask.height);
  let best: { pixels: number; bottom: number; left: number; right: number } | null = null;
  const stack: number[] = [];
  for (let y = mask.y; y < mask.y + mask.height; y++)
    for (let x = mask.x; x < mask.x + mask.width; x++) {
      const local = (y - mask.y) * mask.width + (x - mask.x);
      if (seen[local] || !inside(x, y)) continue;
      const component = { pixels: 0, bottom: -1, left: Infinity, right: -Infinity };
      seen[local] = 1;
      stack.push(x, y);
      while (stack.length) {
        const cy = stack.pop()!,
          cx = stack.pop()!;
        component.pixels++;
        component.bottom = Math.max(component.bottom, cy + 1);
        component.left = Math.min(component.left, cx);
        component.right = Math.max(component.right, cx + 1);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx,
              ny = cy + dy;
            if (!inside(nx, ny)) continue;
            const n = (ny - mask.y) * mask.width + (nx - mask.x);
            if (seen[n]) continue;
            seen[n] = 1;
            stack.push(nx, ny);
          }
      }
      if (!best || component.pixels > best.pixels) best = component;
    }
  return best && { bottom: best.bottom, left: best.left, right: best.right };
}

/**
 * The connected components of unmasked pixels of no ground color below the ground top, by a stack fill. A component
 * touching the frame's edge, a masked pixel or the ground top is marked cut: part of it may be hidden.
 */
function groundObjects(
  roles: Uint16Array,
  picture: Uint8Array,
  width: number,
  height: number,
  groundTop: number | null,
) {
  const objects: [number, number, number, number, number, 0 | 1][] = [];
  if (groundTop === null) return objects;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let start = groundTop * width; start < width * height; start++) {
    if (seen[start] || roles[start]! & MASKED || !picture[start]) continue;
    let left = width,
      right = 0,
      top = height,
      bottom = 0,
      pixels = 0,
      cut: 0 | 1 = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % width,
        y = (k - x) / width;
      pixels++;
      if (x < left) left = x;
      if (x + 1 > right) right = x + 1;
      if (y < top) top = y;
      if (y + 1 > bottom) bottom = y + 1;
      if (x === 0 || x === width - 1 || y === height - 1 || y === groundTop) cut = 1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || nx >= width || ny < groundTop || ny >= height) continue;
          const n = ny * width + nx;
          if (roles[n]! & MASKED) cut = 1;
          else if (!seen[n] && picture[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
    }
    objects.push([left, right, top, bottom, pixels, cut]);
  }
  return objects;
}
