import { wrapAngle } from '../core/math.js';
import { courseBandAt } from '../course/course-bands.js';
import { compileCourseOverlapStations } from '../course/course-overlap-stations.js';
import {
  CourseInputError,
  CourseQualificationError,
  courseFailures,
  courseSuccess,
  requireCourse,
} from '../course/course-diagnostics.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../graphics/sprite.js';
import type { CoursePaint, CoursePresentation } from '../visual/course-presentation.js';
import type { CompiledLink, CompiledPort } from './course-graph.js';
import { COURSE_LINK_RECIPE, coursePortLateral } from './course-links.js';
import { compileCourseConsumerDemand, type CourseQueryExtent } from './course-consumer-demand.js';
import {
  requireCanonicalCourseLinks,
  courseOverlapRuler,
  courseOverlapBandRegions,
  courseOverlapHeight,
} from './course-overlap-domain.js';

const COURSE_PRESENTATION_OVERLAP_RECIPE = Object.freeze({
  id: 'superoutride.presentation-overlap',
  version: 1,
});
const consumers = ['cameraRender', 'groundFilter', 'scenery'] as const;
type AppearanceBinding = CoursePresentation['ground']['bands'][number];

function at<T extends { readonly anchor: { readonly s: number } }>(profile: readonly T[], s: number): T {
  let index = 0;
  while (index + 1 < profile.length && profile[index + 1]!.anchor.s <= s) index += 1;
  return profile[index]!;
}

function presentation(port: CompiledPort): CoursePresentation {
  const p = port.section.presentation;
  requireCourse(p !== null, '', 'Common content requires explicit saved presentation', 'presentation_missing');
  return p;
}

/** Equal admitted sources and integer cycles prove the complete pattern, not selected texel probes. */
function samePaint(a: CoursePaint | null, b: CoursePaint | null, ap: CompiledPort, bp: CompiledPort): boolean {
  if (a === null || b === null) return a === b;
  if (a.asset.source !== b.asset.source) return false;
  const ds = ap.anchor.s - a.phaseS - (bp.anchor.s - b.phaseS),
    dl = coursePortLateral(ap) - a.phaseL - (coursePortLateral(bp) - b.phaseL),
    density = SPRITE_SOURCE_TEXELS_PER_METER;
  if (
    !Number.isSafeInteger((ds * density) / a.asset.source.height) ||
    !Number.isSafeInteger((dl * density) / a.asset.source.width)
  )
    return false;
  const aa = a.alternate,
    ba = b.alternate;
  if (aa === null || ba === null) return aa === ba;
  if (
    aa.spanS !== ba.spanS ||
    aa.spanL !== ba.spanL ||
    aa.paletteRgb555.some((color, i) => color !== ba.paletteRgb555[i])
  )
    return false;
  const s = ds / aa.spanS,
    l = dl / aa.spanL;
  return Number.isSafeInteger(s) && Number.isSafeInteger(l) && ((s % 2) + (l % 2)) % 2 === 0;
}

function binding(p: CoursePresentation, band: AppearanceBinding['band']): AppearanceBinding {
  const value = p.ground.bands.find((value) => value.band === band);
  if (!value) throw new Error('Compiled Band has no appearance binding');
  return value;
}

function regions(port: CompiledPort, start: number, end: number, domain: CourseQueryExtent) {
  const p = presentation(port);
  const pieces = courseOverlapBandRegions(port, start, end, domain).flatMap(({ band, ...edges }) => {
    const paint = at(binding(p, band).sections, start).paint;
    return paint === null ? [] : [{ ...edges, paint }];
  });
  const merged: typeof pieces = [];
  for (const piece of pieces) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.right === piece.left &&
      previous.rightEnd === piece.leftEnd &&
      samePaint(previous.paint, piece.paint, port, port)
    ) {
      previous.right = piece.right;
      previous.rightEnd = piece.rightEnd;
    } else merged.push(piece);
  }
  return merged;
}

