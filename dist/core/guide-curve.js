import { sampleRasterCourse } from './course.js';
import { clamp, distanceSquared, dot, headingFromDelta, normalFromHeading, scale, subtract, tangentFromHeading, wrapAngle, wrapPositive, wrapSigned, } from './math.js';
const DEFAULT_TOLERANCE = 1e-7;
const ZERO_TURN = 1e-10;
export function filletMetric(turn) {
    const absTurn = Math.abs(turn);
    if (absTurn < ZERO_TURN)
        return 1;
    return absTurn / (2 * Math.tan(absTurn * 0.5));
}
export function minimumGuideRadius(lMax, mMin, mu) {
    if (!(lMax > 0))
        throw new RangeError('lMax must be > 0');
    if (!(mMin > 0 && mMin < mu))
        throw new RangeError('Core requires 0 < mMin < mu');
    return lMax / (1 - mMin / mu);
}
export function guideMetric(mu, signedCurvature, l) {
    return mu * (1 - signedCurvature * l);
}
export function compileGuideCurve(course, options) {
    const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
    const corners = course.vertices.map((vertex, i) => {
        const turn = course.vertexTurns[i];
        const incoming = course.segments[(i - 1 + course.segments.length) % course.segments.length].heading;
        const outgoing = course.segments[i].heading;
        const mu = filletMetric(turn);
        if (Math.abs(turn) < ZERO_TURN) {
            return {
                vertexIndex: i,
                sVertex: course.vertexS[i],
                turn,
                mu: 1,
                radius: Number.POSITIVE_INFINITY,
                rMin: 0,
                trim: 0,
                center: null,
                incomingHeading: incoming,
                outgoingHeading: outgoing,
            };
        }
        const rMin = minimumGuideRadius(options.lMax, options.mMin, mu);
        const absTurn = Math.abs(turn);
        const sourceRadius = vertex.sourceRadius;
        const radius = sourceRadius === undefined
            ? rMin
            : sourceRadius * Math.cos(absTurn * 0.5);
        if (sourceRadius !== undefined && !(sourceRadius > 0)) {
            throw new Error(`vertex ${i} sourceRadius must be > 0`);
        }
        if (radius + tolerance < rMin) {
            throw new Error(`vertex ${i} circular-source guide radius is below Core R_min`);
        }
        const trim = radius * Math.tan(absTurn * 0.5);
        const tangentIn = tangentFromHeading(incoming);
        const normalIn = normalFromHeading(incoming);
        const sign = Math.sign(turn);
        const filletStart = {
            x: vertex.x - tangentIn.x * trim,
            z: vertex.z - tangentIn.z * trim,
        };
        const center = {
            x: filletStart.x + sign * radius * normalIn.x,
            z: filletStart.z + sign * radius * normalIn.z,
        };
        return {
            vertexIndex: i,
            sVertex: course.vertexS[i],
            turn,
            mu,
            radius,
            rMin,
            trim,
            center,
            incomingHeading: incoming,
            outgoingHeading: outgoing,
        };
    });
    validateFilletOverlap(course, corners, options.dCam, tolerance);
    const unsorted = [];
    for (let i = 0; i < course.segments.length; i += 1) {
        const segment = course.segments[i];
        const currentCorner = corners[i];
        const nextCorner = corners[(i + 1) % corners.length];
        const sStart = segment.sStart + currentCorner.trim;
        const sEnd = segment.sStart + segment.length - nextCorner.trim;
        if (sEnd - sStart > tolerance) {
            unsorted.push({
                kind: 'straight',
                sStart,
                sEnd,
                rasterSegmentIndex: i,
            });
        }
    }
    for (let i = 0; i < corners.length; i += 1) {
        const corner = corners[i];
        if (!(corner.trim > tolerance))
            continue;
        if (i === 0) {
            unsorted.push({
                kind: 'arc',
                sStart: course.length - corner.trim,
                sEnd: course.length,
                cornerIndex: i,
                qStart: 0,
                qEnd: 0.5,
            });
            unsorted.push({
                kind: 'arc',
                sStart: 0,
                sEnd: corner.trim,
                cornerIndex: i,
                qStart: 0.5,
                qEnd: 1,
            });
        }
        else {
            unsorted.push({
                kind: 'arc',
                sStart: corner.sVertex - corner.trim,
                sEnd: corner.sVertex + corner.trim,
                cornerIndex: i,
                qStart: 0,
                qEnd: 1,
            });
        }
    }
    unsorted.sort((a, b) => a.sStart - b.sStart);
    const segments = unsorted.map((segment, index) => ({ ...segment, index }));
    validateGuideCoverage(segments, course.length, tolerance);
    return {
        raster: course,
        segments,
        corners,
        length: course.length,
        lMax: options.lMax,
        mMin: options.mMin,
    };
}
export function sampleGuideCurve(guide, s) {
    const sLocal = wrapPositive(s, guide.length);
    const segmentIndex = findGuideSegmentIndex(guide, sLocal);
    return sampleGuideSegment(guide, guide.segments[segmentIndex], sLocal);
}
export function guideCourseToWorld(guide, s, l) {
    const center = sampleGuideCurve(guide, s);
    const normal = normalFromHeading(center.heading);
    return {
        ...center,
        x: center.x + normal.x * l,
        z: center.z + normal.z * l,
        l,
    };
}
export function locateWorldOnGuideGlobal(guide, world, clampL = false) {
    return bestCandidate(guide, world, guide.segments.map((segment) => segment.index), clampL);
}
export function locateWorldOnGuideLocal(guide, world, previousSegmentIndex, searchRadius = 2, clampL = false) {
    if (!Number.isInteger(previousSegmentIndex) || previousSegmentIndex < 0 || previousSegmentIndex >= guide.segments.length) {
        throw new RangeError('previousSegmentIndex is invalid; use explicit global initialization instead');
    }
    if (!Number.isInteger(searchRadius) || searchRadius < 0)
        throw new RangeError('searchRadius must be a non-negative integer');
    const indices = [];
    const seen = new Set();
    for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
        const index = wrapIndex(previousSegmentIndex + offset, guide.segments.length);
        if (!seen.has(index)) {
            indices.push(index);
            seen.add(index);
        }
    }
    return bestCandidate(guide, world, indices, clampL);
}
export function sampleGuideSegment(guide, segment, sLocal) {
    if (segment.kind === 'straight') {
        const raster = sampleRasterCourse(guide.raster, sLocal);
        return {
            x: raster.x,
            z: raster.z,
            s: wrapPositive(sLocal, guide.length),
            heading: raster.heading,
            segmentIndex: segment.index,
        };
    }
    const corner = guide.corners[segment.cornerIndex];
    if (!corner.center || !Number.isFinite(corner.radius))
        throw new Error('invalid arc corner');
    const q = qForCornerS(guide, corner, sLocal);
    return sampleCornerAtQ(guide, corner, q, segment.index);
}
function bestCandidate(guide, world, segmentIndices, clampL) {
    let best = null;
    for (const index of segmentIndices) {
        const candidate = projectWorldToGuideSegment(guide, guide.segments[index], world, clampL);
        if (!best || candidate.distanceSquared < best.distanceSquared)
            best = candidate;
    }
    if (!best)
        throw new Error('no guide segment candidates');
    return best;
}
function projectWorldToGuideSegment(guide, segment, world, clampL) {
    let sample;
    if (segment.kind === 'straight') {
        const start = sampleGuideSegment(guide, segment, segment.sStart);
        const tangent = tangentFromHeading(start.heading);
        const fromStart = subtract(world, start);
        const along = dot(fromStart, tangent);
        const sCandidate = clamp(segment.sStart + along, segment.sStart, segment.sEnd);
        sample = sampleGuideSegment(guide, segment, sCandidate);
    }
    else {
        const corner = guide.corners[segment.cornerIndex];
        if (!corner.center)
            throw new Error('arc corner missing center');
        const radial = subtract(world, corner.center);
        const radialLength = Math.hypot(radial.x, radial.z);
        let q;
        if (radialLength < 1e-9) {
            q = (segment.qStart + segment.qEnd) * 0.5;
        }
        else {
            const sign = Math.sign(corner.turn);
            const n = scale(radial, -sign / radialLength);
            const heading = headingFromDelta(-n.z, n.x);
            const angle = wrapAngle(heading - corner.incomingHeading);
            q = angle / corner.turn;
            q = clamp(q, segment.qStart, segment.qEnd);
        }
        sample = sampleCornerAtQ(guide, corner, q, segment.index);
    }
    const delta = subtract(world, sample);
    const normal = normalFromHeading(sample.heading);
    const rawL = dot(delta, normal);
    const l = clampL ? clamp(rawL, -guide.lMax, guide.lMax) : rawL;
    return {
        s: sample.s,
        l,
        segmentIndex: segment.index,
        distanceSquared: distanceSquared(world, sample),
    };
}
function sampleCornerAtQ(guide, corner, qInput, segmentIndex) {
    if (!corner.center)
        throw new Error('corner has no arc');
    const q = clamp(qInput, 0, 1);
    const heading = corner.incomingHeading + corner.turn * q;
    const normal = normalFromHeading(heading);
    const sign = Math.sign(corner.turn);
    const x = corner.center.x - sign * corner.radius * normal.x;
    const z = corner.center.z - sign * corner.radius * normal.z;
    const sUnwrapped = corner.sVertex - corner.trim + 2 * corner.trim * q;
    return {
        x,
        z,
        s: wrapPositive(sUnwrapped, guide.length),
        heading,
        segmentIndex,
    };
}
function qForCornerS(guide, corner, s) {
    const ds = wrapSigned(wrapPositive(s, guide.length) - corner.sVertex, guide.length);
    return clamp((ds + corner.trim) / (2 * corner.trim), 0, 1);
}
function validateFilletOverlap(course, corners, dCam, tolerance) {
    for (let i = 0; i < course.segments.length; i += 1) {
        const segment = course.segments[i];
        const a = corners[i];
        const b = corners[(i + 1) % corners.length];
        const required = a.trim + b.trim;
        if (required > segment.length + tolerance) {
            throw new Error(`Guide fillets overlap on raster segment ${i}`);
        }
        const opposite = Math.abs(a.turn) > ZERO_TURN
            && Math.abs(b.turn) > ZERO_TURN
            && Math.sign(a.turn) !== Math.sign(b.turn);
        if (opposite && dCam !== undefined) {
            const remaining = segment.length - required;
            if (remaining + tolerance < dCam) {
                throw new Error(`opposite-sign fillets on segment ${i} require straight >= D_cam`);
            }
        }
    }
}
function validateGuideCoverage(segments, courseLength, tolerance) {
    if (segments.length === 0)
        throw new Error('guide curve contains no segments');
    if (Math.abs(segments[0].sStart) > tolerance)
        throw new Error('guide curve does not start at s=0');
    let cursor = 0;
    for (const segment of segments) {
        if (Math.abs(segment.sStart - cursor) > tolerance) {
            throw new Error(`guide coverage gap/overlap near s=${cursor}`);
        }
        if (!(segment.sEnd > segment.sStart))
            throw new Error('guide segment must have positive s interval');
        cursor = segment.sEnd;
    }
    if (Math.abs(cursor - courseLength) > tolerance)
        throw new Error('guide curve does not cover full closed-course chainage');
}
function findGuideSegmentIndex(guide, sLocal) {
    let low = 0;
    let high = guide.segments.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        const segment = guide.segments[mid];
        if (sLocal < segment.sStart) {
            high = mid - 1;
        }
        else if (sLocal >= segment.sEnd && mid < guide.segments.length - 1) {
            low = mid + 1;
        }
        else {
            return mid;
        }
    }
    return guide.segments.length - 1;
}
function wrapIndex(index, length) {
    const wrapped = index % length;
    return wrapped < 0 ? wrapped + length : wrapped;
}
