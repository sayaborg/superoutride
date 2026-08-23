import { headingFromDelta, normalFromHeading, tangentFromHeading, wrapAngle, wrapPositive, } from './math.js';
const MAX_VERTEX_TURN = (10 * Math.PI) / 180;
const EPSILON = 1e-9;
export function compileRasterCourse(vertices) {
    if (vertices.length < 3)
        throw new Error('closed raster course requires at least 3 vertices');
    const copied = vertices.map((vertex) => ({ ...vertex }));
    const segments = [];
    const vertexS = new Array(copied.length).fill(0);
    let s = 0;
    for (let i = 0; i < copied.length; i += 1) {
        const start = copied[i];
        const end = copied[(i + 1) % copied.length];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (!(length > EPSILON))
            throw new Error(`raster segment ${i} has zero length`);
        vertexS[i] = s;
        segments.push({
            index: i,
            startVertexIndex: i,
            endVertexIndex: (i + 1) % copied.length,
            sStart: s,
            length,
            heading: headingFromDelta(dx, dz),
        });
        s += length;
    }
    const vertexTurns = copied.map((_, i) => {
        const incoming = segments[(i - 1 + segments.length) % segments.length].heading;
        const outgoing = segments[i].heading;
        const turn = wrapAngle(outgoing - incoming);
        if (Math.abs(turn) > MAX_VERTEX_TURN + 1e-8) {
            throw new Error(`raster vertex ${i} turn ${(Math.abs(turn) * 180 / Math.PI).toFixed(4)}deg exceeds Core 10deg limit`);
        }
        return turn;
    });
    return {
        vertices: copied,
        segments,
        vertexS,
        vertexTurns,
        length: s,
    };
}
export function sampleRasterCourse(course, s) {
    const sLocal = wrapPositive(s, course.length);
    const segmentIndex = findRasterSegmentIndex(course, sLocal);
    const segment = course.segments[segmentIndex];
    const start = course.vertices[segment.startVertexIndex];
    const tangent = tangentFromHeading(segment.heading);
    const ds = sLocal - segment.sStart;
    return {
        x: start.x + tangent.x * ds,
        z: start.z + tangent.z * ds,
        s: sLocal,
        segmentIndex,
        heading: segment.heading,
    };
}
export function rasterCourseToWorld(course, s, l) {
    const center = sampleRasterCourse(course, s);
    const normal = normalFromHeading(center.heading);
    return {
        ...center,
        x: center.x + normal.x * l,
        z: center.z + normal.z * l,
        l,
    };
}
function findRasterSegmentIndex(course, sLocal) {
    let low = 0;
    let high = course.segments.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        const segment = course.segments[mid];
        const nextStart = segment.sStart + segment.length;
        if (sLocal < segment.sStart) {
            high = mid - 1;
        }
        else if (sLocal >= nextStart && mid < course.segments.length - 1) {
            low = mid + 1;
        }
        else {
            return mid;
        }
    }
    return course.segments.length - 1;
}