function groundAndEnvironment(link: CompiledLink, domain: CourseQueryExtent): void {
  const { source: ap, destination: bp } = link,
    a = presentation(ap),
    b = presentation(bp);
  for (const port of [ap, bp]) {
    const p = presentation(port),
      origin = coursePortLateral(port);
    requireCourse(
      origin - domain.left >= -p.ground.left && origin + domain.right < p.ground.right,
      '',
      'Closed presentation/filter query domain exceeds the half-open source strip',
      'coverage_gap',
    );
  }
  requireCourse(
    a.ground.baseRgb555 === b.ground.baseRgb555,
    '',
    'Ground base colors disagree',
    'presentation_ground_mismatch',
  );
  requireCourse(
    courseOverlapHeight(ap, link.overlap, '') === courseOverlapHeight(bp, link.overlap, ''),
    '',
    'Presentation height disagrees',
    'presentation_ground_mismatch',
  );
  const ruler = (port: CompiledPort) => {
    const p = presentation(port);
    return courseOverlapRuler(port, link.overlap, domain, [
      ...p.ground.bands.flatMap((b) => b.sections.map((s) => s.anchor.s)),
      ...p.environments.map((e) => e.anchor.s),
    ]);
  };
  const stations = compileCourseOverlapStations(ruler(ap), ruler(bp), link.overlap, '');
  const compareEdges = (as: number, bs: number) => {
    const paint = (port: CompiledPort, s: number, l: number) => {
      const band = courseBandAt(port.section.bandPartition, s, l, coursePortLateral(port));
      return band ? at(binding(presentation(port), band).sections, s).paint : null;
    };
    for (const l of [-domain.left, domain.right])
      requireCourse(
        samePaint(paint(ap, as, l), paint(bp, bs, l), ap, bp),
        '',
        'Closed domain edge has different half-open appearance ownership',
        'presentation_ground_mismatch',
      );
  };
  for (const [i, station] of stations.entries()) {
    const ae = at(a.environments, station.source),
      be = at(b.environments, station.destination);
    requireCourse(
      ae.name === be.name &&
        ae.groundBaseLeft === be.groundBaseLeft &&
        ae.groundBaseRight === be.groundBaseRight &&
        ae.background.asset.source === be.background.asset.source &&
        ae.background.horizonY === be.background.horizonY &&
        ae.background.pixelsPerRadian === be.background.pixelsPerRadian &&
        Math.abs(
          wrapAngle(
            ae.background.yawOriginRadians - ap.pose.heading - (be.background.yawOriginRadians - bp.pose.heading),
          ),
        ) <= COURSE_LINK_RECIPE.headingToleranceRadians,
      '',
      'Environment/background or frame-relative pan origin disagrees',
      'presentation_environment_mismatch',
    );
    compareEdges(station.source, station.destination);
    for (const end of [station, ...(stations[i + 1] ? [stations[i + 1]!] : [])]) {
      requireCourse(
        station === end || (end.source > station.source && end.destination > station.destination),
        '',
        'Presentation overlap cell must remain representable',
        'invalid_numeric_domain',
      );
      const ar = regions(ap, station.source, end.source, domain),
        br = regions(bp, station.destination, end.destination, domain);
      requireCourse(
        ar.length === br.length &&
          ar.every((r, j) =>
            (['left', 'right', 'leftEnd', 'rightEnd'] as const).every((key) => r[key] === br[j]![key]),
          ),
        '',
        `Paint regions disagree over delta [${station.delta}, ${end.delta}]`,
        'presentation_ground_mismatch',
      );
      requireCourse(
        ar.every((r, j) => samePaint(r.paint, br[j]!.paint, ap, bp)),
        '',
        `Image/static phase disagrees over delta [${station.delta}, ${end.delta}]`,
        'presentation_phase_mismatch',
      );
      if (end !== station) {
        const as = station.source + (end.source - station.source) / 2,
          bs = station.destination + (end.destination - station.destination) / 2;
        requireCourse(
          as > station.source && as < end.source && bs > station.destination && bs < end.destination,
          '',
          'Open appearance edge cell must retain an interior witness',
          'invalid_numeric_domain',
        );
        compareEdges(as, bs);
      }
    }
  }
}

