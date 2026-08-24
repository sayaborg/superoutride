import type { RasterPath } from '../core/course.js';
import {
  compileGuidePath,
  type GuideCompileOptions,
  type GuidePath,
} from '../core/guide-curve.js';
import {
  unfoldCircuitRasterPath,
  type CircuitTopology,
} from '../gameplay/circuit-topology.js';
import type { SurfaceMapReader, SurfaceSample } from '../physics/surface-map.js';
import type {
  BakedGroundMapChunkMetadata,
  BakedGroundMapLevelMetadata,
  BakedGroundMapMetadata,
  BakedGroundMapReader,
  BakedGroundMapSample,
} from '../visual/baked-ground-map.js';
import type {
  HeightNode,
  HeightProfileReader,
  HeightSample,
} from '../visual/height-profile.js';
import type { VisualProfileReader, VisualSection } from '../visual/visual-profile.js';

const EPSILON = 1e-8;

/** One explicitly authored open lap worth of runtime source data. */
export interface CircuitLapRuntimeSources {
  readonly height: HeightProfileReader;
  readonly visual: VisualProfileReader;
  readonly surface: SurfaceMapReader;
  readonly ground?: BakedGroundMapReader;
}

/**
 * Finite open runtime view of an upper-level circuit.
 *
 * Every downstream consumer sees ordinary monotonically increasing window
 * chainage in [0,length]. Only this integration layer maps that ruler back to
 * one-lap source chainage. Topological winding remains separate from race-lap
 * validation.
 */
export interface CircuitRuntimeWindow {
  readonly topology: CircuitTopology;
  readonly startWinding: number;
  readonly repeatCount: number;
  readonly startUnwrappedS: number;
  readonly endUnwrappedS: number;
  readonly length: number;
  readonly raster: RasterPath;
  readonly guide: GuidePath;
  readonly height: HeightProfileReader;
  readonly visual: VisualProfileReader;
  readonly surface: SurfaceMapReader;
  readonly ground?: BakedGroundMapReader;
}

interface WindowSourcePosition {
  readonly lapIndex: number;
  readonly lapOffsetS: number;
  readonly sourceS: number;
}

/**
 * Compile a finite seam-aligned circuit window into ordinary open runtime
 * primitives. No renderer, camera, vehicle or RouteDag code is involved.
 */
export function compileCircuitRuntimeWindow(
  topology: CircuitTopology,
  startWinding: number,
  repeatCount: number,
  guideOptions: GuideCompileOptions,
  sources: CircuitLapRuntimeSources,
): CircuitRuntimeWindow {
  assertInteger(startWinding, 'circuit window startWinding');
  assertPositiveInteger(repeatCount, 'circuit window repeatCount');
  validateLapSourceLengths(topology, sources);
  validateHeightSeam(topology, sources.height);

  const raster = unfoldCircuitRasterPath(topology, repeatCount);
  const guide = compileGuidePath(raster, guideOptions);
  const length = topology.lapLength * repeatCount;
  const startUnwrappedS = topology.lapLength * startWinding;
  const endUnwrappedS = startUnwrappedS + length;

  const height = new CircuitHeightWindow(topology, repeatCount, sources.height);
  const visual = new CircuitVisualWindow(topology, repeatCount, sources.visual);
  const surface = new CircuitSurfaceWindow(topology, repeatCount, sources.surface);
  const ground = sources.ground === undefined
    ? undefined
    : new CircuitBakedGroundMapWindow(topology, repeatCount, sources.ground);

  return Object.freeze({
    topology,
    startWinding,
    repeatCount,
    startUnwrappedS,
    endUnwrappedS,
    length,
    raster,
    guide,
    height,
    visual,
    surface,
    ground,
  });
}

/** Convert topology-owned continuous chainage to the finite open window ruler. */
export function circuitUnwrappedToWindowChainage(
  window: CircuitRuntimeWindow,
  sUnwrapped: number,
): number {
  assertFinite(sUnwrapped, 'circuit unwrapped chainage');
  return checkedWindowChainage(window, sUnwrapped - window.startUnwrappedS);
}

/** Convert finite open window chainage back to topology-owned continuous chainage. */
export function circuitWindowToUnwrappedChainage(
  window: CircuitRuntimeWindow,
  sWindow: number,
): number {
  return window.startUnwrappedS + checkedWindowChainage(window, sWindow);
}

/**
 * Map finite open window chainage to the one-lap source domain.
 * Interior seams belong to the next lap (source s=0); the final open endpoint
 * remains source s=L so endpoint inspection never invents wrap semantics.
 */
export function circuitWindowToLapSourceChainage(
  window: Pick<CircuitRuntimeWindow, 'topology' | 'repeatCount' | 'length'>,
  sWindow: number,
): number {
  return resolveWindowSourcePosition(
    window.topology,
    window.repeatCount,
    window.length,
    sWindow,
  ).sourceS;
}

