import type { FrameFeatures } from './features.js';
import type { FootageCamera, PitchRule } from './footage-model.js';
import { displayedSpeeds, frameMarks, stripeEdges, travelled } from './calibrate.js';
import { BandedMatrix } from './banded-matrix.js';
import { median, robustCentre } from './statistics.js';
import { followStripes, type StripeTrack } from './stripes.js';

/**
 * The road's plan and profile as one video's frames show them ([Initial estimate](../../docs/footage.md#initial-estimate)):
 * on cells of `cell` metres from `start`, its curvature `κ`, constant on each cell (NaN where no frame shows it), and
 * its height `Y` at the cells' nodes, linear between them (NaN where none shows it), under the pitch `rule`, its frames'
 * grades weighed by `gradeWeight`; per frame its chainage `s_c`, the camera's heading `θ`, its yaw from the road
 * `ψ = θ − H(s_c)` (NaN where its points do not fix them) and its pitch `φ`. `converged` is false when the steps ran out
 * first.
 */
export interface PlanEstimate {
  readonly rule: PitchRule;
  readonly start: number;
  readonly cell: number;
  readonly curvature: readonly number[];
  /** The heights' cells, from `start`. */
  readonly heightCell: number;
  readonly height: readonly number[];
  /** The weight of the frames' squared grades, px² per grade² (0 for none beyond the weak grade differences). */
  readonly gradeWeight: number;
  readonly frames: readonly {
    readonly frame: number;
    readonly s: number;
    readonly heading: number;
    readonly yaw: number;
    /** `θ`'s standard error given the road's heading and height (rad). */
    readonly error: number;
    readonly pitch: number;
  }[];
  /** The counted points' root-mean-square residual (px) and their count. */
  readonly residual: { readonly rms: number; readonly points: number };
  /** The stripe edges: the counted readings' root-mean-square residual (rows), their count, the tracks, the half period. */
  readonly stripes: {
    readonly rms: number;
    readonly readings: number;
    readonly tracks: number;
    readonly halfPeriod: number;
  };
  readonly rounds: number;
  readonly converged: boolean;
}

/**
 * One frame's mark points: each point's mark, row and column from `x₀`, and whether it counts; and the rows of its main
 * road's stripe edges.
 */
export interface FramePoints {
  readonly frame: number;
  readonly s: number;
  readonly edges: Float64Array;
  /** How many marks: marks of one line merge as the estimate shows them one ([mergeMarks]). */
  marks: number;
  readonly mark: Int32Array;
  readonly y: Float64Array;
  readonly x: Float64Array;
  readonly weight: Float64Array;
}

/**
 * Each frame's mark points: every line centre `x` of the roads connected to the one under the player's `column`, on a
 * row more than one row below the horizon `y₀`, of marks of three points or more (one fixes the mark's lateral, and its
 * rejection needs two more to judge it). A row less than one row below the horizon spans more depth than it stands at
 * (`K/u² > K/u`) and places no point. `s_c` is the displayed speed's integral from the first frame. Road edges place no
 * point: an edge's column moves with depth as its rumble strip falls below a column's width (the asphalt's edge near,
 * the strip's outer edge far), so an edge holds no one lateral along its mark. The stripe edges ([stripeEdges]) are read
 * on the same rows, on the frames the original drew anew (a repeated frame shows its edges where they were).
 */
export function framePoints(features: readonly FrameFeatures[], camera: FootageCamera, column: number): FramePoints[] {
  const x0 = camera.centerX.value,
    y0 = camera.horizonRow.value;
  const sc = travelled(features, displayedSpeeds(features));
  return features.map((frame, t) => {
    const marks = frameMarks(frame, column)
      .filter((mark) => mark.kind === 'line')
      .map((mark) => ({
        points: mark.ys.flatMap((y, k) => (y - y0 > 1 ? [{ y, x: mark.xs[k]! - x0 }] : [])),
      }))
      .filter(({ points }) => points.length >= 3);
    const count = marks.reduce((sum, { points }) => sum + points.length, 0);
    const out: FramePoints = {
      frame: frame.frame,
      s: sc[t]!,
      edges: frame.updated ? Float64Array.from(stripeEdges(frame, column, y0 + 1)) : new Float64Array(0),
      marks: marks.length,
      mark: new Int32Array(count),
      y: new Float64Array(count),
      x: new Float64Array(count),
      weight: new Float64Array(count).fill(1),
    };
    let i = 0;
    marks.forEach(({ points }, k) =>
      points.forEach(({ y, x }) => {
        out.mark[i] = k;
        out.y[i] = y;
        out.x[i++] = x;
      }),
    );
    return out;
  });
}

/**
 * The unknowns: the road's heading and height at the nodes, each frame's heading and its marks' laterals, and each
 * stripe edge's station.
 */
interface Estimate {
  readonly heading: Float64Array;
  readonly height: Float64Array;
  readonly thetas: Float64Array;
  readonly laterals: Float64Array[];
  readonly stations: Float64Array;
  /** Each point's depth, as its row lies on the profile (NaN where it lies on none). */
  readonly depths: readonly Float64Array[];
}

/** The residuals: each frame's points' (columns) and each stripe track's readings' (rows). */
interface Residuals {
  readonly lines: Float64Array[];
  readonly stripes: Float64Array[];
}

/**
 * One video's plan and profile problem. Each point is one equation in game pixels, the pseudo projection itself:
 * `x − x₀ = (f/d)·(∫₀^d sin(H(s_c + σ) − θ) dσ + l·cos(H(s_c + d) − θ))`, with the road's heading `H(s)`, each frame's
 * camera heading `θ` and each mark's lateral `l` from the line through the camera along the road (the camera's own
 * lateral drops out but for a curvature difference of `κ²·l_c`, far below what frames show), at the depth `d` its
 * row lies at on the profile, `y = y₀ − f·sin φ + (f/d)·(Y(s_c) + h − Y(s_c + d))·cos φ`: the camera `h` above the road
 * beneath it, and pitching by the rule, `φ = 0` under `level` and along the road's chord from the camera to the player,
 * `φ = −atan((Y(s_c + D′) − Y(s_c))/D′)`, under `road`. A height the depth misplaces scales a mark's column by `ΔY/h`,
 * so marks aside from the camera show the profile. With no rule the heights are held level: the plan alone, which both
 * rules share.
 *
 * `H` and `Y` are linear on cells as long as the frames' median reach (the median of each frame's farthest point's
 * depth on level road, `K/u`): a frame's marks bend and rise with the road only as far as they reach, and a shorter
 * cell is told apart only by differencing overlapping frames, which multiplies their noise. Each frame's `θ` and `l`
 * touch only its own equations and are eliminated in its normal equations, which leaves banded normal equations in `H`
 * and `Y` (a frame reaches from `s_c` to its farthest point), solved by Cholesky. `H` and `Y` are pinned at their first
 * node, and `κ` and the grade are weighed weakly (a millionth of their mean diagonals), to bridge stretches no frame
 * shows.
 *
 * Each stripe edge is fixed at a station `s_m` of its own, and each of its readings is one equation in rows:
 * `y = y₀ − f·sin φ + (f/d)·(Y(s_c) + h − Y(s_m))·cos φ`, `d = s_m − s_c`. Its station is set mostly by its near rows,
 * where hills add little, and its far rows show the hills. The edges are followed ([followStripes]) on the profile
 * `follow` (level when none), or `follow` gives the tracks themselves. Each track's station touches only its own
 * equations and is eliminated in its normal equations, as a frame's unknowns are.
 */
