import type { EngineSound } from '../audio/engine-sound.js';
import { deepFreeze } from '../core/admission.js';

/** A point of the diagram, in pixels. */
export type DiagramPoint = readonly [x: number, y: number];

/** Where and at what scale an exhaust diagram stands. */
export interface ExhaustDiagramPlacement {
  /** The x at which the longest primary starts. */
  readonly left: number;
  /** The text row of the first primary; each primary takes a row, each junction's group a row apart. */
  readonly firstRow: number;
  /** Pixels in a text row; a primary runs along its row's middle. */
  readonly rowHeight: number;
  readonly pixelsPerMeter: number;
  /** Pixels between the open ends that leave one junction. */
  readonly outletSpacing: number;
}

/** A level or upright piece of pipe, from `from` to `to`; `junction` is a primary's cylinder-side junction, else null. */
export interface DiagramSegment {
  readonly from: DiagramPoint;
  readonly to: DiagramPoint;
  readonly junction: number | null;
}

/**
 * An exhaust drawn from its engine sound: each primary's cylinder, junction, text row and start (where its cylinder
 * stands); the pipe as level and upright segments, primaries last; the open ends; and each cylinder's paths, every way
 * from its primary's start to an open end.
 */
export interface ExhaustDiagram {
  readonly primaries: readonly {
    readonly cylinder: number;
    readonly junction: number;
    readonly row: number;
    readonly start: DiagramPoint;
  }[];
  readonly segments: readonly DiagramSegment[];
  readonly outlets: readonly DiagramPoint[];
  readonly paths: readonly (readonly (readonly DiagramPoint[])[])[];
}

/**
 * An exhaust's form as its flows stage by stage: the cylinders, the junctions at each depth from them along pipes
 * from `from` to `to`, then the open ends leaving the last; equal neighbours are one stage, and a single stage is
 * written twice (`1-1`).
 */
export function exhaustTopology(sound: EngineSound): string {
  const { primaries, pipes } = sound.exhaust;
  const banks = primaries.map(({ to }) => to);
  const counts = [banks.length];
  let stage = new Set(banks);
  const seen = new Set(stage);
  for (;;) {
    counts.push(stage.size);
    const next = new Set<number>();
    for (const pipe of pipes) if (stage.has(pipe.from) && pipe.to !== null && !seen.has(pipe.to)) next.add(pipe.to);
    if (next.size === 0) {
      counts.push(pipes.filter((pipe) => stage.has(pipe.from) && pipe.to === null).length);
      break;
    }
    next.forEach((junction) => seen.add(junction));
    stage = next;
  }
  const stages = counts.filter((count, i) => i === 0 || count !== counts[i - 1]);
  if (stages.length === 1) stages.push(stages[0]!);
  return stages.join('-');
}

/**
 * The diagram of `sound`'s exhaust, its lengths at `pixelsPerMeter`. The primaries are grouped by junction in
 * junction order, a row apart, one a row in cylinder order. Every cylinder-side junction stands where the longest
 * primary ends, each primary starting its own length before it, at the middle of its primaries' rows. A pipe runs
 * level from its `from` junction, then upright to its `to` junction, which stands at the farthest end of the pipes
 * into it and the mean height of where they come from; a junction is placed once every pipe into it from a placed
 * junction has been, or, in a loop, once any has. Open ends run level for their length, those of one junction
 * `outletSpacing` apart about its height. Junctions the cylinders do not reach along pipes are not drawn.
 */
