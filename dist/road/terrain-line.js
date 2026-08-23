import { rasterCourseToWorld, sampleRasterCourse } from '../core/course.js';
import { wrapPositive } from '../core/math.js';
import { horizonY, pseudoProject } from '../core/projection.js';
const EPSILON = 1e-9;
export function computeForwardVisibleInterval(guide, cameraYaw, sCamera, dMin, dMax) {
    if (!(dMin > 0 && dMax > dMin && dMax < guide.length * 0.5)) {
        throw new RangeError('Core requires 0 < dMin < dMax < Lcourse/2');
    }
    const end = sCamera + dMax;
    let cursor = sCamera + dMin;
    while (cursor <= end + EPSILON) {
        const sLocal = wrapPositive(cursor, guide.length);
        const sample = sampleRasterCourse(guide.raster, sLocal);
        const facing = Math.cos(sample.heading - cameraYaw);
        if (facing <= 0) {
            const dEnd = cursor - sCamera;
            return dEnd <= dMin + EPSILON ? null : { dStart: dMin, dEnd };
        }
        const segment = guide.raster.segments[sample.segmentIndex];
        const localToSegmentEnd = segment.sStart + segment.length - sLocal;
        const step = Math.max(localToSegmentEnd, EPSILON);
        const next = Math.min(end, cursor + step);
        if (next >= end - EPSILON)
            return { dStart: dMin, dEnd: dMax };
        cursor = next;
    }
    return { dStart: dMin, dEnd: dMax };
}
export function generateFlatTerrainLines(guide, camera, profile) {
    const visible = computeForwardVisibleInterval(guide, camera.yaw, camera.s, profile.dMin, profile.dMax);
    if (!visible)
        return [];
    const h = camera.y - profile.groundY;
    const numerator = camera.focalLength * h * Math.cos(camera.pitch);
    if (!(numerator > 0))
        throw new Error('flat terrain prototype requires camera above ground');
    const yHorizon = horizonY(camera);
    const lines = [];
    for (let y = 0; y < profile.screenHeight; y += 1) {
        const sampleY = y + 0.5;
        const denominator = sampleY - yHorizon;
        if (!(denominator > 0))
            continue;
        const d = numerator / denominator;
        if (d < visible.dStart || d > visible.dEnd)
            continue;
        const s = wrapPositive(camera.s + d, guide.length);
        const groundLeft = rasterCourseToWorld(guide.raster, s, -profile.groundLeft);
        const groundRight = rasterCourseToWorld(guide.raster, s, profile.groundRight);
        const projectedLeft = pseudoProject({ ...groundLeft, y: profile.groundY }, camera);
        const projectedRight = pseudoProject({ ...groundRight, y: profile.groundY }, camera);
        const xGroundL = projectedLeft.x;
        const xGroundR = projectedRight.x;
        if (!(xGroundR > xGroundL))
            continue;
        const xRoadL = lateralToScreenX(-profile.roadLeft, xGroundL, xGroundR, profile.groundLeft, profile.groundRight);
        const xRoadR = lateralToScreenX(profile.roadRight, xGroundL, xGroundR, profile.groundLeft, profile.groundRight);
        lines.push({
            d,
            s,
            y,
            xGroundL,
            xGroundR,
            xRoadL,
            xRoadR,
        });
    }
    return lines;
}
export function lateralToScreenX(l, xGroundL, xGroundR, groundLeft, groundRight) {
    const width = groundLeft + groundRight;
    if (!(width > 0))
        throw new RangeError('ground lateral width must be > 0');
    return xGroundL + ((l + groundLeft) / width) * (xGroundR - xGroundL);
}
export function screenXToLateral(x, xGroundL, xGroundR, groundLeft, groundRight) {
    const dx = xGroundR - xGroundL;
    if (Math.abs(dx) < EPSILON)
        throw new RangeError('degenerate horizontal span');
    return -groundLeft + ((x - xGroundL) / dx) * (groundLeft + groundRight);
}
export function generateTerrainLines(guide, camera, profile) {
    const visible = computeForwardVisibleInterval(guide, camera.yaw, camera.s, profile.dMin, profile.dMax);
    if (!visible)
        return [];
    const yH = horizonY(camera);
    const cosPitch = Math.cos(camera.pitch);
    const f = camera.focalLength;
    const lines = [];
    const start = camera.s + visible.dStart;
    const end = camera.s + visible.dEnd;
    let cursor = start;
    while (cursor < end - 1e-8) {
        const local = wrapPositive(cursor, guide.length);
        const raster = sampleRasterCourse(guide.raster, local);
        const rasterSegment = guide.raster.segments[raster.segmentIndex];
        const rasterDistance = rasterSegment.sStart + rasterSegment.length - local;
        const heightDistance = profile.height.distanceToNextRenderNode(local);
        const visualDistance = profile.visual.distanceToNextSection(local);
        const intervalLength = Math.min(rasterDistance, heightDistance, visualDistance, end - cursor);
        if (!(intervalLength > 1e-8)) {
            cursor += 1e-7;
            continue;
        }
        const d0 = cursor - camera.s;
        const d1 = d0 + intervalLength;
        const heightStart = profile.height.sampleRender(local);
        const grade = heightStart.grade;
        const yIntercept = heightStart.y - grade * d0;
        const aY = yH - f * grade * cosPitch;
        const bY = -f * (yIntercept - camera.y) * cosPitch;
        if (Math.abs(bY) < 1e-8) {
            const d = (d0 + d1) * 0.5;
            const y = Math.floor(aY);
            if (y >= 0 && y < profile.screenHeight) {
                const line = createM3TerrainLine(guide, camera, profile, d, y);
                if (line)
                    lines.push(line);
            }
        }
        else {
            const y0 = aY + bY / d0;
            const y1 = aY + bY / d1;
            const minY = Math.min(y0, y1);
            const maxY = Math.max(y0, y1);
            const rowStart = Math.max(0, Math.ceil(minY - 0.5 - 1e-9));
            const rowEnd = Math.min(profile.screenHeight - 1, Math.floor(maxY - 0.5 + 1e-9));
            for (let y = rowStart; y <= rowEnd; y += 1) {
                const sampleY = y + 0.5;
                const denom = sampleY - aY;
                if (Math.abs(denom) < 1e-10)
                    continue;
                const d = bY / denom;
                if (d < d0 - 1e-7 || d > d1 + 1e-7)
                    continue;
                if (d < visible.dStart - 1e-7 || d > visible.dEnd + 1e-7)
                    continue;
                const line = createM3TerrainLine(guide, camera, profile, d, y);
                if (line)
                    lines.push(line);
            }
        }
        cursor += intervalLength;
    }
    // Core Painter order. Hills/dips may produce multiple TerrainLines on the same output row.
    lines.sort((a, b) => b.d - a.d || a.y - b.y);
    return lines;
}
function createM3TerrainLine(guide, camera, profile, d, y) {
    const sUnwrapped = camera.s + d;
    const s = wrapPositive(sUnwrapped, guide.length);
    const renderHeight = profile.height.sampleRender(s).y;
    const groundLeft = rasterCourseToWorld(guide.raster, s, -profile.groundLeft);
    const groundRight = rasterCourseToWorld(guide.raster, s, profile.groundRight);
    const projectedLeft = pseudoProject({ ...groundLeft, y: renderHeight }, camera);
    const projectedRight = pseudoProject({ ...groundRight, y: renderHeight }, camera);
    if (!(projectedRight.x > projectedLeft.x + 1e-7))
        return null;
    const section = profile.visual.sample(s);
    const xRoadL = lateralToScreenX(-profile.roadLeft, projectedLeft.x, projectedRight.x, profile.groundLeft, profile.groundRight);
    const xRoadR = lateralToScreenX(profile.roadRight, projectedLeft.x, projectedRight.x, profile.groundLeft, profile.groundRight);
    return {
        d,
        s,
        y,
        xGroundL: projectedLeft.x,
        xGroundR: projectedRight.x,
        xRoadL,
        xRoadR,
        groundBaseLeft: section.groundBaseLeft,
        groundBaseRight: section.groundBaseRight,
        sectionName: section.name,
        renderHeight,
    };
}
