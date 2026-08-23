import { CURRENT_CAMERA_DISTANCE_METERS } from './presentation-scale.js';
import { compileRasterCourse } from './course.js';
import { compileGuideCurve } from './guide-curve.js';
export function createM1DebugGuide() {
    const radius = 100;
    const step = (10 * Math.PI) / 180;
    const vertices = [];
    // A clockwise 100 m source circle represented by 10-degree chords.
    // At s=0 the Guide heading is +Z, which makes the projection lab easy to inspect.
    for (let i = 0; i < 36; i += 1) {
        const angle = i * step;
        vertices.push({
            x: radius - radius * Math.cos(angle),
            z: radius * Math.sin(angle),
            sourceRadius: radius,
        });
    }
    const raster = compileRasterCourse(vertices);
    return compileGuideCurve(raster, {
        lMax: 12,
        mMin: 0.25,
        dCam: CURRENT_CAMERA_DISTANCE_METERS,
    });
}
export function createM2StadiumGuide() {
    const radius = 60;
    const zHalf = 100;
    const step = (10 * Math.PI) / 180;
    const vertices = [];
    // Start at the lower-left tangent point and run north on a long straight.
    vertices.push({ x: 0, z: -zHalf, sourceRadius: radius });
    vertices.push({ x: 0, z: zHalf, sourceRadius: radius });
    // Top clockwise semicircle: heading 0 -> PI.
    for (let i = 1; i <= 18; i += 1) {
        const heading = i * step;
        vertices.push({
            x: radius - radius * Math.cos(heading),
            z: zHalf + radius * Math.sin(heading),
            sourceRadius: radius,
        });
    }
    // Right straight endpoint is already the final top-arc point at (120, +100).
    vertices.push({ x: radius * 2, z: -zHalf, sourceRadius: radius });
    // Bottom clockwise semicircle: heading PI -> TAU. Exclude the closing start vertex.
    for (let i = 19; i <= 35; i += 1) {
        const heading = i * step;
        vertices.push({
            x: radius - radius * Math.cos(heading),
            z: -zHalf + radius * Math.sin(heading),
            sourceRadius: radius,
        });
    }
    const raster = compileRasterCourse(vertices);
    return compileGuideCurve(raster, {
        lMax: 12,
        mMin: 0.25,
        dCam: CURRENT_CAMERA_DISTANCE_METERS,
    });
}
