import type { EngineSound } from '../audio/engine-sound.js';
import { deepFreeze } from '../core/admission.js';

/** A point of the diagram, in pixels. */
export type DiagramPoint = readonly [x: number, y: number];

/** Where and at what scales an exhaust diagram stands. */
export interface ExhaustDiagramPlacement {
  /** The x of the leftmost valve. */
  readonly left: number;
  /** The text row of the first primary; each primary takes a row. */
  readonly firstRow: number;
  /** Pixels in a text row; a primary runs along its row's middle. */
  readonly rowHeight: number;
  /** Pixels along a tube per metre of its length. */
  readonly pixelsPerMeter: number;
  /** Pixels across a tube per metre of its diameter. */
  readonly pixelsAcrossPerMeter: number;
  /** Pixels left clear between tubes laid side by side where a junction splits. */
  readonly gap: number;
}

/** A rectangle of pixels, inclusive. */
export type DiagramBox = readonly [left: number, top: number, right: number, bottom: number];

/**
 * A tube drawn as level and upright pieces through `points`, `thickness` pixels across: a primary, starting at its
 * valve, with its collector (`exhaustCollectors`), or a pipe with its index, ending at an open end when `open`. Its
 * other ends join a junction's bar.
 */
export type DiagramTube = {
  readonly points: readonly DiagramPoint[];
  readonly thickness: number;
} & (
  | { readonly kind: 'primary'; readonly collector: number }
  | { readonly kind: 'pipe'; readonly pipe: number; readonly open: boolean }
);

/**
 * A junction drawn as one bar: as wide as its thickest tube, centred on its x, and as tall as every tube's cross-section
 * where it reaches the junction. A collector's bar, where two or more primaries enter, has its collector; others null.
 */
export interface DiagramBar {
  readonly box: DiagramBox;
  readonly collector: number | null;
}

/**
 * An exhaust drawn from its engine sound: each primary's cylinder, junction, text row and valve (where its cylinder
 * stands); the tubes, pipes first and primaries last; and the junctions' bars, collectors' last.
 */
export interface ExhaustDiagram {
  readonly primaries: readonly {
    readonly cylinder: number;
    readonly collector: number;
    readonly row: number;
    readonly valve: DiagramPoint;
  }[];
  readonly tubes: readonly DiagramTube[];
  readonly bars: readonly DiagramBar[];
}

/** A tube's thickness in pixels: its diameter at the placement's scale, at least one pixel. */
export function tubeThickness(diameter: number, pixelsAcrossPerMeter: number): number {
  return Math.max(1, Math.round(diameter * pixelsAcrossPerMeter));
}

/**
 * The pixels a cross-section `thickness` across spans about its centre line: `low` above or left and `high` below or
 * right.
 */
export function crossSection(thickness: number): { readonly low: number; readonly high: number } {
  const low = Math.floor((thickness - 1) / 2);
  return { low, high: thickness - 1 - low };
}

/**
 * Each junction's position along the exhaust in metres, every tube level and true to its length: along a spanning
 * forest of the junctions joined by pipes, `to` stands `length` after `from`; each group the cylinders reach then shifts
 * so that its leftmost valve, junction or open end stands at 0. Junctions the cylinders do not reach are absent. Returns
 * the positions and the farthest open end.
 */
function exhaustPositions(sound: EngineSound): { readonly at: ReadonlyMap<number, number>; readonly extent: number } {
  const { primaries, pipes } = sound.exhaust;
  const at = new Map<number, number>();
  let extent = 0;
  for (const seed of primaries.map(({ to }) => to)) {
    if (at.has(seed)) continue;
    // One group: its junctions placed from the seed along pipes either way, a loop's closing pipe left as it falls.
    const group = new Map<number, number>([[seed, 0]]);
    for (const queue = [seed]; queue.length;) {
      const junction = queue.shift()!;
      for (const { from, to, length } of pipes) {
        if (to === null) continue;
        const next = from === junction ? to : to === junction ? from : null;
        if (next === null || group.has(next)) continue;
        group.set(next, group.get(junction)! + (from === junction ? length : -length));
        queue.push(next);
      }
    }
    const ends = [...group].flatMap(([junction, x]) => [
      x,
      ...primaries.filter(({ to }) => to === junction).map(({ length }) => x - length),
      ...pipes.filter((pipe) => pipe.from === junction && pipe.to === null).map(({ length }) => x + length),
    ]);
    const shift = Math.min(...ends);
    for (const [junction, x] of group) at.set(junction, x - shift);
    extent = Math.max(extent, Math.max(...ends) - shift);
  }
  return { at, extent };
}