function planProblem(
  frames: readonly FramePoints[],
  camera: FootageCamera,
  rule: PitchRule | null,
  follow: Float64Array | { readonly tracks: readonly StripeTrack[]; readonly halfPeriod: number } | null = null,
) {
  const f = camera.focalLength.value,
    h = camera.height.value,
    y0 = camera.horizonRow.value,
    D = camera.playerDistance.value,
    K = f * h;
  const levelReach = (frame: FramePoints) => K / (Math.min(...frame.y) - y0);
  const reaches = frames.filter((frame) => frame.y.length).map(levelReach);
  if (!reaches.length) throw new RangeError('No frame shows a line');
  const cell = median(reaches);
  const start = Math.floor(frames[0]!.s);
  // Nodes through each frame's farthest point or stripe edge, a profile placing it at most twice as far as level road
  // does.
  const extent =
    Math.max(
      ...frames.map(
        (frame) =>
          frame.s +
          2 * Math.max(D, frame.y.length ? levelReach(frame) : 0, ...Array.from(frame.edges, (y) => K / (y - y0))),
      ),
    ) - start;
  const grid = (size: number) => {
    const count = Math.max(2, Math.floor(extent / size) + 2);
    return {
      size,
      count,
      at(x: number) {
        const q = (x - start) / size,
          j = Math.min(count - 2, Math.max(0, Math.floor(q)));
        return { j, a: q - j };
      },
    };
  };
  const plan = grid(cell);
  // The heights' grid: the plan's while the stripe edges are first followed on level road, then their own.
  let profile = plan;
  const node = (x: number) => plan.at(x);
  const heightAt = (height: Float64Array, x: number) => {
    const { j, a } = profile.at(x);
    return height[j]! * (1 - a) + height[j + 1]! * a;
  };
  const slopeAt = (height: Float64Array, x: number) => {
    const { j } = profile.at(x);
    return (height[j + 1]! - height[j]!) / profile.size;
  };
  /** The camera's grade over its chord to the player, `(Y(s_c + D′) − Y(s_c))/D′`, as its height nodes' coefficients. */
  const chord = (s: number) => {
    const near = profile.at(s),
      far = profile.at(s + D);
    return [
      [near.j, -(1 - near.a) / D],
      [near.j + 1, -near.a / D],
      [far.j, (1 - far.a) / D],
      [far.j + 1, far.a / D],
    ] as const;
  };
  const grade = (height: Float64Array, s: number) => chord(s).reduce((sum, [j, c]) => sum + c * height[j]!, 0);
  const pitchOf = (height: Float64Array, s: number) => (rule === 'road' ? -Math.atan(grade(height, s)) : 0);
  const inRange = (x: number) => x >= start && x <= start + extent;

  /**
   * Each of a frame's points' depth on the profile: the root of `g(d) = d·(y − y_h) − f·(Y(s_c) + h − Y(s_c + d))·cos φ`
   * by Newton's steps from level road, until a step moves it by less than a millionth; NaN where the row lies above
   * the frame's horizon, the steps leave the nodes or the road there faces away (`g′ ≤ 0`, past a crest).
   */
  const depthAt = (frame: FramePoints, height: Float64Array, y: number) => {
    const phi = pitchOf(height, frame.s),
      cos = Math.cos(phi),
      u = y - (y0 - f * Math.sin(phi)),
      cameraHeight = heightAt(height, frame.s) + h;
    if (!(u > 0)) return NaN;
    let d = (f * (cameraHeight - heightAt(height, frame.s)) * cos) / u;
    for (let step = 0; step < 50; step++) {
      if (!(d > 0) || !inRange(frame.s + d)) return NaN;
      const g = d * u - f * (cameraHeight - heightAt(height, frame.s + d)) * cos,
        slope = u + f * cos * slopeAt(height, frame.s + d);
      if (!(slope > 0)) return NaN;
      const next = d - g / slope;
      if (Math.abs(next - d) < 1e-6 * d) return next > 0 && inRange(frame.s + next) ? next : NaN;
      d = next;
    }
    return NaN;
  };
  const frameDepths = (frame: FramePoints, height: Float64Array) =>
    Float64Array.from(frame.y, (y) => depthAt(frame, height, y));
  /** The row a station stands at in a frame on the profile (NaN behind the camera or beyond the nodes). */
  const rowAt = (frame: FramePoints, height: Float64Array, station: number) => {
    const d = station - frame.s;
    if (!(d > 0) || !inRange(station)) return NaN;
    const phi = pitchOf(height, frame.s);
    return (
      y0 - f * Math.sin(phi) + (f / d) * (heightAt(height, frame.s) + h - heightAt(height, station)) * Math.cos(phi)
    );
  };
  const followOn = (height: Float64Array) =>
    followStripes(
      frames.map((frame) => frame.edges),
      frames.map((frame) => frame.s),
      {
        station: (t, y) => frames[t]!.s + depthAt(frames[t]!, height, y),
        row: (t, station) => rowAt(frames[t]!, height, station),
      },
    );
  // The heights are linear on cells as long as the frames' median reach over the points and the stripe edges followed
  // on level road: a frame's readings show the road's rise only as far as they reach.
  const level = followOn(new Float64Array(plan.count));
  const reach = new Float64Array(frames.length);
  frames.forEach((frame, t) => (reach[t] = frame.y.length ? levelReach(frame) : 0));
  for (const track of level.tracks)
    track.frames.forEach((t, k) => (reach[t] = Math.max(reach[t]!, K / (track.rows[k]! - y0))));
  profile = grid(median(Array.from(reach).filter((d) => d > 0)));
  const followed = follow instanceof Float64Array ? followOn(follow) : (follow ?? level);
  const { tracks, halfPeriod } = followed;
  // The unknowns' order: the heading's and the heights' nodes merged by station, so that each frame's and each track's
  // equations touch a band.
  const headingIndex = new Int32Array(plan.count),
    heightIndex = new Int32Array(profile.count);
  for (let i = 0, j = 0, k = 0; j < plan.count || k < profile.count; i++)
    if (k >= profile.count || (j < plan.count && j * plan.size <= k * profile.size)) headingIndex[j++] = i;
    else heightIndex[k++] = i;
  const size = plan.count + profile.count;
  /** Each track's station on the profile, where its nearest reading lies. */
  const stationsOn = (height: Float64Array) =>
    Float64Array.from(tracks, (track) => {
      const last = track.frames.length - 1;
      return frames[track.frames[last]!]!.s + depthAt(frames[track.frames[last]!]!, height, track.rows[last]!);
    });
  const estimateOf = (
    heading: Float64Array,
    height: Float64Array,
    thetas: Float64Array,
    laterals: Float64Array[],
    stations: Float64Array,
  ): Estimate => ({
    heading,
    height,
    thetas,
    laterals,
    stations,
    depths: frames.map((frame) => frameDepths(frame, height)),
  });

  const residualsOf = (e: Estimate): Residuals => ({
    lines: frames.map(
      (frame, t) => frameModel(frame, e.depths[t]!, e.heading, e.thetas[t]!, e.laterals[t]!, f, start, cell).residual,
    ),
    stripes: tracks.map((track, m) =>
      Float64Array.from(track.rows, (y, k) => y - rowAt(frames[track.frames[k]!]!, e.height, e.stations[m]!)),
    ),
  });
  /** Each counted residual with its weight, over the ones `other` also places when given. */
  const eachCounted = (
    residuals: Residuals,
    visit: (r: number, w: number, at: { t: number; stripe: boolean; i: number }) => void,
    other?: Residuals,
  ) => {
    frames.forEach((frame, t) =>
      residuals.lines[t]!.forEach((r, i) => {
        if (frame.weight[i] && Number.isFinite(r) && (!other || Number.isFinite(other.lines[t]![i]!)))
          visit(r, frame.weight[i]!, { t, stripe: false, i });
      }),
    );
    tracks.forEach((track, m) =>
      residuals.stripes[m]!.forEach((r, k) => {
        if (track.weight[k] && Number.isFinite(r) && (!other || Number.isFinite(other.stripes[m]![k]!)))
          visit(r, track.weight[k]!, { t: track.frames[k]!, stripe: true, i: m });
      }),
    );
  };
  /** How far the counted residuals moved, their weighted squared differences, and how many count. */
  const movedBetween = (before: Residuals, after: Residuals) => {
    let moved = 0,
      counted = 0;
    const each = (r: Float64Array, previous: Float64Array, weight: Float64Array) =>
      r.forEach((v, i) => {
        if (!weight[i]) return;
        moved += weight[i]! * (v - previous[i]!) ** 2;
        counted++;
      });
    frames.forEach((frame, t) => each(after.lines[t]!, before.lines[t]!, frame.weight));
    tracks.forEach((track, m) => each(after.stripes[m]!, before.stripes[m]!, track.weight));
    return { moved, counted };
  };
  /** The counted residuals' weighted squares, over the ones `other` also places when given. */
  const squares = (residuals: Residuals, other?: Residuals) => {
    let sum = 0;
    eachCounted(residuals, (r, w) => (sum += w * r * r), other);
    return sum;
  };
  const gradeSquares = (height: Float64Array) => frames.reduce((sum, frame) => sum + grade(height, frame.s) ** 2, 0);

  /**
   * One Gauss–Newton step at the estimate with Marquardt's damping: the counted points' equations linearized in the
   * nodes' `H` and `Y` (in the order of their stations), each frame's `θ` and its marks' `l` (the
   * integrals taken metre by metre), the frame unknowns eliminated frame by frame, the banded equations solved, and the
   * frame unknowns' steps recovered. `Y` moves a point through its depth: `∂d/∂Y = −(∂g/∂Y)/g′`.
   */
  const step = (e: Estimate, damping: number, gradeWeight: number): Estimate => {
    // Each frame's unknowns: the heading's nodes `first`–`last` and the heights' `low`–`high`, at `offset` + 0…`span`.
    const windows = frames.map((frame, t) => {
      const depths = e.depths[t]!;
      let far = D;
      depths.forEach((d, i) => frame.weight[i] && Number.isFinite(d) && (far = Math.max(far, d)));
      const first = node(frame.s).j,
        last = node(frame.s + far).j + 1;
      const low = profile.at(frame.s).j,
        high = profile.at(frame.s + far).j + 1;
      const offset = Math.min(headingIndex[first]!, heightIndex[low]!);
      return { first, last, offset, span: Math.max(headingIndex[last]!, heightIndex[high]!) - offset + 1 };
    });
    const trackSpans = tracks.map((track, m) => {
      const low = profile.at(frames[track.frames[0]!]!.s).j;
      const high = Math.max(profile.at(e.stations[m]!).j, profile.at(frames[track.frames.at(-1)!]!.s + D).j) + 1;
      return heightIndex[high]! - heightIndex[low]! + 1;
    });
    const width = Math.max(...windows.map((w) => w.span), ...trackSpans) - 1;
    const normal = new BandedMatrix(size, width);
    const eliminations = frames.map((frame, t) => {
      const { first, last, offset, span } = windows[t]!;
      const depths = e.depths[t]!;
      const theta = e.thetas[t]!,
        lateral = e.laterals[t]!;
      let far = 0;
      depths.forEach((d, i) => frame.weight[i] && Number.isFinite(d) && (far = Math.max(far, d)));
      if (!far) return null;
      const metres = Math.ceil(far) + 1;
      const { phi, node: nodeOf, weight } = view(frame, metres, e.heading, theta, start, cell);
      // Prefix sums along the view: ∫ sin Φ, ∫ cos Φ, and each node's ∫ cos Φ·(its hat), metre by metre.
      const nodesHere = last - first + 1;
      const sinPrefix = new Float64Array(metres + 1),
        cosPrefix = new Float64Array(metres + 1);
      const nodePrefix = new Float64Array((metres + 1) * nodesHere);
      for (let m = 0; m < metres; m++) {
        const c = Math.cos(phi[m]!);
        sinPrefix[m + 1] = sinPrefix[m]! + Math.sin(phi[m]!);
        cosPrefix[m + 1] = cosPrefix[m]! + c;
        nodePrefix.copyWithin((m + 1) * nodesHere, m * nodesHere, (m + 1) * nodesHere);
        const j = nodeOf[m]! - first;
        if (j >= 0 && j < nodesHere)
          nodePrefix[(m + 1) * nodesHere + j] = nodePrefix[(m + 1) * nodesHere + j]! + c * (1 - weight[m]!);
        if (j + 1 >= 0 && j + 1 < nodesHere)
          nodePrefix[(m + 1) * nodesHere + j + 1] = nodePrefix[(m + 1) * nodesHere + j + 1]! + c * weight[m]!;
      }
      // The frame's pitch and its derivatives in the nodes' heights.
      const pitch = pitchOf(e.height, frame.s),
        cos = Math.cos(pitch),
        sin = Math.sin(pitch);
      const pitchChord = rule === 'road' ? chord(frame.s) : [];
      const byGrade = -1 / (1 + Math.tan(pitch) ** 2);
      const cameraNode = profile.at(frame.s),
        cameraHeight = heightAt(e.height, frame.s) + h,
        horizon = y0 - f * sin;
      const block = new Float64Array(span * span),
        rhs = new Float64Array(span),
        th = new Float64Array(span);
      const marks = Array.from({ length: frame.marks }, () => ({ ll: 0, lt: 0, r: 0, h: new Float64Array(span) }));
      let tt = 0,
        tr = 0;
      const g = new Float64Array(span);
      const at = (j: number) => headingIndex[first + j]! - offset;
      const addY = (k: number, v: number) => {
        if (rule) g[heightIndex[k]! - offset] = g[heightIndex[k]! - offset]! + v;
      };
      for (let i = 0; i < frame.y.length; i++) {
        const w = frame.weight[i]!,
          d = depths[i]!;
        if (!w || !Number.isFinite(d)) continue;
        const scale = f / d,
          k = frame.mark[i]!,
          l = lateral[k]!;
        const m = Math.floor(d),
          part = d - m,
          mm = Math.min(m, metres - 1);
        const end = headingAt(frame, d, e.heading, theta, start, cell);
        const sinEnd = Math.sin(end.phi),
          cosEnd = Math.cos(end.phi);
        const model = scale * (sinPrefix[m]! + part * Math.sin(phi[mm]!) + l * cosEnd);
        const residual = frame.x[i]! - model;
        g.fill(0);
        // ∂/∂H_j: ∫ cos Φ·hat_j − l·sin Φ(d)·hat_j(d); ∂/∂θ: −∫ cos Φ + l·sin Φ(d); ∂/∂l: cos Φ(d).
        for (let j = 0; j < nodesHere; j++) g[at(j)] = scale * nodePrefix[m * nodesHere + j]!;
        const jm = nodeOf[mm]! - first,
          cm = Math.cos(phi[mm]!) * part;
        if (jm >= 0 && jm < nodesHere) g[at(jm)] = g[at(jm)]! + scale * cm * (1 - weight[mm]!);
        if (jm + 1 >= 0 && jm + 1 < nodesHere) g[at(jm + 1)] = g[at(jm + 1)]! + scale * cm * weight[mm]!;
        const je = end.j - first;
        if (je >= 0 && je < nodesHere) g[at(je)] = g[at(je)]! - scale * l * sinEnd * (1 - end.a);
        if (je + 1 >= 0 && je + 1 < nodesHere) g[at(je + 1)] = g[at(je + 1)]! - scale * l * sinEnd * end.a;
        // ∂/∂Y_j through the depth: ∂x/∂d·∂d/∂Y_j, with ∂d/∂Y_j = −(∂g/∂Y_j)/g′.
        const curvatureEnd = (e.heading[end.j + 1]! - e.heading[end.j]!) / cell;
        const byDepth = -model / d + scale * sinEnd * (1 - l * curvatureEnd);
        const drop = cameraHeight - heightAt(e.height, frame.s + d);
        const slope = frame.y[i]! - horizon + f * cos * slopeAt(e.height, frame.s + d);
        const along = profile.at(frame.s + d);
        const factor = -byDepth / slope;
        addY(cameraNode.j, factor * -f * cos * (1 - cameraNode.a));
        addY(cameraNode.j + 1, factor * -f * cos * cameraNode.a);
        addY(along.j, factor * f * cos * (1 - along.a));
        addY(along.j + 1, factor * f * cos * along.a);
        const byPitch = d * f * cos + f * drop * sin;
        for (const [j, c] of pitchChord) addY(j, factor * byPitch * byGrade * c);
        const gt = scale * (-(cosPrefix[m]! + part * Math.cos(phi[mm]!)) + l * sinEnd),
          gl = scale * cosEnd;
        const markSums = marks[k]!;
        for (let a = 0; a < span; a++) {
          if (g[a] === 0) continue;
          const ga = w * g[a]!;
          rhs[a] = rhs[a]! + ga * residual;
          th[a] = th[a]! + ga * gt;
          markSums.h[a] = markSums.h[a]! + ga * gl;
          for (let b = 0; b <= a; b++) block[a * span + b] = block[a * span + b]! + ga * g[b]!;
        }
        tt += w * gt * gt;
        tr += w * gt * residual;
        markSums.ll += w * gl * gl;
        markSums.lt += w * gl * gt;
        markSums.r += w * gl * residual;
      }
      // Marquardt's damping on the frame's own unknowns, then each mark's l eliminated, then θ: rank-one corrections
      // to the nodes' block.
      tt *= 1 + damping;
      for (const mark of marks) mark.ll *= 1 + damping;
      for (const mark of marks) {
        if (!(mark.ll > 0)) continue;
        for (let a = 0; a < span; a++) {
          const v = mark.h[a]! / mark.ll;
          if (v === 0) continue;
          rhs[a] = rhs[a]! - v * mark.r;
          th[a] = th[a]! - v * mark.lt;
          for (let b = 0; b <= a; b++) block[a * span + b] = block[a * span + b]! - v * mark.h[b]!;
        }
        tt -= (mark.lt * mark.lt) / mark.ll;
        tr -= (mark.lt * mark.r) / mark.ll;
      }
      if (tt > 0)
        for (let a = 0; a < span; a++) {
          const v = th[a]! / tt;
          if (v === 0) continue;
          rhs[a] = rhs[a]! - v * tr;
          for (let b = 0; b <= a; b++) block[a * span + b] = block[a * span + b]! - v * th[b]!;
        }
      for (let a = 0; a < span; a++) {
        normal.rhs[offset + a] = normal.rhs[offset + a]! + rhs[a]!;
        for (let b = 0; b <= a; b++) if (block[a * span + b]) normal.add(offset + a, offset + b, block[a * span + b]!);
      }
      return { offset, marks, tt, tr, th };
    });
    // Each stripe track's readings, its station eliminated: a rank-one correction to the heights.
    const stripeEliminations = tracks.map((track, m) => {
      const station = e.stations[m]!;
      const coupling = new Map<number, number>();
      let pivot = 0,
        target = 0;
      const entries = new Map<number, number>();
      track.frames.forEach((t, k) => {
        const w = track.weight[k]!;
        const frame = frames[t]!,
          d = station - frame.s;
        if (!w || !(d > 0)) return;
        const pitch = pitchOf(e.height, frame.s),
          cos = Math.cos(pitch),
          sin = Math.sin(pitch);
        const drop = heightAt(e.height, frame.s) + h - heightAt(e.height, station);
        const value = (f / d) * drop * cos;
        const residual = track.rows[k]! - (y0 - f * sin + value);
        entries.clear();
        const add = (k: number, v: number) => entries.set(heightIndex[k]!, (entries.get(heightIndex[k]!) ?? 0) + v);
        if (rule) {
          const camera = profile.at(frame.s),
            at = profile.at(station);
          add(camera.j, (f / d) * cos * (1 - camera.a));
          add(camera.j + 1, (f / d) * cos * camera.a);
          add(at.j, -(f / d) * cos * (1 - at.a));
          add(at.j + 1, -(f / d) * cos * at.a);
          if (rule === 'road') {
            const byPitch = (-f * cos - (f / d) * drop * sin) * (-1 / (1 + Math.tan(pitch) ** 2));
            for (const [j, c] of chord(frame.s)) add(j, byPitch * c);
          }
        }
        const byStation = -(f / d) * cos * slopeAt(e.height, station) - value / d;
        const list = [...entries];
        for (let a = 0; a < list.length; a++) {
          const [i, g] = list[a]!;
          normal.rhs[i] = normal.rhs[i]! + w * g * residual;
          for (let b = 0; b <= a; b++) normal.add(i, list[b]![0], w * g * list[b]![1]);
          coupling.set(i, (coupling.get(i) ?? 0) + w * byStation * g);
        }
        pivot += w * byStation * byStation;
        target += w * byStation * residual;
      });
      pivot *= 1 + damping;
      if (!(pivot > 0)) return null;
      const sorted = [...coupling].sort((a, b) => a[0] - b[0]);
      normal.subtractOuter(
        Int32Array.from(sorted, ([i]) => i),
        Float64Array.from(sorted, ([, v]) => v),
        sorted.length,
        pivot,
        target,
      );
      return { sorted, pivot, target };
    });
    // Marquardt's damping on the nodes; the frames' grades weighed by `gradeWeight`; κ and the grade weighed weakly,
    // and the pins on the first nodes, all on the estimate the step leads to.
    const kinds = [
      { index: headingIndex, values: e.heading, mean: 0 },
      { index: heightIndex, values: e.height, mean: 0 },
    ];
    for (const kind of kinds)
      kind.mean = kind.index.reduce((sum, i) => sum + normal.diagonal(i), 0) / kind.index.length;
    for (let i = 0; i < size; i++) normal.add(i, i, damping * normal.diagonal(i));
    if (gradeWeight > 0)
      for (const frame of frames) {
        const coefficients = chord(frame.s),
          value = grade(e.height, frame.s);
        for (let a = 0; a < 4; a++) {
          const [ja, ca] = coefficients[a]!;
          normal.rhs[heightIndex[ja]!] = normal.rhs[heightIndex[ja]!]! - gradeWeight * ca * value;
          for (let b = 0; b <= a; b++) {
            const [jb, cb] = coefficients[b]!;
            normal.add(heightIndex[ja]!, heightIndex[jb]!, gradeWeight * ca * cb * (ja === jb && a !== b ? 2 : 1));
          }
        }
      }
    for (const { index, values, mean } of kinds) {
      const weak = 1e-6 * mean;
      for (let j = 0; j + 1 < index.length; j++) {
        const a = index[j]!,
          b = index[j + 1]!,
          gap = values[j + 1]! - values[j]!;
        normal.add(a, a, weak);
        normal.add(b, b, weak);
        normal.add(b, a, -weak);
        normal.rhs[a] = normal.rhs[a]! + weak * gap;
        normal.rhs[b] = normal.rhs[b]! - weak * gap;
      }
      normal.add(index[0]!, index[0]!, mean);
      normal.rhs[index[0]!] = normal.rhs[index[0]!]! - mean * values[0]!;
    }
    // An unknown no equation touches (the heights, while every column is the camera's own) is held.
    for (let i = 0; i < size; i++) if (!(normal.diagonal(i) > 0)) normal.add(i, i, 1);
    const delta = normal.solve();
    if (!delta) throw new Error('The plan’s normal equations are not positive definite');
    const thetas = Float64Array.from(e.thetas);
    const laterals = e.laterals.map((values) => Float64Array.from(values));
    eliminations.forEach((elimination, t) => {
      if (!elimination) return;
      const { offset, marks, tt, tr, th } = elimination;
      const dot = (v: Float64Array) => v.reduce((sum, x, a) => sum + x * delta[offset + a]!, 0);
      const dt = tt > 0 ? (tr - dot(th)) / tt : 0;
      thetas[t] = thetas[t]! + dt;
      marks.forEach((mark, k) => {
        if (mark.ll > 0) laterals[t]![k] = laterals[t]![k]! + (mark.r - mark.lt * dt - dot(mark.h)) / mark.ll;
      });
    });
    const stations = e.stations.map((station, m) => {
      const elimination = stripeEliminations[m];
      if (!elimination) return station;
      const { sorted, pivot, target } = elimination;
      return station + (target - sorted.reduce((sum, [i, v]) => sum + v * delta[i]!, 0)) / pivot;
    });
    return estimateOf(
      e.heading.map((v, j) => v + delta[headingIndex[j]!]!),
      e.height.map((v, k) => v + delta[heightIndex[k]!]!),
      thetas,
      laterals,
      stations,
    );
  };

  const DAMPING = 1e-3;
  let damping = DAMPING;
  /**
   * One Levenberg–Marquardt step at the points' current weights: damped until it lowers the weighted squares over the
   * points both the estimate and the step place (a row the step lifts above its frame's horizon has no depth).
   */
  const descend = (e: Estimate, residuals: Residuals, gradeWeight: number) => {
    const grades = gradeWeight * gradeSquares(e.height);
    for (; damping < 1e12; damping *= 10) {
      const trial = step(e, damping, gradeWeight);
      const next = residualsOf(trial);
      if (squares(next, residuals) + gradeWeight * gradeSquares(trial.height) < squares(residuals, next) + grades) {
        damping = Math.max(1e-9, damping / 10);
        return { estimate: trial, residuals: next };
      }
    }
    // No step lowers them: the weights are at their least squares.
    damping = DAMPING;
    return { estimate: e, residuals };
  };

  /**
   * After a step: each octave of depth has its own noise, its residuals' robust deviation, no less than a column's
   * rounding for the points and a row's for the stripe edges. A reading weighs by its octave's inverse variance; readings
   * beyond three of their deviations, readings with no depth, and marks and tracks whose normalized root-mean-square
   * residual is beyond three (another road's, an edge read wrongly), are left out. Returns whether the counted residuals
   * moved by less than a tenth of their deviations (root mean square), and the octaves' noise.
   */
  const reweigh = (e: Estimate, residuals: Residuals, before: Residuals) => {
    const stripeDepth = (m: number, k: number) => e.stations[m]! - frames[tracks[m]!.frames[k]!]!.s;
    const noiseOf = (samples: Map<number, number[]>) =>
      new Map([...samples].map(([k, values]) => [k, Math.max(Math.sqrt(1 / 12), robustCentre(values).sigma)]));
    const sample = (into: Map<number, number[]>, d: number, r: number) => {
      if (!Number.isFinite(r)) return;
      const k = octave(d);
      if (!into.has(k)) into.set(k, []);
      into.get(k)!.push(r);
    };
    const lineSamples = new Map<number, number[]>(),
      stripeSamples = new Map<number, number[]>();
    frames.forEach((_, t) => residuals.lines[t]!.forEach((r, i) => sample(lineSamples, e.depths[t]![i]!, r)));
    tracks.forEach((_, m) => residuals.stripes[m]!.forEach((r, k) => sample(stripeSamples, stripeDepth(m, k), r)));
    const noise = { lines: noiseOf(lineSamples), stripes: noiseOf(stripeSamples) };
    let moved = 0,
      counted = 0;
    // A group's readings (a frame's marks, a track): their weights, after the group's normalized squares.
    const weigh = (
      r: Float64Array,
      previous: Float64Array,
      weight: Float64Array,
      deviation: (i: number) => number,
      group: (i: number) => number,
      groups: number,
    ) => {
      const sums = new Float64Array(groups),
        counts = new Float64Array(groups);
      r.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        sums[group(i)] = sums[group(i)]! + (v / deviation(i)) ** 2;
        counts[group(i)] = counts[group(i)]! + 1;
      });
      r.forEach((v, i) => {
        if (weight[i] && Number.isFinite(v) && Number.isFinite(previous[i]!)) {
          moved += ((v - previous[i]!) / deviation(i)) ** 2;
          counted++;
        }
        const k = group(i);
        weight[i] =
          Number.isFinite(v) && Math.abs(v) <= 3 * deviation(i) && sums[k]! <= 9 * counts[k]! ? deviation(i) ** -2 : 0;
      });
    };
    frames.forEach((frame, t) =>
      weigh(
        residuals.lines[t]!,
        before.lines[t]!,
        frame.weight,
        (i) => noise.lines.get(octave(e.depths[t]![i]!)) ?? NaN,
        (i) => frame.mark[i]!,
        frame.marks,
      ),
    );
    tracks.forEach((track, m) =>
      weigh(
        residuals.stripes[m]!,
        before.stripes[m]!,
        track.weight,
        (k) => noise.stripes.get(octave(stripeDepth(m, k))) ?? NaN,
        () => 0,
        1,
      ),
    );
    return { settled: moved < 0.01 * counted, noise };
  };

  /**
   * Steps from `e` until the counted residuals move by less than a tenth of their deviations at no more than the first
   * damping (a heavily damped step moves little short of the least squares), or `limit` steps. With
   * `reweighing` each step is followed by new weights ([reweigh]) and the merging of marks the estimate shows to be one
   * line ([mergeMarks]), and the steps end only when none merge.
   */
  const fit = (e: Estimate, gradeWeight: number, reweighing: boolean, limit: number) => {
    let residuals = residualsOf(e);
    let rounds = 0,
      converged = false,
      noise = { lines: new Map<number, number>(), stripes: new Map<number, number>() };
    for (; rounds < limit; rounds++) {
      const before = residuals;
      ({ estimate: e, residuals } = descend(e, residuals, gradeWeight));
      if (!reweighing) {
        const { moved, counted } = movedBetween(before, residuals);
        if (moved < 0.01 * counted && damping <= DAMPING) {
          converged = true;
          break;
        }
        continue;
      }
      const reweighed = reweigh(e, residuals, before);
      noise = reweighed.noise;
      const merged = frames.reduce(
        (sum, frame, t) =>
          sum +
          mergeMarks(
            frame,
            e.depths[t]!,
            e.laterals,
            t,
            frameNormals(
              frame,
              frameModel(frame, e.depths[t]!, e.heading, e.thetas[t]!, e.laterals[t]!, f, start, cell),
            ).precision,
          ),
        0,
      );
      if (merged) residuals = residualsOf(e);
      if (!merged && reweighed.settled && damping <= DAMPING) {
        converged = true;
        break;
      }
    }
    return { estimate: e, residuals, rounds, converged, noise };
  };

  /** The counted points, frames' and marks' unknowns, and the cells and nodes some counted point shows. */
  const counts = (e: Estimate) => {
    const curvature = new Uint8Array(plan.count),
      height = new Uint8Array(profile.count);
    let points = 0,
      frameUnknowns = 0;
    frames.forEach((frame, t) => {
      const marks = new Uint8Array(frame.marks);
      frame.y.forEach((_, i) => {
        if (!frame.weight[i]) return;
        const d = e.depths[t]![i]!;
        points++;
        marks[frame.mark[i]!] = 1;
        for (let q = node(frame.s).j; q < node(frame.s + d).j; q++) curvature[q] = 1;
        for (const x of [frame.s, frame.s + D, frame.s + d]) {
          const { j } = profile.at(x);
          height[j] = height[j + 1] = 1;
        }
      });
      const seen = marks.reduce((sum, v) => sum + v, 0);
      if (seen) frameUnknowns += 1 + seen;
    });
    tracks.forEach((track, m) => {
      let seen = false;
      track.frames.forEach((t, k) => {
        if (!track.weight[k]) return;
        points++;
        seen = true;
        for (const x of [frames[t]!.s, frames[t]!.s + D, e.stations[m]!]) {
          const { j } = profile.at(x);
          height[j] = height[j + 1] = 1;
        }
      });
      if (seen) frameUnknowns++;
    });
    return { points, frameUnknowns, curvature, height };
  };

  return {
    frames,
    rule,
    start,
    cell,
    followed,
    /** A straight, level road and level headings, and the stations where the stripe edges' nearest readings lie on it. */
    initial: () =>
      estimateOf(
        new Float64Array(plan.count),
        new Float64Array(profile.count),
        new Float64Array(frames.length),
        frames.map((frame) => new Float64Array(frame.marks)),
        stationsOn(new Float64Array(profile.count)),
      ),
    residualsOf,
    squares,
    eachCounted,
    fit,
    /**
     * An estimate of another problem over the same frames, its depths and its stripe edges' stations placed on this
     * one's profile.
     */
    restart: (e: Estimate) => estimateOf(e.heading, e.height, e.thetas, e.laterals, stationsOn(e.height)),
    counts,
    /** A reading's octave of depth: a frame's point, or a track's reading. */
    octave: (e: Estimate, at: { t: number; stripe: boolean; i: number }) =>
      octave(at.stripe ? e.stations[at.i]! - frames[at.t]!.s : e.depths[at.t]![at.i]!),
    /** The estimate as a [PlanEstimate]. */
    result(e: Estimate, residuals: Residuals, gradeWeight: number, rounds: number, converged: boolean) {
      if (!rule) throw new Error('A plan with its heights held is no estimate under a pitch rule');
      const shown = counts(e);
      const rms = (r: readonly Float64Array[], weights: readonly Float64Array[]) => {
        let sum = 0,
          points = 0;
        r.forEach((values, g) =>
          values.forEach((v, i) => {
            if (!weights[g]![i]) return;
            sum += v * v;
            points++;
          }),
        );
        return { rms: Math.sqrt(sum / points), points };
      };
      const lines = rms(
        residuals.lines,
        frames.map((frame) => frame.weight),
      );
      const stripes = rms(
        residuals.stripes,
        tracks.map((track) => track.weight),
      );
      const headingAt = (s: number) => {
        const { j, a } = node(s);
        return e.heading[j]! + a * (e.heading[j + 1]! - e.heading[j]!);
      };
      return {
        rule,
        start,
        cell,
        curvature: Array.from({ length: plan.count - 1 }, (_, q) =>
          shown.curvature[q] ? (e.heading[q + 1]! - e.heading[q]!) / cell : NaN,
        ),
        heightCell: profile.size,
        height: Array.from(e.height, (y, j) => (shown.height[j] ? y : NaN)),
        gradeWeight,
        frames: frames.map((frame, t) => {
          const variance = frameNormals(
            frame,
            frameModel(frame, e.depths[t]!, e.heading, e.thetas[t]!, e.laterals[t]!, f, start, cell),
          ).variance;
          const known = Number.isFinite(variance);
          return {
            frame: frame.frame,
            s: frame.s,
            heading: known ? e.thetas[t]! : NaN,
            yaw: known ? e.thetas[t]! - headingAt(frame.s) : NaN,
            error: Math.sqrt(variance),
            pitch: pitchOf(e.height, frame.s),
          };
        }),
        residual: lines,
        stripes: { rms: stripes.rms, readings: stripes.points, tracks: tracks.length, halfPeriod },
        rounds,
        converged,
      } satisfies PlanEstimate;
    },
  };
}

