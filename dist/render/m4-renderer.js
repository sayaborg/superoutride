import { pseudoProject } from '../core/projection.js';
import { wrapAngle } from '../core/math.js';
import { computeForwardVisibleInterval, generateTerrainLines } from '../road/terrain-line.js';
import { drawFarBackground } from '../visual/far-background.js';
import { sampleGroundMap } from '../visual/ground-map.js';
import { selectVehicleSprite } from '../visual/m4-sprite-assets.js';
import { collectVisibleCourseSprites } from '../world/course-sprite.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { drawScaledSprite } from './sprite.js';
export function renderM4SuperScaler(target, background, guide, camera, vehicle, terrainProfile, groundProfile, worldSprites, assets, playerKind) {
    drawFarBackground(target, background, camera);
    const terrain = generateTerrainLines(guide, camera, terrainProfile);
    const visible = computeForwardVisibleInterval(guide, camera.yaw, camera.s, terrainProfile.dMin, terrainProfile.dMax);
    const sprites = visible
        ? collectVisibleCourseSprites(worldSprites, camera, visible.dStart, visible.dEnd)
        : [];
    const rowCounts = new Uint16Array(target.height);
    let terrainOutputPixels = 0;
    let spriteOutputSamples = 0;
    let spriteWrittenPixels = 0;
    mergeTerrainAndSprites(terrain, sprites, (line) => {
        rowCounts[line.y] += 1;
        terrainOutputPixels += drawTerrainLine(target, line, groundProfile);
    }, (sprite) => {
        const stats = drawWorldSprite(target, sprite);
        spriteOutputSamples += stats.outputSamples;
        spriteWrittenPixels += stats.writtenPixels;
    });
    const playerY = terrainProfile.height.sampleRender(vehicle.course.s).y;
    const playerProjection = pseudoProject({ x: vehicle.x, y: playerY, z: vehicle.z, s: vehicle.course.s }, camera);
    const playerSet = playerKind === 'bike' ? assets.bike : assets.car;
    const relativeYaw = wrapAngle(vehicle.yaw - camera.yaw);
    const normalizedBank = playerKind === 'bike' ? vehicle.sprungRoll / 0.55 : 0;
    const selected = selectVehicleSprite(playerSet, relativeYaw, normalizedBank);
    const playerStats = drawScaledSprite(target, selected.asset, playerProjection.x, playerProjection.y, playerProjection.scale);
    let overdrawRows = 0;
    for (const count of rowCounts)
        if (count > 1)
            overdrawRows += 1;
    return {
        terrainLineCount: terrain.length,
        terrainOutputPixels,
        overdrawRows,
        visibleSpriteCount: sprites.length,
        spriteOutputSamples,
        spriteWrittenPixels,
        playerOutputSamples: playerStats.outputSamples,
        playerWrittenPixels: playerStats.writtenPixels,
        activeSection: terrainProfile.visual.sample(vehicle.course.s).name,
        playerYawVariant: selected.yawIndex,
        playerBankVariant: selected.bankIndex,
        playerRelativeYaw: relativeYaw,
    };
}
function drawTerrainLine(target, line, groundProfile) {
    let outputPixels = 0;
    const leftEdge = Math.ceil(line.xGroundL);
    const rightEdge = Math.floor(line.xGroundR);
    if (line.groundBaseLeft.kind === 'color') {
        const right = Math.min(target.width - 1, leftEdge - 1);
        if (right >= 0) {
            target.fillSpan(line.y, 0, right, line.groundBaseLeft.color);
            outputPixels += right + 1;
        }
    }
    const x0 = Math.max(0, leftEdge);
    const x1 = Math.min(target.width - 1, rightEdge);
    if (x1 >= x0) {
        const dx = line.xGroundR - line.xGroundL;
        if (Math.abs(dx) >= 1e-8) {
            let lateral = -groundProfile.groundLeft
                + ((x0 + 0.5 - line.xGroundL) / dx) * (groundProfile.groundLeft + groundProfile.groundRight);
            const lateralStep = (groundProfile.groundLeft + groundProfile.groundRight) / dx;
            const cliffSection = line.groundBaseLeft.kind === 'transparent';
            const offset = line.y * target.width;
            for (let x = x0; x <= x1; x += 1) {
                target.pixels[offset + x] = sampleGroundMap(line.s, lateral, groundProfile, cliffSection);
                lateral += lateralStep;
            }
            outputPixels += x1 - x0 + 1;
        }
    }
    if (line.groundBaseRight.kind === 'color') {
        const left = Math.max(0, rightEdge + 1);
        if (left < target.width) {
            target.fillSpan(line.y, left, target.width - 1, line.groundBaseRight.color);
            outputPixels += target.width - left;
        }
    }
    return outputPixels;
}
function drawWorldSprite(target, sprite) {
    return drawScaledSprite(target, sprite.asset, sprite.projection.x, sprite.projection.y, sprite.projection.scale);
}