/** How far the exhaust reaches from its leftmost valve to its farthest open end, in metres. */
export function exhaustExtent(sound: EngineSound): number {
  return exhaustPositions(sound).extent;
}

/**
 * Each junction a primary enters, by its collector: such junctions joined by a pipe that is all its `from` junction's
 * outflow are one collector, a log manifold's run of ports. Collectors are numbered from 0 in the order of their lowest
 * junction.
 */
export function exhaustCollectors(sound: EngineSound): ReadonlyMap<number, number> {
  const { primaries, pipes } = sound.exhaust;
  const entered = [...new Set(primaries.map(({ to }) => to))].sort((a, b) => a - b);
  const root = new Map(entered.map((junction) => [junction, junction]));
  const find = (junction: number): number => (root.get(junction) === junction ? junction : find(root.get(junction)!));
  for (const { from, to } of pipes)
    if (to !== null && root.has(from) && root.has(to) && pipes.filter((pipe) => pipe.from === from).length === 1) {
      const [low, high] = [find(from), find(to)].sort((a, b) => a - b);
      root.set(high!, low!);
    }
  const numbers = new Map<number, number>();
  for (const junction of entered) if (find(junction) === junction) numbers.set(junction, numbers.size);
  return new Map(entered.map((junction) => [junction, numbers.get(find(junction))!]));
}

/**
 * An exhaust's form as its flows stage by stage: the cylinders, their collectors (`exhaustCollectors`), the junctions at
 * each depth from them along pipes from `from` to `to`, then the open ends leaving the last; equal neighbours are one
 * stage, and a single stage is written twice (`1-1`).
 */
export function exhaustTopology(sound: EngineSound): string {
  const { primaries, pipes } = sound.exhaust;
  const collectors = exhaustCollectors(sound);
  const counts = [primaries.length, new Set(collectors.values()).size];
  let stage: ReadonlySet<number> = new Set(collectors.keys());
  const seen = new Set(stage);
  for (;;) {
    const next = new Set<number>();
    for (const pipe of pipes) if (stage.has(pipe.from) && pipe.to !== null && !seen.has(pipe.to)) next.add(pipe.to);
    if (next.size === 0) {
      counts.push(pipes.filter((pipe) => stage.has(pipe.from) && pipe.to === null).length);
      break;
    }
    next.forEach((junction) => seen.add(junction));
    counts.push(next.size);
    stage = next;
  }
  const stages = counts.filter((count, i) => i === 0 || count !== counts[i - 1]);
  if (stages.length === 1) stages.push(stages[0]!);
  return stages.join('-');
}

/**
 * The diagram of `sound`'s exhaust. Every tube runs level for its own length at `pixelsPerMeter` (junction positions
 * from `exhaustPositions`, its leftmost valve at `left`), across its diameter at `pixelsAcrossPerMeter`. Primaries take a
 * row each from `firstRow`, in the order their junctions are reached going upstream from each last junction (pipes into
 * a junction before its own primaries), so merges and a log manifold's ports stand together. A junction stands at the
 * mean height of its primaries, or else of the junctions whose pipes enter it; the pipes leaving a junction for its own
 * downstream junctions (each entered by that pipe alone) and its open ends stand side by side about its height, each
 * as wide as what it carries, `gap` apart; any other pipe runs at its `from` junction's height. Each junction's bar
 * joins the tubes reaching it at their heights and carries no length. Junctions the cylinders do not reach are not
 * drawn.
 */