/**
 * A fit to one video's points and stripe edges under a pitch rule, the grades weighed only weakly, or with no rule the
 * plan alone, its heights held level: from a straight, level road and level headings by Gauss–Newton steps with
 * Marquardt's damping, each taken only when it lowers the weighted squares, each followed by new weights and merged
 * marks ([planProblem]), until none merge and the counted residuals move by less than a tenth of their deviations, or
 * after `limit` steps, unconverged. The stripe edges are followed on level road first; under a rule they are followed
 * again on the fit's profile, and the fit goes on from there. The fits are the points' evidence for the rule and the
 * start of the estimate under it ([solvePlans]).
 */
export function fitPlan(frames: readonly FramePoints[], camera: FootageCamera, rule: PitchRule | null, limit = 100) {
  const first = planProblem(frames, camera, rule);
  const fit = first.fit(first.initial(), 0, true, limit);
  if (!rule) return { problem: first, ...fit };
  const problem = planProblem(frames, camera, rule, fit.estimate.height);
  const again = problem.fit(problem.restart(fit.estimate), 0, true, limit);
  return { problem, ...again, rounds: fit.rounds + again.rounds };
}

export type PlanFit = ReturnType<typeof fitPlan>;

/**
 * A video's estimate under `road` from its plan alone (`flat`) and its fit with every height free under `level`, and the
 * same points and stripe edges under `level` at the grade weight `road` takes. The noise level is the free fit's: each
 * octave's deviation, of the points and of the stripe edges, scaled so that its χ² per degree of freedom (counted
 * readings less the frames' `θ`, the lines' `l`, the edges' stations, the shown cells' `κ` and the shown nodes' `Y`) is
 * 1. From the plan alone, the frames' squared grades are weighed as heavily as keeps the χ² within the degrees of
 * freedom without the nodes' `Y`: of the profiles that fit the readings at their noise level, the one with the least sum
 * of squared grades over the frames. The weight is found by bisecting its logarithm to a tenth of a decade, each
 * weight's estimate stepped from the plan alone at fixed weights.
 */
