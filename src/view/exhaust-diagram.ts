import type { EngineSound } from '../audio/engine-sound.js';
import { deepFreeze } from '../core/admission.js';

/** A point of the diagram, in pixels. */
export type DiagramPoint = readonly [x: number, y: number];

/** Where and at what scales an exhaust diagram stands. */
export interface ExhaustDiagramPlacement {
  /** The x of the leftmost valve. */
  readonly left: number;
  /** The text row of the first valve tube; each valve tube takes a row. */
  readonly firstRow: number;
  /** Pixels in a text row; a valve tube runs along its row's middle. */
  readonly rowHeight: number;
  /** Pixels along a tube per metre of its length. */
  readonly pixelsPerMeter: number;
  /** Pixels across the tubes per metre of the exhaust's diameter. */
  readonly pixelsAcrossPerMeter: number;
  /** Pixels left clear between tubes laid side by side where a junction splits. */
  readonly gap: number;
}

/** A rectangle of pixels, inclusive. */
export type DiagramBox = readonly [left: number, top: number, right: number, bottom: number];

/**
 * A tube drawn as level and upright pieces through `points`, `thickness` pixels across, its index in the exhaust's
 * `tubes`, ending at a mouth when `open`: a valve tube, a cylinder's starting at its valve, with its collector
 * (`exhaustCollectors`), or a pipe, a tube from a junction. Its other ends join a junction's bar.
 */
export type DiagramTube = {
  readonly points: readonly DiagramPoint[];
  readonly thickness: number;
  readonly tube: number;
  readonly open: boolean;
} & ({ readonly kind: 'valve'; readonly collector: number } | { readonly kind: 'junction' });

/**
 * A junction drawn as one bar: as wide as its thickest tube, centred on its x, and as tall as every tube's
 * cross-section where it reaches the junction. A collector's bar, where two or more valve tubes enter, has its
 * collector; others null.
 */
export interface DiagramBar {
  readonly box: DiagramBox;
  readonly collector: number | null;
}

/**
 * An exhaust drawn from its engine sound: each valve tube's cylinder, collector, text row and valve (where its cylinder
 * stands); the tubes, junction tubes first and valve tubes last; and the junctions' bars, collectors' last.
 */
export interface ExhaustDiagram {
  readonly cylinders: readonly {
    readonly cylinder: number;
    readonly collector: number;
    readonly row: number;
    readonly valve: DiagramPoint;
  }[];
  readonly tubes: readonly DiagramTube[];
  readonly bars: readonly DiagramBar[];
}

/** A tube's thickness in pixels: a diameter at the placement's scale, at least one pixel. */
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

/** An exhaust's valve tubes, its cylinders', and its junction tubes, the tubes from its junctions. */
function exhaustParts(sound: EngineSound) {
  const { tubes } = sound.exhaust;
  const cylinders = sound.firingPhases.length;
  return {
    valveTubes: tubes.slice(0, cylinders).map(({ to, length }) => ({ to, length })),
    junctionTubes: tubes
      .slice(cylinders)
      .map(({ from, to, length }, k) => ({ from: from!, to, length, tube: cylinders + k })),
  };
}

/**
 * Each junction's position along the exhaust in metres, every tube level and true to its length: along a spanning
 * forest of the junctions joined by junction tubes, `to` stands `length` after `from`; each group the cylinders reach
 * then shifts so that its leftmost valve, junction or open end stands at 0; a valve tube that ends at a mouth runs from
 * its valve at 0. Junctions the cylinders do not reach are absent. Returns the positions and the farthest open end.
 */
