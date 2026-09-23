import {
  compilePlanarTransform,
  composePlanarTransforms,
  invertPlanarTransform,
  type PlanarTransform,
} from '../core/planar-transform.js';
import { courseRegionAt } from './course-regions.js';
import { courseCutLateral } from './compiler/course-links.js';
import type { CourseOccurrence, CourseOccurrenceHistory } from './course-occurrence.js';

interface Extent {
  readonly behind: number;
  readonly ahead: number;
}
interface CourseViewDemand {
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
class ViewAdmissionError extends Error {}
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
export function createCourseGeometryView(history: CourseOccurrenceHistory, demand: CourseViewDemand | 'retained') {
  if (!history || !Array.isArray(history.occurrences) || !Array.isArray(history.selected))
    throw new TypeError('View requires separate visited history and selected occurrences');
  const { active } = history;
  const occurrences = [...history.occurrences, ...history.selected];
  const index = history.occurrences.indexOf(active);
  if (index < 0) throw new RangeError('Active occurrence must belong to retained history');
  for (let i = 1; i < occurrences.length; i += 1) {
    const previous = occurrences[i - 1]!,
      current = occurrences[i]!;
    if (
      !current.incoming ||
      !previous.section.outgoing.includes(current.incoming) ||
      current.incoming.to.section !== current.section ||
      current.ordinal !== previous.ordinal + 1
    )
      throw new RangeError('History must preserve canonical visited Link references and occurrence order');
  }
  const retained = demand === 'retained';
  if (demand === 'retained') {
    const zero = { behind: 0, ahead: 0 };
    demand = {
      pose: { minS: 0, maxS: active.section.raster.length, maxAdvance: 0 },
      consumers: { cameraRender: zero, contact: zero, driverLookahead: zero, reverseRecovery: zero },
    };
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
  let start = Math.min(...requirements.map((r) => r.start)),
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
      sourceAnchorS: link.to.anchor.s,
      viewAnchorS: viewS(previous, link.from.anchor.s),
      sourceLateralOrigin: previous.sourceLateralOrigin + courseCutLateral(link.to) - courseCutLateral(link.from),
    };
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const occurrence = occurrences[i]!,
      next = mappings[i + 1]!,
      link = next.occurrence.incoming!;
    mappings[i] = {
      occurrence,
      viewFromSource: composePlanarTransforms(next.viewFromSource, link.destinationFromSource),
      sourceAnchorS: link.from.anchor.s,
      viewAnchorS: viewS(next, link.to.anchor.s),
      sourceLateralOrigin: next.sourceLateralOrigin + courseCutLateral(link.from) - courseCutLateral(link.to),
    };
  }
  const first = mappings[0]!,
    last = mappings.at(-1)!;
  const availableStart = viewS(first, first.occurrence.incoming?.to.anchor.s ?? 0);
  // An unresolved successor never silently reads a parent's runout as the selected next road.
  const availableEnd = viewS(
    last,
    Math.min(
      last.occurrence.section.raster.length,
      ...last.occurrence.section.outgoing.map((link) => link.from.anchor.s),
    ),
  );
  if (retained) {
    start = availableStart;
    end = availableEnd;
    for (let i = 0; i < requirements.length; i += 1)
      requirements[i] = Object.freeze({ consumer: consumerNames[i]!, start, end });
  }
  for (const required of requirements) {
    if (required.start < availableStart || required.end > availableEnd)
      return Object.freeze({
        ok: false as const,
        reason: 'coverage_gap' as const,
        consumer: required.consumer,
        required: Object.freeze({ start: required.start, end: required.end }),
        available: Object.freeze({ start: availableStart, end: availableEnd }),
        message: `${required.consumer} requires [${required.start}, ${required.end}] for pose [${minS}, ${maxS}] + step ${maxAdvance}; retained/selected geometry covers [${availableStart}, ${availableEnd}]`,
      });
  }
  try {
    const length = end - start;
    const frameCuts = [
      availableStart,
      ...mappings.slice(1).map((mapping) => viewS(mapping, mapping.occurrence.incoming!.to.anchor.s)),
      availableEnd,
    ];
    const cuts = frameCuts.map((s) => s - start);
    if (cuts.some((s, i) => !Number.isFinite(s) || (i > 0 && s <= cuts[i - 1]!)))
      throw new ViewAdmissionError('Selected/visited seam spans must remain representable in the view ruler');
    const spans = mappings.flatMap((original, i) => {
      const mapping = Object.freeze({ ...original, viewAnchorS: original.viewAnchorS - start });
      const section = mapping.occurrence.section;
      const sourceStart = mapping.occurrence.incoming?.to.anchor.s ?? 0;
      const sourceEnd =
        i + 1 < mappings.length
          ? mappings[i + 1]!.occurrence.incoming!.from.anchor.s
          : Math.min(section.raster.length, ...section.outgoing.map((link) => link.from.anchor.s));
      const a = Math.max(0, cuts[i]!),
        b = Math.min(length, cuts[i + 1]!);
      if (b < a) return [];
      // Preserve classification stations. Continuous Core geometry retains its own sampling tolerance;
      // nearby roundoff-size fillet joins are not extra Region ownership boundaries.
      const stations = new Map<number, number>();
      const frameStations = new Map<number, number>();
      for (const s of new Set([
        sourceStart,
        sourceEnd,
        ...section.boundaries.flatMap((boundary) => boundary.knots.map((knot) => knot.anchor.s)),
        ...section.regionPartition.regions.flatMap((region) => [region.start.s, region.end.s]),
      ])) {
        if (s < sourceStart || s > sourceEnd) continue;
        const mapped = s === sourceStart ? cuts[i]! : s === sourceEnd ? cuts[i + 1]! : viewS(mapping, s);
        if (mapped < a || mapped > b) continue;
        if (stations.has(mapped) && stations.get(mapped) !== s)
          throw new ViewAdmissionError('Distinct source stations collapse in the view ruler');
        stations.set(mapped, s);
        const frameStation =
          s === sourceStart ? frameCuts[i]! : s === sourceEnd ? frameCuts[i + 1]! : viewS(original, s);
        if (frameStations.has(frameStation) && frameStations.get(frameStation) !== s)
          throw new ViewAdmissionError('Distinct source stations collapse in the active-frame ruler');
        frameStations.set(frameStation, s);
      }
      const address = (s: number, l: number) =>
        Object.freeze({
          occurrence: mapping.occurrence,
          sourceS: stations.get(s) ?? mapping.sourceAnchorS + (s - mapping.viewAnchorS),
          sourceL: l + mapping.sourceLateralOrigin,
        });
      const sourceChainageInFrame = (s: number) =>
        frameStations.get(s) ?? original.sourceAnchorS + (s - original.viewAnchorS);
      const addressInFrame = (s: number, l: number) =>
        Object.freeze({
          occurrence: mapping.occurrence,
          sourceS: sourceChainageInFrame(s),
          sourceL: l + original.sourceLateralOrigin,
        });
      return [
        Object.freeze({
          start: a,
          end: b,
          mapping,
          address,
          addressInFrame,
          sourceChainageInFrame,
          frameStart: Math.max(start, frameCuts[i]!),
          frameEnd: Math.min(end, frameCuts[i + 1]!),
          frameAnchorS: original.viewAnchorS,
          sourceOwnership: Object.freeze({ start: sourceStart, end: sourceEnd }),
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
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        scope: 'geometry-only' as const,
        frame: active,
        length,
        /** Stable active-frame ruler; moving a bounded window does not rebase actor observations. */
        activeRange: Object.freeze({ start, end }),
        availableRange: Object.freeze({ start: availableStart, end: availableEnd }),
        pose: Object.freeze({ minS: minS - start, maxS: maxS - start, maxAdvance }),
        coverage: Object.freeze(
          requirements.map((r) => Object.freeze({ consumer: r.consumer, start: r.start - start, end: r.end - start })),
        ),
        spans: Object.freeze(
          spans.map(
            ({
              start,
              end,
              mapping,
              addressInFrame,
              sourceChainageInFrame,
              frameStart,
              frameEnd,
              frameAnchorS,
              sourceOwnership,
            }) =>
              Object.freeze({
                start,
                end,
                ...mapping,
                frameStart,
                frameEnd,
                frameAnchorS,
                sourceRange: Object.freeze({
                  start: addressInFrame(frameStart, 0).sourceS,
                  end: addressInFrame(frameEnd, 0).sourceS,
                }),
                sourceOwnership,
                sourceChainageInFrame,
              }),
          ),
        ),
        address: (s: number, l: number) => resolve(s, l).address,
        addressInFrame(s: number, l: number) {
          numeric(s, 'Active-frame chainage');
          numeric(l, 'Active-frame lateral');
          if (s < start || s > end) throw new RangeError('Query must be inside the active-frame window');
          let index = spans.length - 1;
          while (index >= 0 && spans[index]!.frameStart > s) index -= 1;
          const span = spans[index];
          if (!span || s > span.frameEnd) throw new Error('Validated frame view has a coverage hole');
          return span.addressInFrame(s, l);
        },
        regionAt(s: number, l: number) {
          const { span, address } = resolve(s, l);
          return courseRegionAt(
            address.occurrence.section.regionPartition,
            address.sourceS,
            l,
            span.mapping.sourceLateralOrigin,
          );
        },
      }),
    });
  } catch (error) {
    if (error instanceof ViewAdmissionError)
      return Object.freeze({ ok: false as const, reason: 'unrepresentable_view' as const, message: error.message });
    throw error;
  }
}

export type CourseGeometryView = Extract<ReturnType<typeof createCourseGeometryView>, { ok: true }>['value'];