function weighedGrades(
  fits: { readonly flat: PlanFit; readonly level: PlanFit },
  camera: FootageCamera,
  limit: number,
) {
  const { flat, level } = fits;
  const sum = (values: Uint8Array) => values.reduce((a, v) => a + v, 0);
  const free = level.problem.counts(level.estimate);
  const scale =
    level.problem.squares(level.residuals) /
    (free.points - free.frameUnknowns - sum(free.curvature) - sum(free.height));
  const deviation = (stripe: boolean, k: number) => {
    const noise = stripe ? level.noise.stripes : level.noise.lines;
    return noise.get(k) ?? (stripe ? flat.noise.stripes : flat.noise.lines).get(k)!;
  };
  const setWeight = (weights: Float64Array, i: number, stripe: boolean, k: number) =>
    (weights[i] = 1 / (scale * deviation(stripe, k) ** 2));
  flat.problem.eachCounted(flat.residuals, (_, __, at) => {
    const k = flat.problem.octave(flat.estimate, at);
    if (at.stripe) {
      const track = flat.problem.followed.tracks[at.i]!;
      setWeight(track.weight, track.frames.indexOf(at.t), true, k);
    }
  });
  flat.problem.frames.forEach((frame, t) =>
    frame.weight.forEach((w, i) => {
      if (w) setWeight(frame.weight, i, false, flat.problem.octave(flat.estimate, { t, stripe: false, i }));
    }),
  );
  const shown = flat.problem.counts(flat.estimate);
  const target = shown.points - shown.frameUnknowns - sum(shown.curvature);
  // A unit weight weighs a frame's grade as its counted readings' mean weight weighs a reading.
  let weights = 0;
  flat.problem.eachCounted(flat.residuals, (_, w) => (weights += w));
  const unit = weights / shown.points;
  const atWeight = (rule: PitchRule, gradeWeight: number) => {
    const problem = planProblem(flat.problem.frames, camera, rule, flat.problem.followed);
    return { problem, gradeWeight, ...problem.fit(problem.restart(flat.estimate), gradeWeight, false, limit) };
  };
  const at = (exponent: number) => {
    const weighed = atWeight('road', unit * 10 ** exponent);
    return { ...weighed, within: weighed.problem.squares(weighed.residuals) <= target };
  };
  let low = -12,
    high = 12;
  let road = at(high);
  if (!road.within)
    while (high - low > 0.1) {
      const middle = (low + high) / 2,
        weighed = at(middle);
      if (weighed.within) {
        low = middle;
        road = weighed;
      } else high = middle;
    }
  return { road, heaviest: unit * 10 ** 12, level: () => atWeight('level', road.gradeWeight) };
}

