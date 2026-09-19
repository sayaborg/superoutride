import { guidePathToWorld } from '../core/guide-curve.js';
import { guideEnvelopeAt } from '../core/guide-envelope.js';
import { rasterPathToWorld } from '../core/raster-path.js';
import { wrapAngle } from '../core/math.js';
import {
  compilePlanarTransform,
  composePlanarTransforms,
  invertPlanarTransform,
  transformPlanarPoint,
  type PlanarTransform,
} from '../core/planar-transform.js';
import { courseBandAt } from '../course/course-bands.js';
import { CourseInputError, courseFailure, courseSuccess } from '../course/course-diagnostics.js';
import { coursePortLateral } from '../compiler/course-links.js';
import type { CourseOccurrence, CourseOccurrenceHistory } from './course-occurrence.js';

interface Extent {
  readonly behind: number;
  readonly ahead: number;
}
interface ViewDemand {
  /** Closed admitted source-chainage envelope in the active occurrence, plus maximum forward step. */
  readonly pose: { readonly minS: number; readonly maxS: number; readonly maxAdvance: number };
  readonly consumers: {
    readonly cameraRender: Extent;
    readonly contact: Extent;
    readonly driverLookahead: Extent;
    readonly reverseRecovery: Extent;
  };
}
interface Mapping {
  readonly occurrence: CourseOccurrence;
  readonly viewFromSource: PlanarTransform;
  readonly sourceAnchorS: number;
  readonly viewAnchorS: number;
  readonly sourceLateralOrigin: number;
}
const consumerNames = ['cameraRender', 'contact', 'driverLookahead', 'reverseRecovery'] as const;
const identity = compilePlanarTransform({ x: 0, z: 0, heading: 0 }, { x: 0, z: 0, heading: 0 });

function numeric(value: number, label: string) {
  if (typeof value !== 'number') throw new TypeError(`${label} must be numeric`);
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}
const viewS = (mapping: Mapping, sourceS: number) => mapping.viewAnchorS + (sourceS - mapping.sourceAnchorS);

/**
 * Bounded source geometry adapters in the active occurrence's basis. Neither content continuity nor
 * physical transition readiness is implied. History comes from the traversal owner; no ID joins.
 */