class CircuitHeightWindow implements HeightProfileReader {
  readonly courseLength: number;
  readonly nodes: readonly HeightNode[];

  constructor(
    private readonly topology: CircuitTopology,
    private readonly repeatCount: number,
    private readonly source: HeightProfileReader,
  ) {
    this.courseLength = topology.lapLength * repeatCount;
    this.nodes = Object.freeze(repeatHeightNodes(source, topology.lapLength, repeatCount));
  }

  sampleRender(s: number): HeightSample {
    const position = this.resolve(s);
    const sample = this.source.sampleRender(position.sourceS);
    const sourceSegmentCount = Math.max(1, this.source.nodes.length - 1);
    return {
      ...sample,
      segmentIndex: position.lapIndex * sourceSegmentCount + sample.segmentIndex,
      sStart: position.lapOffsetS + sample.sStart,
      sEnd: position.lapOffsetS + sample.sEnd,
    };
  }

  samplePhysics(s: number): number {
    return this.source.samplePhysics(this.resolve(s).sourceS);
  }

  sampleCamera(s: number): number {
    return this.source.sampleCamera(this.resolve(s).sourceS);
  }

  distanceToNextRenderNode(s: number): number {
    const checked = checkedOpenChainage(s, this.courseLength, 'circuit height window');
    if (checked === this.courseLength) return 0;
    const position = this.resolve(checked);
    return Math.min(
      this.source.distanceToNextRenderNode(position.sourceS),
      this.courseLength - checked,
    );
  }

  private resolve(s: number): WindowSourcePosition {
    return resolveWindowSourcePosition(this.topology, this.repeatCount, this.courseLength, s);
  }
}

class CircuitVisualWindow implements VisualProfileReader {
  readonly courseLength: number;

  constructor(
    private readonly topology: CircuitTopology,
    private readonly repeatCount: number,
    private readonly source: VisualProfileReader,
  ) {
    this.courseLength = topology.lapLength * repeatCount;
  }

  sample(s: number): VisualSection {
    return this.source.sample(this.resolve(s).sourceS);
  }

  distanceToNextSection(s: number): number {
    const checked = checkedOpenChainage(s, this.courseLength, 'circuit visual window');
    if (checked === this.courseLength) return 0;
    const position = this.resolve(checked);
    return Math.min(
      this.source.distanceToNextSection(position.sourceS),
      this.courseLength - checked,
    );
  }

  private resolve(s: number): WindowSourcePosition {
    return resolveWindowSourcePosition(this.topology, this.repeatCount, this.courseLength, s);
  }
}

class CircuitSurfaceWindow implements SurfaceMapReader {
  readonly courseLength: number;

  constructor(
    private readonly topology: CircuitTopology,
    private readonly repeatCount: number,
    private readonly source: SurfaceMapReader,
  ) {
    this.courseLength = topology.lapLength * repeatCount;
  }

  sample(s: number, l: number): SurfaceSample {
    const sourceS = resolveWindowSourcePosition(
      this.topology,
      this.repeatCount,
      this.courseLength,
      s,
    ).sourceS;
    return this.source.sample(sourceS, l);
  }
}

/**
 * Virtual finite baked GroundMap. Metadata truthfully describes N repeated rows
 * while payload ids are shared with the one-lap source, so no texture bytes are
 * duplicated and stage/runtime length validation remains exact.
 */
class CircuitBakedGroundMapWindow implements BakedGroundMapReader {
  readonly metadata: BakedGroundMapMetadata;
  readonly courseLength: number;

  constructor(
    private readonly topology: CircuitTopology,
    private readonly repeatCount: number,
    private readonly source: BakedGroundMapReader,
  ) {
    this.courseLength = topology.lapLength * repeatCount;
    this.metadata = repeatBakedGroundMapMetadata(source.metadata, repeatCount, this.courseLength);
  }

  get kMax(): number {
    return this.source.kMax;
  }

  selectLevel(deltaSEffective: number): number {
    return this.source.selectLevel(deltaSEffective);
  }

  sample(s: number, l: number, deltaSEffective: number): BakedGroundMapSample {
    return this.source.sample(this.sourceS(s), l, deltaSEffective);
  }

  sampleAtLevel(s: number, l: number, levelIndex: number): number {
    return this.source.sampleAtLevel(this.sourceS(s), l, levelIndex);
  }

  texelCenter(levelIndex: number, row: number, column: number): { s: number; l: number } {
    const level = this.metadata.levels[levelIndex];
    if (!level) throw new RangeError('GroundMap level outside circuit window pyramid');
    if (row < 0 || row >= level.chainageTexels || column < 0 || column >= level.lateralTexels) {
      throw new RangeError('GroundMap texel outside circuit window level');
    }
    return {
      s: (row + 0.5) * this.metadata.courseLength / level.chainageTexels,
      l: -this.metadata.groundLeft
        + (column + 0.5) * (this.metadata.groundLeft + this.metadata.groundRight) / level.lateralTexels,
    };
  }