/**
 * Each video's estimate under the footage model's pitch `rule` ([Pitch and grade](../../docs/footage.md#inconsistencies-of-the-original)):
 * under `level` its fit with every height free, under `road` its weighed grades ([weighedGrades]). The rule a person
 * wrote is checked against the one the rows ahead prefer by BIC over every video. Where `road` takes the heaviest grade
 * weight, the plan alone fits the readings at their noise level and the screen shows no grade there: the rules do not
 * differ. Where it takes less, both rules are set against each other at that weight, on the same readings and weights:
 * their unknowns and their grades' weight are alike, so BIC compares their χ². Frames along one stretch of road share
 * their errors, so the difference's standard error over every such video is clustered by the cell under the camera of
 * each reading's frame (Vuong's test of two models that do not nest), and a difference within three standard errors,
 * or no video showing a grade, is a tie, which takes `road`.
 */
export function solvePlans(
  videos: readonly { readonly flat: PlanFit; readonly level: PlanFit }[],
  camera: FootageCamera,
  rule: PitchRule,
  limit = 100,
) {
  const weighed = videos.map((fits) => weighedGrades(fits, camera, limit));
  let difference = 0,
    variance = 0,
    shown = 0;
  weighed.forEach(({ road, heaviest, level: atLevel }) => {
    if (road.gradeWeight === heaviest) return;
    shown++;
    const level = atLevel();
    const { start, cell, frames } = road.problem;
    const clusters = new Map<number, number>();
    const other = new Map<string, number>();
    level.problem.eachCounted(level.residuals, (r, _, at) => other.set(`${at.stripe} ${at.t} ${at.i}`, r));
    road.problem.eachCounted(road.residuals, (r, w, at) => {
      const l = other.get(`${at.stripe} ${at.t} ${at.i}`);
      if (l === undefined) return;
      const q = Math.floor((frames[at.t]!.s - start) / cell);
      const value = 0.5 * w * (r * r - l * l);
      difference += value;
      clusters.set(q, (clusters.get(q) ?? 0) + value);
    });
    for (const sum of clusters.values()) variance += sum * sum;
  });
  const standardError = Math.sqrt(variance);
  const judged: PitchRule = shown && difference > 3 * standardError ? 'level' : 'road';
  const plans =
    rule === 'level'
      ? videos.map(({ level }) =>
          level.problem.result(level.estimate, level.residuals, 0, level.rounds, level.converged),
        )
      : weighed.map(({ road }, v) =>
          road.problem.result(
            road.estimate,
            road.residuals,
            road.gradeWeight,
            videos[v]!.flat.rounds + road.rounds,
            road.converged,
          ),
        );
  return { plans, check: { rule: judged, agrees: judged === rule, shown, difference, standardError } };
}

