import { rasterCourseToWorld } from '../core/course.js';
import { pseudoDepth, pseudoProject } from '../core/projection.js';
export function compileCourseSprite(guide, height, source) {
    const plan = rasterCourseToWorld(guide.raster, source.s, source.l);
    const y = source.y ?? (height.sampleRender(source.s).y + (source.groundOffset ?? 0));
    return {
        name: source.name,
        x: plan.x,
        y,
        z: plan.z,
        sRender: plan.s,
        asset: source.asset,
    };
}
export function collectVisibleCourseSprites(sprites, camera, dStart, dEnd) {
    const visible = [];
    for (const sprite of sprites) {
        const d = pseudoDepth(sprite.sRender, camera.s, camera.courseLength);
        if (d < dStart || d > dEnd)
            continue;
        const projection = pseudoProject({ x: sprite.x, y: sprite.y, z: sprite.z, s: sprite.sRender }, camera);
        visible.push({ ...sprite, d, projection });
    }
    visible.sort((a, b) => b.d - a.d);
    return visible;
}