function stamps(port: CompiledPort, overlap: CompiledLink['overlap'], domain: CourseQueryExtent) {
  const density = SPRITE_SOURCE_TEXELS_PER_METER,
    s = port.anchor.s * density,
    l = coursePortLateral(port) * density;
  return presentation(port).ground.stamps.flatMap((stamp) => {
    const source = stamp.asset.source,
      left = stamp.gridL - l,
      start = stamp.gridS - s;
    if (
      left > domain.right * density ||
      left + source.width <= -domain.left * density ||
      start > overlap.ahead * density ||
      start + source.height <= -overlap.behind * density
    )
      return [];
    return [{ source, left, start }];
  });
}

function scenery(port: CompiledPort, overlap: CompiledLink['overlap'], domain: CourseQueryExtent) {
  const result = presentation(port).scenery.flatMap((placement) => {
    const s = placement.anchor.s - port.anchor.s,
      l = placement.l - coursePortLateral(port);
    if (s < -overlap.behind || s > overlap.ahead || l < -domain.left || l > domain.right) return [];
    return [
      {
        instance: placement.instance,
        s,
        l,
        y: port.section.height.sampleRender(placement.anchor.s).y + placement.groundOffset,
      },
    ];
  });
  requireCourse(
    new Set(result.map((p) => p.instance)).size === result.length,
    '',
    'A common scenery instance must have one placement in the declared domain',
    'presentation_scenery_mismatch',
  );
  return result;
}

/** Explicit source/filter/anchor query domains only; actual camera containment and runtime readiness are separate. */
export function compileCoursePresentationDomains(links: readonly CompiledLink[], input: unknown) {
  requireCanonicalCourseLinks(links);
  const demand = compileCourseConsumerDemand(input, consumers);
  if (!demand.ok) return demand;
  const errors: CourseQualificationError[] = [];
  for (const [index, link] of links.entries()) {
    const missing = demand.value.requirements.filter(
      ({ bounds }) => bounds.behind > link.overlap.behind || bounds.ahead > link.overlap.ahead,
    );
    for (const { consumer, bounds } of missing)
      errors.push(
        new CourseQualificationError(
          'coverage_gap',
          index,
          `Required [-${bounds.behind}, ${bounds.ahead}] exceeds common guard [-${link.overlap.behind}, ${link.overlap.ahead}]`,
          consumer,
        ),
      );
    if (missing.length) continue;
    try {
      const domain = demand.value.bounds;
      groundAndEnvironment(link, domain);
      const a = stamps(link.source, link.overlap, domain),
        b = stamps(link.destination, link.overlap, domain);
      requireCourse(
        a.length === b.length &&
          a.every((v, i) => v.source === b[i]!.source && v.left === b[i]!.left && v.start === b[i]!.start),
        '',
        'Ordered stamp sources or source-lattice positions disagree',
        'presentation_ground_mismatch',
      );
      const as = scenery(link.source, link.overlap, domain),
        bs = scenery(link.destination, link.overlap, domain);
      const destination = new Map(bs.map((p) => [p.instance, p]));
      requireCourse(
        as.length === bs.length &&
          as.every((p) => {
            const q = destination.get(p.instance);
            return q !== undefined && p.s === q.s && p.l === q.l && p.y === q.y;
          }),
        '',
        'Scenery identity or mapped placement disagrees',
        'presentation_scenery_mismatch',
      );
    } catch (error) {
      if (!(error instanceof CourseInputError)) throw error;
      errors.push(new CourseQualificationError(error.diagnostic.code, index, error.message));
    }
  }
  return errors.length
    ? courseFailures<never>(errors)
    : courseSuccess(
        Object.freeze({
          scope: 'presentation-query-domain' as const,
          recipe: COURSE_PRESENTATION_OVERLAP_RECIPE,
          links: Object.freeze([...links]),
          demand: demand.value,
        }),
      );
}
