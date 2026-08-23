import { normalFromHeading, wrapSigned } from './math.js';
export function pseudoDepth(sObject, sCamera, courseLength) {
    return wrapSigned(sObject - sCamera, courseLength);
}
export function horizonY(camera) {
    return camera.centerY - camera.focalLength * Math.sin(camera.pitch);
}
export function pseudoProject(anchor, camera) {
    const depth = pseudoDepth(anchor.s, camera.s, camera.courseLength);
    if (!(depth > 0))
        throw new RangeError('pseudoProject requires a forward anchor with d > 0');
    const cameraRight = normalFromHeading(camera.yaw);
    const dx = anchor.x - camera.x;
    const dz = anchor.z - camera.z;
    const xRight = dx * cameraRight.x + dz * cameraRight.z;
    const invDepth = 1 / depth;
    const scale = camera.focalLength * invDepth;
    const vertical = anchor.y - camera.y;
    return {
        x: camera.centerX + scale * xRight,
        y: camera.centerY
            - camera.focalLength * Math.sin(camera.pitch)
            - scale * vertical * Math.cos(camera.pitch),
        scale,
        depth,
        cameraRightDistance: xRight,
    };
}
export function straightRoadScreenX(centerX, focalLength, depth, theta, lateral, cameraLateral) {
    return centerX
        - focalLength * Math.sin(theta)
        + (focalLength / depth) * (lateral - cameraLateral) * Math.cos(theta);
}
