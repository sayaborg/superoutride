import path from 'node:path';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { FrameFeatures } from './features.js';

/** One feature's capture noise: how far a video's reading lies from the exact frame's, over the frames compared. */
export interface FeatureNoise {
  /** Readings compared, and those the exact frame has and the video lacks (or the reverse). */
  readonly n: number;
  readonly missing: number;
  /** Mean and variance of the difference, game pixels (or game pixels²). */
  readonly mean: number | null;
  readonly variance: number | null;
}

export const EXACT_DIRECTORY = 'exact';

/** The frames written exactly, by index, under `<video>/exact/`. */
export async function exactIndices(directory: string): Promise<number[]> {
  return (await readdir(path.join(directory, EXACT_DIRECTORY)))
    .filter((name) => name.endsWith('.png'))
    .map((name) => Number(name.slice(0, -4)))
    .sort((a, b) => a - b);
}

/** A features file, line by line: a whole video's features exceed the longest string. */
export async function readFeatures(file: string): Promise<FrameFeatures[]> {
  const features: FrameFeatures[] = [];
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity }))
    if (line) features.push(JSON.parse(line) as FrameFeatures);
  return features;
}

/**
 * The noise level of each feature under one video's capture: the features measured on its frames against the same
 * features on the frames as the original drew them (`exact-features.jsonl`), written to `noise.json`. Rows' roads are
 * paired in order when both see as many; lines pair with the nearest line within 3 game pixels; the speed and the
 * event count as mismatches.
 */
export async function measureNoise(directory: string, videoFeatures = 'features.jsonl') {
  const video = new Map((await readFeatures(path.join(directory, videoFeatures))).map((f) => [f.frame, f]));
  const exact = await readFeatures(path.join(directory, 'exact-features.jsonl'));
  const sums = new Map<string, { n: number; missing: number; sum: number; sum2: number }>();
  const add = (name: string, difference: number | null) => {
    const entry = sums.get(name) ?? { n: 0, missing: 0, sum: 0, sum2: 0 };
    if (difference === null || !Number.isFinite(difference)) entry.missing++;
    else {
      entry.n++;
      entry.sum += difference;
      entry.sum2 += difference * difference;
    }
    sums.set(name, entry);
  };
  const pair = (a: number | null | undefined, b: number | null | undefined) =>
    a === null || a === undefined
      ? b === null || b === undefined
        ? undefined
        : null
      : b === null || b === undefined
        ? null
        : a - b;
  for (const truth of exact) {
    const seen = video.get(truth.frame);
    if (!seen) continue;
    const rows = new Map(seen.rows.map((row) => [row.y, row]));
    for (const row of truth.rows) {
      const other = rows.get(row.y);
      // Each edge the exact frame measures pairs with the video's nearest edge of that side within 3 game pixels.
      for (const side of [0, 1] as const)
        for (const road of row.roads) {
          const x = road[side];
          if (x === null) continue;
          let near: number | null = null;
          for (const candidate of other?.roads ?? []) {
            const y = candidate[side];
            if (y !== null && Math.abs(y - x) < 3 && (near === null || Math.abs(y - x) < Math.abs(near - x))) near = y;
          }
          add('roadEdge', near === null ? null : near - x);
        }
      if (!other) continue;
      for (const [x, width] of row.lines) {
        const near = other.lines.reduce<readonly [number, number] | null>(
          (best, line) =>
            Math.abs(line[0] - x) < 3 && (!best || Math.abs(line[0] - x) < Math.abs(best[0] - x)) ? line : best,
          null,
        );
        add('lineCentre', near ? near[0] - x : null);
        add('lineWidth', near ? near[1] - width : null);
      }
    }
    for (const key of ['roadTop', 'groundTop'] as const) {
      const difference = pair(seen[key], truth[key]);
      if (difference !== undefined) add(key, difference);
    }
    if (Number.isFinite(truth.background[0])) add('backgroundX', seen.background[0] - truth.background[0]);
    if (Number.isFinite(truth.background[1])) add('backgroundY', seen.background[1] - truth.background[1]);
    add('speed', truth.speed === null ? null : seen.speed === truth.speed ? 0 : 1);
    add('event', seen.event === truth.event ? 0 : 1);
    if (truth.player) {
      add('playerBottom', seen.player ? seen.player.bottom - truth.player.bottom : null);
      add(
        'playerWidth',
        seen.player ? seen.player.right - seen.player.left - (truth.player.right - truth.player.left) : null,
      );
    }
  }
  const noise: Record<string, FeatureNoise> = {};
  for (const [name, { n, missing, sum, sum2 }] of sums) {
    const mean = n ? sum / n : NaN;
    noise[name] = { n, missing, mean: round(mean), variance: round(n > 1 ? (sum2 - n * mean * mean) / (n - 1) : NaN) };
  }
  await writeFile(path.join(directory, 'noise.json'), JSON.stringify(noise, null, 2) + '\n');
  return noise;
}

const round = (value: number) => (Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : null);