export function createCourseGeometryView(history: CourseOccurrenceHistory, demand: ViewDemand) {
  const { occurrences, active } = history;
  const index = occurrences.indexOf(active);
  if (index < 0) throw new RangeError('Active occurrence must belong to retained history');
  for (let i = 1; i < occurrences.length; i += 1) {
    const previous = occurrences[i - 1]!,
      current = occurrences[i]!;
    if (
      !current.incoming ||
      !previous.section.outgoing.includes(current.incoming) ||
      current.incoming.destination.section !== current.section ||
      current.ordinal !== previous.ordinal + 1
    )
      throw new RangeError('History must preserve canonical visited Link references and occurrence order');
  }
  const { minS, maxS, maxAdvance } = demand.pose;
  for (const key of ['minS', 'maxS', 'maxAdvance'] as const) numeric(demand.pose[key], key);
  if (!(minS >= 0 && maxS >= minS && maxS <= active.section.raster.length && maxAdvance >= 0))
    throw new RangeError('Pose envelope must be ordered inside the active source with nonnegative advance');
  const requirements = consumerNames.map((consumer) => {
    const extent = demand.consumers[consumer];
    if (!extent) throw new TypeError(`Missing consumer extent: ${consumer}`);
    numeric(extent.behind, `${consumer}.behind`);
    numeric(extent.ahead, `${consumer}.ahead`);
    if (extent.behind < 0 || extent.ahead < 0) throw new RangeError('Consumer extents must be nonnegative');
    const start = minS - extent.behind,
      end = maxS + maxAdvance + extent.ahead;
    if (![start, end].every(Number.isFinite)) throw new RangeError('Consumer interval must be representable');
    return Object.freeze({ consumer, start, end });
  });
  const start = Math.min(...requirements.map((r) => r.start)),
    end = Math.max(...requirements.map((r) => r.end));
  if (!(end > start)) throw new RangeError('A view must have positive extent');
  const mappings: Mapping[] = new Array(occurrences.length);
  mappings[index] = {
    occurrence: active,
    viewFromSource: identity,
    sourceAnchorS: 0,
    viewAnchorS: 0,
    sourceLateralOrigin: 0,
  };
  for (let i = index + 1; i < occurrences.length; i += 1) {
    const occurrence = occurrences[i]!,
      link = occurrence.incoming!,
      previous = mappings[i - 1]!;
    mappings[i] = {
      occurrence,
      viewFromSource: composePlanarTransforms(
        previous.viewFromSource,
        invertPlanarTransform(link.destinationFromSource),
      ),
      sourceAnchorS: link.destination.anchor.s,
      viewAnchorS: viewS(previous, link.source.anchor.s),
      sourceLateralOrigin:
        previous.sourceLateralOrigin + coursePortLateral(link.destination) - coursePortLateral(link.source),
    };
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const occurrence = occurrences[i]!,
      next = mappings[i + 1]!,
      link = next.occurrence.incoming!;
    mappings[i] = {
      occurrence,
      viewFromSource: composePlanarTransforms(next.viewFromSource, link.destinationFromSource),
      sourceAnchorS: link.source.anchor.s,
      viewAnchorS: viewS(next, link.destination.anchor.s),
      sourceLateralOrigin:
        next.sourceLateralOrigin + coursePortLateral(link.source) - coursePortLateral(link.destination),
    };
  }
  const first = mappings[0]!,
    last = mappings.at(-1)!;
  const availableStart = viewS(first, first.occurrence.incoming?.destination.anchor.s ?? 0);
  // An unresolved successor never silently reads a parent's runout as the selected next road.
  const availableEnd = viewS(
    last,
    Math.min(
      last.occurrence.section.raster.length,
      ...last.occurrence.section.outgoing.map((link) => link.source.anchor.s),
    ),
  );
  for (const required of requirements) {
    if (required.start < availableStart || required.end > availableEnd)
      return courseFailure<never>(
        new CourseInputError(
          'semantic_compile_failure',
          `/consumers/${required.consumer}`,
          `${required.consumer} requires [${required.start}, ${required.end}] for pose [${minS}, ${maxS}] + step ${maxAdvance}; retained/selected geometry covers [${availableStart}, ${availableEnd}]`,
        ),
      );
  }
  try {
    const length = end - start;
    const cuts = [
      availableStart,
      ...mappings.slice(1).map((mapping) => viewS(mapping, mapping.occurrence.incoming!.destination.anchor.s)),
      availableEnd,
    ].map((s) => s - start);
    if (cuts.some((s, i) => !Number.isFinite(s) || (i > 0 && s <= cuts[i - 1]!)))
      throw new CourseInputError(
        'semantic_compile_failure',
        '/view',
        'Visited seam spans must remain representable in the view ruler',
      );
    const spans = mappings.flatMap((original, i) => {
      const mapping = Object.freeze({ ...original, viewAnchorS: original.viewAnchorS - start });
      const section = mapping.occurrence.section;
      const sourceStart = mapping.occurrence.incoming?.destination.anchor.s ?? 0;
      const sourceEnd =
        i + 1 < mappings.length
          ? mappings[i + 1]!.occurrence.incoming!.source.anchor.s
          : Math.min(section.raster.length, ...section.outgoing.map((link) => link.source.anchor.s));
      const a = Math.max(0, cuts[i]!),
        b = Math.min(length, cuts[i + 1]!);
      if (b < a) return [];
      // Preserve classification stations. Continuous Core geometry retains its own sampling tolerance;
      // nearby roundoff-size fillet joins are not extra Band ownership boundaries.
      const stations = new Map<number, number>();
      for (const s of new Set([
        sourceStart,
        sourceEnd,
        ...section.boundaries.flatMap((boundary) => boundary.knots.map((knot) => knot.anchor.s)),
        ...section.bandPartition.bands.flatMap((band) => [band.start.s, band.end.s]),
      ])) {
        if (s < sourceStart || s > sourceEnd) continue;
        const mapped = s === sourceStart ? cuts[i]! : s === sourceEnd ? cuts[i + 1]! : viewS(mapping, s);
        if (mapped < a || mapped > b) continue;
        if (stations.has(mapped) && stations.get(mapped) !== s)
          throw new CourseInputError(
            'semantic_compile_failure',
            '/view',
            'Distinct source stations collapse in the view ruler',
          );
        stations.set(mapped, s);
      }
      const address = (s: number, l: number) =>
        Object.freeze({
          occurrence: mapping.occurrence,
          sourceS: stations.get(s) ?? mapping.sourceAnchorS + (s - mapping.viewAnchorS),
          sourceL: l + mapping.sourceLateralOrigin,
        });
      return [
        Object.freeze({
          start: a,
          end: b,
          mapping,
          address,
        }),
      ];
    });
    const resolve = (s: number, l: number) => {
      numeric(s, 'View chainage');
      numeric(l, 'View lateral');
      if (s < 0 || s > length) throw new RangeError('Query must be inside the finite view');
      let low = 0,
        high = spans.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (spans[middle]!.start <= s) low = middle + 1;
        else high = middle;
      }
      const span = spans[low - 1];
      if (!span || s > span.end) throw new Error('Validated view has a coverage hole');
      return { span, address: span.address(s, l) };
    };
    const read = (kind: 'guide' | 'raster', s: number, l: number) => {
      const { span, address } = resolve(s, l);
      const section = address.occurrence.section;
      const point =
        kind === 'guide'
          ? guidePathToWorld(section.guide, address.sourceS, address.sourceL)
          : rasterPathToWorld(section.raster, address.sourceS, address.sourceL);
      const transform = span.mapping.viewFromSource;
      return {
        ...transformPlanarPoint(transform, point),
        s,
        l,
        heading: wrapAngle(point.heading + Math.atan2(transform.sine, transform.cosine)),
      };
    };
    return courseSuccess(
      Object.freeze({
        scope: 'geometry-only' as const,
        frame: active,
        length,
        pose: Object.freeze({ minS: minS - start, maxS: maxS - start, maxAdvance }),
        coverage: Object.freeze(
          requirements.map((r) => Object.freeze({ consumer: r.consumer, start: r.start - start, end: r.end - start })),
        ),
        spans: Object.freeze(spans.map(({ start, end, mapping }) => Object.freeze({ start, end, ...mapping }))),
        address: (s: number, l: number) => resolve(s, l).address,
        // These ordinary point readers expose no topology, occurrence, assets or CompiledCourse.
        geometry: Object.freeze({
          length,
          rasterAt: (s: number, l: number) => read('raster', s, l),
          guideAt: (s: number, l: number) => read('guide', s, l),
          guideBoundsAt(s: number) {
            const { span, address } = resolve(s, 0);
            const limit = guideEnvelopeAt(address.occurrence.section.guide.envelope, address.sourceS);
            return { left: -limit - span.mapping.sourceLateralOrigin, right: limit - span.mapping.sourceLateralOrigin };
          },
        }),
        bandAt(s: number, l: number) {
          const { span, address } = resolve(s, l);
          return courseBandAt(
            address.occurrence.section.bandPartition,
            address.sourceS,
            l,
            span.mapping.sourceLateralOrigin,
          );
        },
      }),
    );
  } catch (error) {
    if (error instanceof CourseInputError) return courseFailure<never>(error);
    throw error;
  }
}
