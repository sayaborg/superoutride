import { SoftwareSurface, rgba } from '../render/software-surface.js';
import type { FarBackground } from '../visual/far-background.js';

const FAR_WIDTH = 640;
const FAR_HEIGHT = 320;
const FAR_HORIZON_Y = 126;
const FAR_PIXELS_PER_RADIAN = 200;

type Rgb = readonly [number, number, number];

export interface M621ChildVisualIdentity {
  readonly leftFarBackground: FarBackground;
  readonly rightFarBackground: FarBackground;
}

/**
 * M6.21 visual identity is ordinary runtime content. The renderer never receives a route side;
 * after the validated handoff it simply draws the FarBackground owned by the active package.
 */
export function createM621ChildVisualIdentity(): M621ChildVisualIdentity {
  return Object.freeze({
    leftFarBackground: createCoastFarBackground(),
    rightFarBackground: createMountainFarBackground(),
  });
}

function createCoastFarBackground(): FarBackground {
  const surface = new SoftwareSurface(FAR_WIDTH, FAR_HEIGHT);
  const skyTop: Rgb = [24, 77, 145];
  const skyBottom: Rgb = [111, 186, 211];
  const seaA = rgba(13, 100, 156);
  const seaB = rgba(20, 119, 172);
  const foam = rgba(180, 221, 222);
  const headland = rgba(39, 86, 72);
  const headlandDark = rgba(29, 66, 58);

  for (let y = 0; y < FAR_HEIGHT; y += 1) {
    for (let x = 0; x < FAR_WIDTH; x += 1) {
      let color: number;
      if (y < FAR_HORIZON_Y) {
        color = mixColor(skyTop, skyBottom, y / FAR_HORIZON_Y);
      } else {
        color = (((y - FAR_HORIZON_Y) >> 2) & 1) === 0 ? seaA : seaB;
        if ((y - FAR_HORIZON_Y) % 23 === 0) color = foam;
      }

      const coastY = FAR_HORIZON_Y + 22
        + Math.round(5 * Math.sin(x * 0.031) + 3 * Math.sin(x * 0.083));
      if (x > 360 && y >= coastY) {
        color = y < coastY + 12 ? headland : headlandDark;
      }
      surface.setPixel(x, y, color);
    }
  }

  return {
    surface,
    sourceHorizonY: FAR_HORIZON_Y,
    pixelsPerRadian: FAR_PIXELS_PER_RADIAN,
  };
}

function createMountainFarBackground(): FarBackground {
  const surface = new SoftwareSurface(FAR_WIDTH, FAR_HEIGHT);
  const skyTop: Rgb = [42, 58, 99];
  const skyBottom: Rgb = [176, 145, 122];
  const farMountain = rgba(100, 96, 105);
  const nearMountain = rgba(62, 72, 68);
  const valleyA = rgba(44, 62, 49);
  const valleyB = rgba(50, 69, 54);

  for (let y = 0; y < FAR_HEIGHT; y += 1) {
    for (let x = 0; x < FAR_WIDTH; x += 1) {
      let color = y < FAR_HORIZON_Y
        ? mixColor(skyTop, skyBottom, y / FAR_HORIZON_Y)
        : ((((y - FAR_HORIZON_Y) >> 3) & 1) === 0 ? valleyA : valleyB);

      const farRidgeY = FAR_HORIZON_Y - 24
        - Math.round(13 * Math.sin(x * 0.021) + 7 * Math.sin(x * 0.049));
      const nearRidgeY = FAR_HORIZON_Y - 4
        - Math.round(18 * Math.sin(x * 0.014 + 0.8) + 5 * Math.sin(x * 0.057));
      if (y >= farRidgeY) color = farMountain;
      if (y >= nearRidgeY) color = nearMountain;
      if (y >= FAR_HORIZON_Y + 36) {
        color = ((((y - FAR_HORIZON_Y) >> 3) & 1) === 0 ? valleyA : valleyB);
      }
      surface.setPixel(x, y, color);
    }
  }

  return {
    surface,
    sourceHorizonY: FAR_HORIZON_Y,
    pixelsPerRadian: FAR_PIXELS_PER_RADIAN,
  };
}

function mixColor(a: Rgb, b: Rgb, t: number): number {
  return rgba(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}