  private sourceS(s: number): number {
    return resolveWindowSourcePosition(
      this.topology,
      this.repeatCount,
      this.courseLength,
      s,
    ).sourceS;
  }
}

function repeatBakedGroundMapMetadata(
  source: BakedGroundMapMetadata,
  repeatCount: number,
  windowLength: number,
): BakedGroundMapMetadata {
  const levels: BakedGroundMapLevelMetadata[] = source.levels.map((level) => {
    const chunks: BakedGroundMapChunkMetadata[] = [];
    for (let lap = 0; lap < repeatCount; lap += 1) {
      const rowOffset = lap * level.chainageTexels;
      for (const chunk of level.chunks) {
        chunks.push(Object.freeze({
          rowStart: rowOffset + chunk.rowStart,
          rowCount: chunk.rowCount,
          payloadId: chunk.payloadId,
        }));
      }
    }
    return Object.freeze({
      ...level,
      chainageTexels: level.chainageTexels * repeatCount,
      chunks: Object.freeze(chunks),
    });
  });

  return Object.freeze({
    ...source,
    courseLength: windowLength,
    levels: Object.freeze(levels),
    uncompressedRgbaBytes: source.uncompressedRgbaBytes * repeatCount,
  });
}

function validateLapSourceLengths(
  topology: CircuitTopology,
  sources: CircuitLapRuntimeSources,
): void {
  assertSameLength(sources.height.courseLength, topology.lapLength, 'height');
  assertSameLength(sources.visual.courseLength, topology.lapLength, 'visual');
  if (sources.ground) {
    assertSameLength(sources.ground.metadata.courseLength, topology.lapLength, 'GroundMap');
  }
}

function validateHeightSeam(topology: CircuitTopology, height: HeightProfileReader): void {
  const startRender = height.sampleRender(0).y;
  const endRender = height.sampleRender(topology.lapLength).y;
  const startPhysics = height.samplePhysics(0);
  const endPhysics = height.samplePhysics(topology.lapLength);
  const startCamera = height.sampleCamera(0);
  const endCamera = height.sampleCamera(topology.lapLength);

  for (const [label, a, b] of [
    ['render', startRender, endRender],
    ['physics', startPhysics, endPhysics],
    ['camera', startCamera, endCamera],
  ] as const) {
    if (Math.abs(a - b) > EPSILON) {
      throw new Error(`circuit height ${label} seam must return to the same world height`);
    }
  }
}

function repeatHeightNodes(
  source: HeightProfileReader,
  lapLength: number,
  repeatCount: number,
): HeightNode[] {
  if (source.nodes.length < 2) throw new Error('circuit height source requires at least two nodes');
  const first = source.nodes[0]!;
  const last = source.nodes[source.nodes.length - 1]!;
  if (Math.abs(first.s) > EPSILON || Math.abs(last.s - lapLength) > EPSILON) {
    throw new Error('circuit height source nodes must explicitly cover [0,L]');
  }

  const nodes: HeightNode[] = [];
  for (let lap = 0; lap < repeatCount; lap += 1) {
    const offset = lap * lapLength;
    for (let i = 0; i < source.nodes.length; i += 1) {
      if (lap > 0 && i === 0) continue;
      const node = source.nodes[i]!;
      nodes.push({ s: offset + node.s, y: node.y });
    }
  }
  return nodes;
}

function resolveWindowSourcePosition(
  topology: CircuitTopology,
  repeatCount: number,
  windowLength: number,
  sWindow: number,
): WindowSourcePosition {
  const checked = checkedOpenChainage(sWindow, windowLength, 'circuit runtime window');
  const lapLength = topology.lapLength;

  if (checked === windowLength) {
    const lapIndex = repeatCount - 1;
    return {
      lapIndex,
      lapOffsetS: lapIndex * lapLength,
      sourceS: lapLength,
    };
  }

  let lapIndex = Math.floor(checked / lapLength);
  if (lapIndex >= repeatCount) lapIndex = repeatCount - 1;
  const lapOffsetS = lapIndex * lapLength;
  let sourceS = checked - lapOffsetS;
  if (Math.abs(sourceS) <= EPSILON) sourceS = 0;

  return { lapIndex, lapOffsetS, sourceS };
}

function checkedWindowChainage(window: Pick<CircuitRuntimeWindow, 'length'>, s: number): number {
  return checkedOpenChainage(s, window.length, 'circuit window');
}

function checkedOpenChainage(s: number, length: number, label: string): number {
  assertFinite(s, `${label} chainage`);
  if (s < -EPSILON || s > length + EPSILON) {
    throw new RangeError(`${label} chainage is outside [0, length]`);
  }
  if (Math.abs(s) <= EPSILON) return 0;
  if (Math.abs(s - length) <= EPSILON) return length;
  return s;
}

function assertSameLength(actual: number, expected: number, label: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > EPSILON) {
    throw new RangeError(`circuit ${label} source length must equal topology lapLength`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`);
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer`);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}