/** A point's class: its octave of depth in metres (1–2 m, 2–4 m and so on). */
const octave = (d: number) => Math.floor(Math.log2(d));

/**
 * Merge a frame's marks that the estimate shows to be one line: marks whose counted points span depths apart and whose
 * laterals agree within three deviations (each lateral's precision, its points weighing by their inverse variance),
 * nearest first, as the dashes of a lane line share its lateral. Returns how many merged.
 */
function mergeMarks(
  frame: FramePoints,
  depths: Float64Array,
  laterals: Float64Array[],
  t: number,
  precision: Float64Array,
) {
  const count = frame.marks;
  if (count < 2) return 0;
  const near = new Float64Array(count).fill(Infinity),
    far = new Float64Array(count).fill(-Infinity);
  depths.forEach((d, i) => {
    if (!frame.weight[i]) return;
    const k = frame.mark[i]!;
    near[k] = Math.min(near[k]!, d);
    far[k] = Math.max(far[k]!, d);
  });
  const lateral = laterals[t]!;
  // Groups: their members' depth spans, lateral and precision.
  const group = Int32Array.from({ length: count }, (_, k) => k);
  const spans = Array.from({ length: count }, (_, k) => [[near[k]!, far[k]!]] as [number, number][]);
  const value = Float64Array.from(lateral),
    weight = Float64Array.from(precision);
  const pairs: { a: number; b: number; z: number }[] = [];
  for (let a = 0; a < count; a++)
    for (let b = a + 1; b < count; b++) {
      if (!(weight[a]! > 0) || !(weight[b]! > 0) || near[a]! > far[a]!) continue;
      if (near[b]! > far[b]!) continue;
      const z = Math.abs(value[a]! - value[b]!) / Math.sqrt(1 / weight[a]! + 1 / weight[b]!);
      if (z <= 3) pairs.push({ a, b, z });
    }
  pairs.sort((p, q) => p.z - q.z);
  const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k]!)));
  let merged = 0;
  for (const { a, b } of pairs) {
    const ra = root(a),
      rb = root(b);
    if (ra === rb) continue;
    const apart = spans[ra]!.every(([n1, f1]) => spans[rb]!.every(([n2, f2]) => f1 < n2 || f2 < n1));
    const z = Math.abs(value[ra]! - value[rb]!) / Math.sqrt(1 / weight[ra]! + 1 / weight[rb]!);
    if (!apart || z > 3) continue;
    group[rb] = ra;
    value[ra] = (value[ra]! * weight[ra]! + value[rb]! * weight[rb]!) / (weight[ra]! + weight[rb]!);
    weight[ra] = weight[ra]! + weight[rb]!;
    spans[ra]!.push(...spans[rb]!);
    merged++;
  }
  if (!merged) return 0;
  // Renumber the groups as the frame's marks.
  const index = new Int32Array(count).fill(-1);
  let next = 0;
  for (let k = 0; k < count; k++) if (index[root(k)] === -1) index[root(k)] = next++;
  frame.mark.forEach((k, i) => (frame.mark[i] = index[root(k)]!));
  const values = new Float64Array(next);
  for (let k = 0; k < count; k++) {
    values[index[root(k)]!] = value[root(k)]!;
  }
  frame.marks = next;
  laterals[t] = values;
  return merged;
}