export function createExhaustDiagram(sound: EngineSound, placement: ExhaustDiagramPlacement): ExhaustDiagram {
  const { primaries: tubes, pipes } = sound.exhaust;
  const banks = tubes.map(({ to }) => to);
  const lengths = tubes.map(({ length }) => length);
  const scale = placement.pixelsPerMeter;
  const end = placement.left + Math.max(...lengths) * scale;
  const groups = [...new Set(banks)].sort((a, b) => a - b);
  const primaries: ExhaustDiagram['primaries'][number][] = [];
  let row = placement.firstRow;
  for (const [g, junction] of groups.entries()) {
    if (g > 0) row++;
    banks.forEach((bank, cylinder) => {
      if (bank !== junction) return;
      const y = row * placement.rowHeight + placement.rowHeight / 2;
      primaries.push({ cylinder, junction, row, start: [Math.round(end - lengths[cylinder]! * scale), y] });
      row++;
    });
  }

  const position = new Map<number, DiagramPoint>();
  for (const junction of groups) {
    const ys = primaries.filter((p) => p.junction === junction).map((p) => p.start[1]);
    position.set(junction, [Math.round(end), (Math.min(...ys) + Math.max(...ys)) / 2]);
  }
  const reached = new Set(groups);
  for (let grown = true; grown;) {
    grown = false;
    for (const pipe of pipes)
      if (reached.has(pipe.from) && pipe.to !== null && !reached.has(pipe.to)) {
        reached.add(pipe.to);
        grown = true;
      }
  }
  const place = (junction: number, feeds: readonly (typeof pipes)[number][]) => {
    const x = Math.max(...feeds.map((pipe) => position.get(pipe.from)![0] + pipe.length * scale));
    const y = feeds.reduce((sum, pipe) => sum + position.get(pipe.from)![1], 0) / feeds.length;
    position.set(junction, [Math.round(x), y]);
  };
  for (;;) {
    const pending = [...reached].filter((junction) => !position.has(junction)).sort((a, b) => a - b);
    if (pending.length === 0) break;
    const feeds = (junction: number) => pipes.filter((pipe) => pipe.to === junction && reached.has(pipe.from));
    const ready = pending.find((junction) => feeds(junction).every((pipe) => position.has(pipe.from)));
    const junction = ready ?? pending.find((j) => feeds(j).some((pipe) => position.has(pipe.from)))!;
    place(
      junction,
      feeds(junction).filter((pipe) => position.has(pipe.from)),
    );
  }

  // Each pipe's points: level from its start, then upright to its end.
  const segments: DiagramSegment[] = [];
  const outlets: DiagramPoint[] = [];
  const runs = new Map<number, DiagramPoint[]>();
  const opened = new Map<number, number>();
  pipes.forEach((pipe, k) => {
    const from = position.get(pipe.from);
    if (!from) return;
    let points: DiagramPoint[];
    if (pipe.to === null) {
      const siblings = pipes.filter((other) => other.from === pipe.from && other.to === null).length;
      const index = opened.get(pipe.from) ?? 0;
      opened.set(pipe.from, index + 1);
      const y = Math.round(from[1] + (index - (siblings - 1) / 2) * placement.outletSpacing);
      const outlet: DiagramPoint = [Math.round(from[0] + pipe.length * scale), y];
      points = [from, [from[0], y], outlet];
      outlets.push(outlet);
    } else {
      const to = position.get(pipe.to)!;
      points = [from, [to[0], from[1]], to];
    }
    runs.set(k, points);
    for (let i = 1; i < points.length; i++) segments.push({ from: points[i - 1]!, to: points[i]!, junction: null });
  });
  const primaryRuns = primaries.map((p) => {
    const junction = position.get(p.junction)!;
    const points: DiagramPoint[] = [p.start, [junction[0], p.start[1]], junction];
    segments.push({ from: points[0]!, to: points[1]!, junction: p.junction });
    segments.push({ from: points[1]!, to: points[2]!, junction: p.junction });
    return points;
  });

  // Every way on from a junction to an open end, never through a junction twice.
  const onward = (junction: number, through: ReadonlySet<number>): DiagramPoint[][] =>
    pipes.flatMap((pipe, k) => {
      if (pipe.from !== junction || !runs.has(k)) return [];
      const points = runs.get(k)!;
      if (pipe.to === null) return [points];
      if (through.has(pipe.to)) return [];
      return onward(pipe.to, new Set([...through, pipe.to])).map((rest) => [...points, ...rest]);
    });
  const paths = banks.map((junction, cylinder) => {
    const head = primaryRuns[primaries.findIndex((p) => p.cylinder === cylinder)]!;
    return onward(junction, new Set([junction])).map((rest) => [...head, ...rest]);
  });
  return deepFreeze({ primaries, segments, outlets, paths });
}

/** The point `distance` along a path of level and upright pieces, or null past its end. */
export function pointAlong(path: readonly DiagramPoint[], distance: number): DiagramPoint | null {
  if (distance < 0) return null;
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1]!;
    const [x1, y1] = path[i]!;
    const length = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    if (left <= length) {
      const t = length === 0 ? 0 : left / length;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    left -= length;
  }
  return null;
}
