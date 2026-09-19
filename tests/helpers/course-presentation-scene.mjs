import assert from 'node:assert/strict';
import { coursePortLateral } from '../../dist/compiler/course-links.js';
import { createCourseGroundSource } from '../../dist/groundmap/course-ground-source.js';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';
import { transformPlanarPoint } from '../../dist/core/planar-transform.js';
import { wrapAngle } from '../../dist/core/math.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { readSpriteLodAsset } from '../../dist/graphics/sprite.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { VisualProfile } from '../../dist/visual/visual-profile.js';
import { renderDriving } from '../../dist/render/renderer.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import {
  compileCourseSprite,
  createCourseSpriteObservation,
  reframeCourseSpriteObservation,
} from '../../dist/render/course-sprite.js';
import { cameraProfile } from './course-driving-fixture.mjs';

/** Ordinary renderer composition from real saved sources; no occurrence/graph is passed to the renderer. */
export function coursePresentationScene(port, deltaS, deltaL, yaw, pixels, assets, bounds, observed, from, link) {
  const section = port.section,
    p = section.presentation;
  const s = port.anchor.s + deltaS,
    l = coursePortLateral(port) + deltaL;
  const point = guidePathToWorld(section.guide, s, l);
  let vehicle = {
    ...point,
    y: 1,
    yaw: point.heading + yaw,
    course: { s, l, segmentIndex: point.segmentIndex },
    longitudinalSpeed: 20,
    lateralSpeed: 0,
    sprungPitch: 0,
    presentationY: 1,
  };
  let camera = updateCamera(
    createCameraRig(),
    { guide: section.guide, height: section.height },
    vehicle,
    cameraProfile,
    1 / 60,
  );
  if (from) {
    const transform = link.destinationFromSource,
      turn = Math.atan2(transform.sine, transform.cosine);
    vehicle = {
      ...from.vehicle,
      ...transformPlanarPoint(transform, from.vehicle),
      yaw: wrapAngle(from.vehicle.yaw + turn),
      course: { ...from.vehicle.course, s, l },
    };
    camera = {
      ...from.camera,
      ...transformPlanarPoint(transform, from.camera),
      yaw: wrapAngle(from.camera.yaw + turn),
      s: link.destination.anchor.s + (from.camera.s - link.source.anchor.s),
    };
  }
  const base = (color) => (color === null ? { kind: 'transparent' } : { kind: 'color', color: rgb555ToRgba(color) });
  const visual = new VisualProfile(
    section.raster.length,
    p.environments.map((e) => ({
      sStart: e.anchor.s,
      name: e.name,
      groundBaseLeft: base(e.groundBaseLeft),
      groundBaseRight: base(e.groundBaseRight),
    })),
  );
  const environment = p.environments[0],
    backgroundImage = readSpriteLodAsset(environment.background.asset.source);
  const surface = new SoftwareSurface(backgroundImage.width, backgroundImage.height);
  surface.pixels.set(backgroundImage.levels[0].pixels);
  const background = {
    surface,
    sourceHorizonY: environment.background.horizonY,
    pixelsPerRadian: environment.background.pixelsPerRadian,
    yawOriginRadians: environment.background.yawOriginRadians,
  };
  const worldSprites = from
    ? []
    : p.scenery.map((placement) =>
        compileCourseSprite({ length: section.raster.length, raster: section.raster }, section.height, {
          name: placement.instance.id,
          s: placement.anchor.s,
          l: placement.l,
          groundOffset: placement.groundOffset,
          asset: readSpriteLodAsset(placement.instance.asset.source),
        }),
      );
  const observation = from
    ? reframeCourseSpriteObservation(
        from.observation,
        link.destinationFromSource,
        link.source.anchor.s,
        link.destination.anchor.s,
      )
    : createCourseSpriteObservation(worldSprites, camera, 2.5, 200);
  const source = createCourseGroundSource(p.ground);
  const result = renderDriving(
    pixels,
    {
      background,
      guide: { length: section.raster.length, raster: section.raster },
      camera,
      vehicle,
      terrainProfile: {
        screenHeight: 240,
        dMin: 2.5,
        dMax: 200,
        groundLeft: p.ground.left,
        groundRight: p.ground.right,
        roadLeft: 4,
        roadRight: 4,
        height: section.height,
        visual,
      },
      groundProfile: { groundLeft: p.ground.left, groundRight: p.ground.right },
      worldSprites: observation,
      assets,
      playerKind: 'car',
    },
    {
      ground: {
        kind: 'source',
        kMax: 0,
        selectLevel: () => 0,
        sampleAtLevel(s, l) {
          const ds = s - port.anchor.s,
            dl = l - coursePortLateral(port);
          assert.ok(
            ds >= -bounds.behind && ds <= bounds.ahead && dl >= -bounds.left && dl <= bounds.right,
            `renderer query delta=${ds},l=${dl} outside admitted envelope`,
          );
          observed.queries += 1;
          observed.maxL = Math.max(observed.maxL, Math.abs(dl));
          const color = rgb555ToRgba(source.sample(s, l));
          return color;
        },
      },
    },
  );
  return { ...result, vehicle, camera, observation };
}