/**
 * Along a frame's view, metre by metre from the camera: the heading relative to the camera's, `Φ(σ) = H(s_c + σ) − θ`,
 * sampled at each metre's middle, with the node `H` interpolates from there and the weight of the next.
 */
function view(frame: FramePoints, metres: number, heading: Float64Array, theta: number, start: number, cell: number) {
  const phi = new Float64Array(metres),
    node = new Int32Array(metres),
    weight = new Float64Array(metres);
  for (let m = 0; m < metres; m++) {
    const x = (frame.s + m + 0.5 - start) / cell,
      j = Math.min(heading.length - 2, Math.max(0, Math.floor(x)));
    node[m] = j;
    weight[m] = x - j;
    phi[m] = heading[j]! + (x - j) * (heading[j + 1]! - heading[j]!) - theta;
  }
  return { phi, node, weight };
}

/** The heading relative to the camera's at depth `d`, and the node and weight there. */
function headingAt(frame: FramePoints, d: number, heading: Float64Array, theta: number, start: number, cell: number) {
  const x = (frame.s + d - start) / cell,
    j = Math.min(heading.length - 2, Math.max(0, Math.floor(x)));
  return { phi: heading[j]! + (x - j) * (heading[j + 1]! - heading[j]!) - theta, j, a: x - j };
}