function exhaustPositions(sound: EngineSound): { readonly at: ReadonlyMap<number, number>; readonly extent: number } {
  const { valveTubes, junctionTubes } = exhaustParts(sound);
  const at = new Map<number, number>();
  let extent = Math.max(0, ...valveTubes.filter(({ to }) => to === null).map(({ length }) => length));
  for (const seed of valveTubes.flatMap(({ to }) => (to === null ? [] : [to]))) {
    if (at.has(seed)) continue;
    // One group: its junctions placed from the seed along junction tubes either way, a loop's closing tube left as it
    // falls.
    const group = new Map<number, number>([[seed, 0]]);
    for (const queue = [seed]; queue.length;) {
      const junction = queue.shift()!;
      for (const { from, to, length } of junctionTubes) {
        if (to === null) continue;
        const next = from === junction ? to : to === junction ? from : null;
        if (next === null || group.has(next)) continue;
        group.set(next, group.get(junction)! + (from === junction ? length : -length));
        queue.push(next);
      }
    }
    const ends = [...group].flatMap(([junction, x]) => [
      x,
      ...valveTubes.filter(({ to }) => to === junction).map(({ length }) => x - length),
      ...junctionTubes.filter((pipe) => pipe.from === junction && pipe.to === null).map(({ length }) => x + length),
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
 * Each junction a valve tube enters, by its collector: such junctions joined by a junction tube that is all its `from`
 * junction's outflow are one collector, a log manifold's run of ports. Collectors are numbered from 0 in the order of
 * their lowest junction.
 */
function junctionCollectors(sound: EngineSound): ReadonlyMap<number, number> {
  const { valveTubes, junctionTubes } = exhaustParts(sound);
  const entered = [...new Set(valveTubes.flatMap(({ to }) => (to === null ? [] : [to])))].sort((a, b) => a - b);
  const root = new Map(entered.map((junction) => [junction, junction]));
  const find = (junction: number): number => (root.get(junction) === junction ? junction : find(root.get(junction)!));
  for (const { from, to } of junctionTubes)
    if (
      to !== null &&
      root.has(from) &&
      root.has(to) &&
      junctionTubes.filter((pipe) => pipe.from === from).length === 1
    ) {
      const [low, high] = [find(from), find(to)].sort((a, b) => a - b);
      root.set(high!, low!);
    }
  const numbers = new Map<number, number>();
  for (const junction of entered) if (find(junction) === junction) numbers.set(junction, numbers.size);
  return new Map(entered.map((junction) => [junction, numbers.get(find(junction))!]));
}

/**
 * Each cylinder's collector: its junction's (`junctionCollectors`), or, for a valve tube that ends at a mouth, one of
 * its own, numbered after the junctions' in cylinder order.
 */
export function exhaustCollectors(sound: EngineSound): readonly number[] {
  const { valveTubes } = exhaustParts(sound);
  const byJunction = junctionCollectors(sound);
  let next = new Set(byJunction.values()).size;
  return valveTubes.map(({ to }) => (to === null ? next++ : byJunction.get(to)!));
}

/**
 * An exhaust's form as its flows stage by stage: the cylinders, their collectors (`exhaustCollectors`), the junctions
 * at each depth from them along junction tubes from `from` to `to`, then the open ends leaving the last (with the valve
 * tubes that end at a mouth); equal neighbours are one stage, and a single stage is written twice (`1-1`).
 */
export function exhaustTopology(sound: EngineSound): string {
  const { valveTubes, junctionTubes } = exhaustParts(sound);
  const counts = [valveTubes.length, new Set(exhaustCollectors(sound)).size];
  let stage: ReadonlySet<number> = new Set(junctionCollectors(sound).keys());
  let mouths = valveTubes.filter(({ to }) => to === null).length;
  const seen = new Set(stage);
  for (;;) {
    const next = new Set<number>();
    for (const pipe of junctionTubes)
      if (stage.has(pipe.from) && pipe.to !== null && !seen.has(pipe.to)) next.add(pipe.to);
    if (next.size === 0) {
      counts.push(mouths + junctionTubes.filter((pipe) => stage.has(pipe.from) && pipe.to === null).length);
      break;
    }
    mouths = 0;
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
 * from `exhaustPositions`, its leftmost valve at `left`), across the exhaust's diameter at `pixelsAcrossPerMeter`.
 * Primaries take a row each from `firstRow`, in the order their junctions are reached going upstream from each last
 * junction (junction tubes into a junction before its own valve tubes), so merges and a log manifold's ports stand
 * together. A junction stands at the mean height of its valve tubes, or else of the junctions whose junction tubes
 * enter it; the junction tubes leaving a junction for its own downstream junctions (each entered by that pipe alone)
 * and its open ends stand side by side about its height, each as wide as what it carries, `gap` apart; any other pipe
 * runs at its `from` junction's height. Each junction's bar joins the tubes reaching it at their heights and carries no
 * length. A valve tube that ends at a mouth takes its row after them, from its valve at `left`. Junctions the cylinders
 * do not reach are not drawn.
 */
export function createExhaustDiagram(sound: EngineSound, placement: ExhaustDiagramPlacement): ExhaustDiagram {
  const { valveTubes, junctionTubes } = exhaustParts(sound);
  const { pixelsPerMeter: scale, gap } = placement;
  const { at } = exhaustPositions(sound);
  const across = tubeThickness(sound.exhaust.diameter, placement.pixelsAcrossPerMeter);
  const x = (junction: number) => Math.round(placement.left + at.get(junction)! * scale);

  // Rows: going upstream from each last junction, junction tubes into a junction first, then its own valve tubes.
  const order: number[] = [];
  const visited = new Set<number>();
  const upstream = (junction: number): void => {
    if (visited.has(junction)) return;
    visited.add(junction);
    for (const pipe of junctionTubes) if (pipe.to === junction && at.has(pipe.from)) upstream(pipe.from);
    valveTubes.forEach(({ to }, cylinder) => to === junction && order.push(cylinder));
  };
  const last = [...at.keys()].filter(
    (junction) => !junctionTubes.some((pipe) => pipe.from === junction && pipe.to !== null),
  );
  for (const junction of last.sort((a, b) => a - b)) upstream(junction);
  for (const junction of [...at.keys()].sort((a, b) => a - b)) upstream(junction);
  valveTubes.forEach(({ to }, cylinder) => to === null && order.push(cylinder));
  const rowOf = new Map(order.map((cylinder, index) => [cylinder, placement.firstRow + index]));
  const middle = (row: number) => row * placement.rowHeight + placement.rowHeight / 2;

  // What a junction's own downstream branch needs across: its spread junction tubes and open ends side by side.
  const spread = (junction: number) =>
    junctionTubes
      .map((pipe, index) => ({ pipe, index }))
      .filter(
        ({ pipe }) =>
          pipe.from === junction &&
          (pipe.to === null ||
            (junctionTubes.filter((other) => other.to === pipe.to).length === 1 &&
              !valveTubes.some((valveTube) => valveTube.to === pipe.to))),
      );
  const width = (index: number): number => {
    const pipe = junctionTubes[index]!;
    if (pipe.to === null) return across;
    const branches = spread(pipe.to);
    return Math.max(
      across,
      branches.reduce((sum, branch) => sum + width(branch.index), 0) + gap * (branches.length - 1),
    );
  };

  // Heights: in x order, from valve tubes, entering junctions or the spread that places them.
  const height = new Map<number, number>();
  const lane = new Map<number, number>();
  for (const junction of [...at.keys()].sort((a, b) => at.get(a)! - at.get(b)! || a - b)) {
    if (!height.has(junction)) {
      const rows = valveTubes.flatMap(({ to }, cylinder) => (to === junction ? [middle(rowOf.get(cylinder)!)] : []));
      const feeds = junctionTubes
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
  const reach = (junction: number, y: number) => {
    if (!reaching.has(junction)) reaching.set(junction, []);
    reaching.get(junction)!.push({ y, thickness: across });
  };
  junctionTubes.forEach((pipe, index) => {
    if (!at.has(pipe.from)) return;
    const y = Math.round(lane.get(index) ?? height.get(pipe.from)!);
    const start: DiagramPoint = [x(pipe.from), y];
    reach(pipe.from, y);
    if (pipe.to === null) {
      const end: DiagramPoint = [Math.round(start[0] + pipe.length * scale), y];
      tubes.push({ points: [start, end], thickness: across, kind: 'junction', tube: pipe.tube, open: true });
      return;
    }
    reach(pipe.to, y);
    tubes.push({ points: [start, [x(pipe.to), y]], thickness: across, kind: 'junction', tube: pipe.tube, open: false });
  });
  const collectors = exhaustCollectors(sound);
  const byJunction = junctionCollectors(sound);
  const drawn = valveTubes.map(({ to, length }, cylinder) => {
    const row = rowOf.get(cylinder)!;
    const collector = collectors[cylinder]!;
    const y = Math.round(middle(row));
    // A valve tube to a mouth runs from its valve at `left`; any other ends at its junction.
    const valve: DiagramPoint = [to === null ? Math.round(placement.left) : Math.round(x(to) - length * scale), y];
    const end: DiagramPoint = to === null ? [Math.round(valve[0] + length * scale), y] : [x(to), y];
    if (to !== null) reach(to, y);
    tubes.push({
      points: [valve, end],
      thickness: across,
      kind: 'valve',
      collector,
      tube: cylinder,
      open: to === null,
    });
    return { cylinder, collector, row, valve };
  });
  const bars = [...reaching].map(([junction, tubes]): DiagramBar => {
    const section = crossSection(Math.max(...tubes.map((tube) => tube.thickness)));
    const top = Math.min(...tubes.map(({ y, thickness }) => y - crossSection(thickness).low));
    const bottom = Math.max(...tubes.map(({ y, thickness }) => y + crossSection(thickness).high));
    const entering = valveTubes.filter((valveTube) => valveTube.to === junction).length;
    return {
      box: [x(junction) - section.low, top, x(junction) + section.high, bottom],
      collector: entering >= 2 ? byJunction.get(junction)! : null,
    };
  });
  bars.sort((a, b) => Number(a.collector !== null) - Number(b.collector !== null));
  return deepFreeze({ cylinders: drawn, tubes, bars });
}