export function createExhaustDiagram(sound: EngineSound, placement: ExhaustDiagramPlacement): ExhaustDiagram {
  const { primaries, pipes } = sound.exhaust;
  const { pixelsPerMeter: scale, gap } = placement;
  const { at } = exhaustPositions(sound);
  const thickness = (diameter: number) => tubeThickness(diameter, placement.pixelsAcrossPerMeter);
  const x = (junction: number) => Math.round(placement.left + at.get(junction)! * scale);

  // Rows: going upstream from each last junction, pipes into a junction first, then its own primaries.
  const order: number[] = [];
  const visited = new Set<number>();
  const upstream = (junction: number): void => {
    if (visited.has(junction)) return;
    visited.add(junction);
    for (const pipe of pipes) if (pipe.to === junction && at.has(pipe.from)) upstream(pipe.from);
    primaries.forEach(({ to }, cylinder) => to === junction && order.push(cylinder));
  };
  const last = [...at.keys()].filter((junction) => !pipes.some((pipe) => pipe.from === junction && pipe.to !== null));
  for (const junction of last.sort((a, b) => a - b)) upstream(junction);
  for (const junction of [...at.keys()].sort((a, b) => a - b)) upstream(junction);
  const rowOf = new Map(order.map((cylinder, index) => [cylinder, placement.firstRow + index]));
  const middle = (row: number) => row * placement.rowHeight + placement.rowHeight / 2;

  // What a junction's own downstream branch needs across: its spread pipes and open ends side by side.
  const spread = (junction: number) =>
    pipes
      .map((pipe, index) => ({ pipe, index }))
      .filter(
        ({ pipe }) =>
          pipe.from === junction &&
          (pipe.to === null ||
            (pipes.filter((other) => other.to === pipe.to).length === 1 &&
              !primaries.some((primary) => primary.to === pipe.to))),
      );
  const width = (index: number): number => {
    const pipe = pipes[index]!;
    if (pipe.to === null) return thickness(pipe.diameter);
    const branches = spread(pipe.to);
    return Math.max(
      thickness(pipe.diameter),
      branches.reduce((sum, branch) => sum + width(branch.index), 0) + gap * (branches.length - 1),
    );
  };

  // Heights: in x order, from primaries, entering junctions or the spread that places them.
  const height = new Map<number, number>();
  const lane = new Map<number, number>();
  for (const junction of [...at.keys()].sort((a, b) => at.get(a)! - at.get(b)! || a - b)) {
    if (!height.has(junction)) {
      const rows = primaries.flatMap(({ to }, cylinder) => (to === junction ? [middle(rowOf.get(cylinder)!)] : []));
      const feeds = pipes
        .filter((pipe) => pipe.to === junction && height.has(pipe.from))
        .map((p) => height.get(p.from)!);
      const sources = rows.length ? rows : feeds;
      height.set(junction, sources.reduce((sum, y) => sum + y, 0) / Math.max(1, sources.length));
    }
    const branches = spread(junction);
    const total = branches.reduce((sum, branch) => sum + width(branch.index), 0) + gap * (branches.length - 1);
    let top = height.get(junction)! - total / 2;
    for (const { pipe, index } of branches) {
      const y = top + width(index) / 2;
      lane.set(index, y);
      if (pipe.to !== null) height.set(pipe.to, y);
      top += width(index) + gap;
    }
  }

  const tubes: DiagramTube[] = [];
  // Each junction's tubes where they reach it: their heights and thicknesses.
  const reaching = new Map<number, { y: number; thickness: number }[]>();
  const reach = (junction: number, y: number, diameter: number) => {
    if (!reaching.has(junction)) reaching.set(junction, []);
    reaching.get(junction)!.push({ y, thickness: thickness(diameter) });
  };
  pipes.forEach((pipe, index) => {
    if (!at.has(pipe.from)) return;
    const y = Math.round(lane.get(index) ?? height.get(pipe.from)!);
    const start: DiagramPoint = [x(pipe.from), y];
    reach(pipe.from, y, pipe.diameter);
    if (pipe.to === null) {
      const end: DiagramPoint = [Math.round(start[0] + pipe.length * scale), y];
      tubes.push({ points: [start, end], thickness: thickness(pipe.diameter), kind: 'pipe', pipe: index, open: true });
      return;
    }
    reach(pipe.to, y, pipe.diameter);
    tubes.push({
      points: [start, [x(pipe.to), y]],
      thickness: thickness(pipe.diameter),
      kind: 'pipe',
      pipe: index,
      open: false,
    });
  });
  const collectors = exhaustCollectors(sound);
  const drawn = primaries.map(({ to, length, diameter }, cylinder) => {
    const row = rowOf.get(cylinder)!;
    const collector = collectors.get(to)!;
    const valve: DiagramPoint = [Math.round(x(to) - length * scale), Math.round(middle(row))];
    reach(to, valve[1], diameter);
    tubes.push({ points: [valve, [x(to), valve[1]]], thickness: thickness(diameter), kind: 'primary', collector });
    return { cylinder, collector, row, valve };
  });
  const bars = [...reaching].map(([junction, tubes]): DiagramBar => {
    const across = crossSection(Math.max(...tubes.map((tube) => tube.thickness)));
    const top = Math.min(...tubes.map(({ y, thickness }) => y - crossSection(thickness).low));
    const bottom = Math.max(...tubes.map(({ y, thickness }) => y + crossSection(thickness).high));
    const entering = primaries.filter((primary) => primary.to === junction).length;
    return {
      box: [x(junction) - across.low, top, x(junction) + across.high, bottom],
      collector: entering >= 2 ? collectors.get(junction)! : null,
    };
  });
  bars.sort((a, b) => Number(a.collector !== null) - Number(b.collector !== null));
  return deepFreeze({ primaries: drawn, tubes, bars });
}