/**
 * A frame's residuals at the current estimate (NaN where a point has no depth), and the model's derivatives in the
 * frame's own unknowns: its heading `θ` and each point's mark's lateral `l`.
 */
function frameModel(
  frame: FramePoints,
  depths: Float64Array,
  heading: Float64Array,
  theta: number,
  lateral: Float64Array,
  f: number,
  start: number,
  cell: number,
) {
  const n = depths.length;
  const residual = new Float64Array(n).fill(NaN),
    dTheta = new Float64Array(n),
    dLateral = new Float64Array(n);
  let far = 0;
  depths.forEach((d) => Number.isFinite(d) && (far = Math.max(far, d)));
  if (!far) return { residual, dTheta, dLateral };
  const metres = Math.ceil(far) + 1;
  const { phi } = view(frame, metres, heading, theta, start, cell);
  const sinPrefix = new Float64Array(metres + 1),
    cosPrefix = new Float64Array(metres + 1);
  for (let m = 0; m < metres; m++) {
    sinPrefix[m + 1] = sinPrefix[m]! + Math.sin(phi[m]!);
    cosPrefix[m + 1] = cosPrefix[m]! + Math.cos(phi[m]!);
  }
  for (let i = 0; i < n; i++) {
    const d = depths[i]!;
    if (!Number.isFinite(d)) continue;
    const scale = f / d,
      l = lateral[frame.mark[i]!]!;
    const m = Math.floor(d),
      part = d - m,
      mm = Math.min(m, metres - 1);
    const end = headingAt(frame, d, heading, theta, start, cell).phi;
    residual[i] = frame.x[i]! - scale * (sinPrefix[m]! + part * Math.sin(phi[mm]!) + l * Math.cos(end));
    dTheta[i] = scale * (-(cosPrefix[m]! + part * Math.cos(phi[mm]!)) + l * Math.sin(end));
    dLateral[i] = scale * Math.cos(end);
  }
  return { residual, dTheta, dLateral };
}

/**
 * A frame's normal equations in its own unknowns at the round's weights: `θ`'s variance given the road's heading (each
 * mark's `l` eliminated; infinite where its points do not fix it) and each `l`'s precision.
 */
function frameNormals(frame: FramePoints, model: ReturnType<typeof frameModel>) {
  const { residual, dTheta, dLateral } = model;
  let tt = 0;
  const ll = new Float64Array(frame.marks),
    lt = new Float64Array(frame.marks);
  for (let i = 0; i < residual.length; i++) {
    const w = frame.weight[i]!;
    if (!w || !Number.isFinite(residual[i]!)) continue;
    const k = frame.mark[i]!;
    tt += w * dTheta[i]! * dTheta[i]!;
    ll[k] = ll[k]! + w * dLateral[i]! * dLateral[i]!;
    lt[k] = lt[k]! + w * dLateral[i]! * dTheta[i]!;
  }
  let reduced = tt;
  ll.forEach((p, k) => {
    if (p > 0) reduced -= (lt[k]! * lt[k]!) / p;
  });
  return { variance: reduced > 1e-12 * tt ? 1 / reduced : Infinity, precision: ll };
}
