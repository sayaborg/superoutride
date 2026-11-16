import { rgba, rgbaToRgb555 } from '../../src/image/rgb555.js';
import { VEHICLE_PICTURE_SIZES, type VehicleSpriteSetDocument } from '../../src/vehicle/vehicle-sprite-library.js';
import { cameraDistance, type CameraDefinition } from '../../src/view/camera.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from '../../src/view/display-scale.js';
import type { Rgb, VehiclePictureRecipe } from './vehicle-picture-recipe.js';
import type { VehicleSolid } from './vehicle-solid.js';
import type { VehicleModelRecipe } from './vehicle-model-recipe.js';

/** The drawing style shared by four-view solids and authored procedural solids. */
export interface VehiclePictureStyle extends Pick<
  VehiclePictureRecipe,
  'yawVariants' | 'slots' | 'bodyKeys' | 'palettes' | 'brakeLamp'
> {
  readonly paint: Pick<VehiclePictureRecipe['paint'], 'exposure'>;
  readonly glass: Pick<VehiclePictureRecipe['glass'], 'glint'>;
}

/**
 * Vehicle pictures by the [picture contract](../../docs/image-assets.md#picture-contract): every direction and size of
 * a vehicle's solid drawn by that size's camera, lit as under an open sky, in the set's one palette, each with its
 * shadow.
 */

/** Each texel is the mean of this many camera pixels a side at full size, twice as many at each smaller size. */
const SUPERSAMPLE = 6;
/** A surface point covers this many camera pixels a side, which closes the gaps between neighbouring points. */
const POINT_PIXELS = 4;
/** A texel is opaque, lamp, paint or glass when at least this share of it is. */
const SHARE = 0.5;
/** The smallest size whose pictures keep a texel for each brake lamp. */
const LAMP_KEPT_TO_SIZE = 4;
/** A lamp shows in a picture when it fills at least this share of one texel. */
const LAMP_SHOWS = 0.02;

/** The light: the sun's direction and how strongly paint and glass mirror their surroundings. */
const SUN = normalize([0.35, 0.85, 0.4]);
const GLOSS = 2;
/** The open sky is several times brighter than sunlit paint: these values above 255 are meant. */
const SKY_HORIZON = [600, 620, 640] as const;
const SKY_ZENITH = [170, 290, 560] as const;
const ROAD_HORIZON = [150, 150, 150] as const;
const ROAD_BELOW = [55, 55, 58] as const;
const SUN_COLOR = [255, 250, 235] as const;
const RIDGE_COLOR = [150, 140, 135] as const;
const GLASS_TINT = [10, 16, 30] as const;
/** Glass brighter than this mean, and no glare, takes the light glass color. */
const GLASS_LIGHT = 105;
/** A texel's nearest color: the weight of a squared step of brightness, and of a whole step of chromaticity at white. */
const BRIGHTNESS_WEIGHT = 0.25;
const CHROMATICITY_WEIGHT = 600;

function normalize(v: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

type Frame = VehicleSpriteSetDocument['pictures'][number]['sizes'][number];

/**
 * How a size's texels take their slots in place of the style's palette: by role, with a brightness of their own. Each
 * surface point has its role (`points`, from 0), its albedo (three channels, 0–1) and its gloss; it is lit by `light`,
 * fixed to the picture, and darkened by `hollows` from the picture's depths ([Model solids](../../docs/image-assets.md#model-solids)).
 * A texel takes the role most of its visible points have (the first of equals). It then holds its role plus one, its
 * brightness (the largest channel of the mean lit color of its role's points, 0–1), the share of its points whose
 * role is `kept`, and on the steps' sizes the share of its role's points lying in step cells.
 */
export interface TexelRoles {
  readonly points: Uint8Array;
  readonly count: number;
  readonly kept: number;
  readonly albedo: Float32Array;
  readonly gloss: Float32Array;
  readonly light: VehicleModelRecipe['light'];
  readonly hollows: VehicleModelRecipe['hollows'];
  readonly steps: VehicleModelRecipe['steps'];
}

/** One drawn size before it is cropped: slot indices and the shadow on one texel grid, anchored at (`anchorX`, `anchorY`). */
export interface DrawnSize {
  readonly width: number;
  readonly height: number;
  /** The base point's projection, in texel-edge coordinates. */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly indices: Uint8Array;
  readonly shadow: Uint8Array;
  /**
   * With roles, each texel's brightness (0–1), its kept role's share and its role's share in step cells (0 on sizes
   * without steps); else empty.
   */
  readonly brightness: Float32Array;
  readonly keptShare: Float32Array;
  readonly stepShare: Float32Array;
}

/** The colors of the slots a texel can take, in slot order, and the ranges of each kind. */
function slotColors(recipe: VehiclePictureStyle) {
  const reference = Object.values(recipe.palettes)[0]!;
  const body = recipe.slots.body,
    neutral = recipe.slots.neutral;
  const glassDark = body + neutral,
    glassLight = glassDark + 1;
  // Slot numbers are 1-based; `reference[slot - 1]` is a slot's color.
  const others = Array.from({ length: 14 - body }, (_, i) => body + 1 + i).filter(
    (slot) => slot - 1 !== glassDark && slot - 1 !== glassLight,
  );
  return {
    reference,
    body,
    lightestNeutral: body + neutral,
    glassDark: glassDark + 1,
    glassLight: glassLight + 1,
    others,
  };
}

/**
 * Light point `n` by roles: `(cx, cy, cz)` is its unit normal in the picture's axes (x right, y up, z towards the
 * viewer), `upward` its height in the vehicle's. Writes its albedo times its diffuse light to `shaded` and its specular
 * light to `specular`.
 */
function lightByRole(
  roles: TexelRoles,
  n: number,
  cx: number,
  cy: number,
  cz: number,
  upward: number,
  shaded: Float32Array,
  specular: Float32Array,
) {
  const { main, fill, ambient, sky, mainWeight, fillWeight, shininess } = roles.light;
  const up = upward * 0.5 + 0.5;
  const diffuse =
    ambient +
    sky * up +
    mainWeight * Math.max(0, cx * main[0] + cy * main[1] + cz * main[2]) +
    fillWeight * Math.max(0, cx * fill[0] + cy * fill[1] + cz * fill[2]);
  // The half-way direction of the main light and the view, (0, 0, 1).
  const hx = main[0],
    hy = main[1],
    hz = main[2] + 1;
  const hl = Math.hypot(hx, hy, hz);
  specular[n] = roles.gloss[n]! * Math.max(0, (cx * hx + cy * hy + cz * hz) / hl) ** shininess;
  for (let c = 0; c < 3; c++) shaded[n * 3 + c] = roles.albedo[n * 3 + c]! * diffuse;
}

/** A Gaussian blur of `values` (`columns` by `rows`) by `sigma` cells, outside the grid taken as 0. */
function blur(values: Float64Array, columns: number, rows: number, sigma: number): Float64Array {
  const radius = Math.ceil(3 * sigma);
  const kernel = Float64Array.from({ length: 2 * radius + 1 }, (_, k) =>
    Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)),
  );
  const across = new Float64Array(values.length),
    out = new Float64Array(values.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      let sum = 0;
      for (let k = Math.max(0, radius - x); k < Math.min(kernel.length, columns - x + radius); k++)
        sum += kernel[k]! * values[y * columns + x + k - radius]!;
      across[y * columns + x] = sum;
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      let sum = 0;
      for (let k = Math.max(0, radius - y); k < Math.min(kernel.length, rows - y + radius); k++)
        sum += kernel[k]! * across[(y + k - radius) * columns + x]!;
      out[y * columns + x] = sum;
    }
  return out;
}

/**
 * The hollows' darkening, by cells of camera pixels (`hollows.cells` to a texel a side): each covered cell's mean depth
 * against its surroundings', blurred by each width (metres at the base point, `texelsPerMetre` texels to a metre) over
 * the covered cells alone; 1 where nothing lies deeper than its surroundings. With `steps`, also each covered cell
 * lying more than `steps.depth` behind the nearest covered cell of the square `steps.reach` about it (1 a step cell).
 */
function hollowsOf(
  nearest: Float32Array,
  point: Int32Array,
  w: number,
  h: number,
  sub: number,
  texelsPerMetre: number,
  hollows: VehicleModelRecipe['hollows'],
  steps: VehicleModelRecipe['steps'] | null,
) {
  const cellPixels = sub / hollows.cells;
  if (!Number.isInteger(cellPixels)) throw new RangeError('A texel holds a whole number of hollow cells');
  const columns = w / cellPixels,
    rows = h / cellPixels,
    perCell = cellPixels * cellPixels;
  const depth = new Float64Array(columns * rows),
    cover = new Float64Array(columns * rows);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (point[y * w + x]! < 0) continue;
      const cell = Math.floor(y / cellPixels) * columns + Math.floor(x / cellPixels);
      depth[cell]! += nearest[y * w + x]! / perCell;
      cover[cell]! += 1 / perCell;
    }
  const values = new Float32Array(columns * rows).fill(1);
  for (const width of hollows.widths) {
    const sigma = width * texelsPerMetre * hollows.cells;
    const blurredDepth = blur(depth, columns, rows, sigma),
      blurredCover = blur(cover, columns, rows, sigma);
    for (let cell = 0; cell < values.length; cell++) {
      if (!(cover[cell]! > 0) || !(blurredCover[cell]! > 0)) continue;
      const deeper = (depth[cell]! / cover[cell]! - blurredDepth[cell]! / blurredCover[cell]!) / hollows.depth;
      values[cell]! -= hollows.weight * Math.min(hollows.most, Math.max(0, deeper));
    }
  }
  return {
    values,
    columns,
    cellPixels,
    steps: steps && stepCells(depth, cover, columns, rows, texelsPerMetre, hollows, steps),
  };
}

/** Each covered cell lying more than `steps.depth` behind the nearest covered cell within `steps.reach` (1), else 0. */
function stepCells(
  depth: Float64Array,
  cover: Float64Array,
  columns: number,
  rows: number,
  texelsPerMetre: number,
  hollows: VehicleModelRecipe['hollows'],
  steps: VehicleModelRecipe['steps'],
): Uint8Array {
  const reach = Math.round(steps.reach * texelsPerMetre * hollows.cells);
  const z = Float64Array.from(depth, (d, cell) => (cover[cell]! > 0 ? d / cover[cell]! : Infinity));
  // The nearest depth within the square: across, then along.
  const across = new Float64Array(z.length).fill(Infinity),
    near = new Float64Array(z.length).fill(Infinity);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++)
      for (let k = Math.max(0, x - reach); k <= Math.min(columns - 1, x + reach); k++)
        across[y * columns + x] = Math.min(across[y * columns + x]!, z[y * columns + k]!);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++)
      for (let k = Math.max(0, y - reach); k <= Math.min(rows - 1, y + reach); k++)
        near[y * columns + x] = Math.min(near[y * columns + x]!, across[k * columns + x]!);
  return Uint8Array.from(z, (d, cell) => +(Number.isFinite(d) && d - near[cell]! > steps.depth));
}

/**
 * Draw one size of one direction. The camera stands `distance` behind the base point and the camera definition's
 * height above it, level, with the definition's focal length; the vehicle is turned right by `yaw`. With `TexelRoles`
 * in place of a style, its texels take roles.
 */
export function drawSize(
  solid: VehicleSolid,
  recipe: VehiclePictureStyle | TexelRoles,
  camera: Pick<CameraDefinition, 'focalLength' | 'height'>,
  yaw: number,
  size: number,
): DrawnSize {
  const texel = 2 ** size;
  const sub = SUPERSAMPLE * texel;
  const distance = cameraDistance(camera) * texel;
  const focal = camera.focalLength * sub;
  const scale = PLAYER_DEPTH_PIXELS_PER_METER / texel; // texels per metre at the base point
  // The frame, in texels about the anchor, holds the solid at any yaw: its nearest point is `reach` nearer than the
  // base point, its farthest as much farther.
  const reach = Math.min(solid.reach, distance * 0.9);
  const halfWidth = Math.ceil(((reach * distance) / Math.sqrt(distance * distance - reach * reach) + 0.1) * scale) + 1;
  const above =
    Math.ceil((camera.height - ((camera.height - solid.height) * distance) / (distance + reach) + 0.1) * scale) + 1;
  const below = Math.ceil(((camera.height * reach) / (distance - reach) + 0.1) * scale) + 1;
  const width = 2 * halfWidth,
    height = above + below;
  const w = width * sub,
    h = height * sub;
  const cx = halfWidth * sub,
    cy = above * sub - (focal * camera.height) / distance;

  const cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  const nearest = new Float32Array(w * h).fill(Infinity);
  const point = new Int32Array(w * h).fill(-1);
  const shaded = new Float32Array(solid.count * 3);
  const roles = 'points' in recipe ? recipe : null;
  // With roles, `shaded` holds each point's albedo times its diffuse light, and this its specular light.
  const specular = new Float32Array(roles ? solid.count : 0);
  const { positions, normals, colors, edge, paint, glass } = solid;
  for (let n = 0; n < solid.count; n++) {
    const px = positions[n * 3]!,
      y = positions[n * 3 + 1]!,
      pz = positions[n * 3 + 2]!;
    const x = px * cos + pz * sin,
      z = -px * sin + pz * cos;
    const depth = z + distance;
    if (depth <= 0.05) continue;
    const u = Math.floor(cx + (focal * x) / depth),
      v = Math.floor(cy - (focal * (y - camera.height)) / depth);
    let seen = false;
    for (let dy = -POINT_PIXELS / 2; dy < POINT_PIXELS / 2; dy++) {
      const row = v + dy;
      if (row < 0 || row >= h) continue;
      for (let dx = -POINT_PIXELS / 2; dx < POINT_PIXELS / 2; dx++) {
        const column = u + dx;
        if (column < 0 || column >= w) continue;
        const cell = row * w + column;
        if (depth < nearest[cell]!) {
          nearest[cell] = depth;
          point[cell] = n;
          seen = true;
        }
      }
    }
    if (!seen) continue;
    // Light this point as this camera sees it.
    const nx = normals[n * 3]! * cos + normals[n * 3 + 2]! * sin,
      ny = normals[n * 3 + 1]!,
      nz = -normals[n * 3]! * sin + normals[n * 3 + 2]! * cos;
    if (roles) {
      lightByRole(roles, n, nx, ny, -nz, ny, shaded, specular);
      continue;
    }
    let vx = x,
      vy = y - camera.height,
      vz = depth;
    const vLength = Math.hypot(vx, vy, vz);
    vx /= vLength;
    vy /= vLength;
    vz /= vLength;
    const facing = Math.min(Math.max(-(nx * vx + ny * vy + nz * vz), 0), 1);
    const rx = vx + 2 * facing * nx,
      ry = vy + 2 * facing * ny,
      rz = vz + 2 * facing * nz;
    const fresnel = (1 - facing) ** 4;
    const lambert = Math.min(Math.max(nx * SUN[0] + ny * SUN[1] + nz * SUN[2], 0), 1);
    const toSun = Math.min(Math.max(rx * SUN[0] + ry * SUN[1] + rz * SUN[2], 0), 1);
    const sun = toSun ** 300 * 20 + toSun ** 24 * 3.5;
    const up = Math.sqrt(Math.min(Math.max(ry, 0), 1)),
      down = Math.min(Math.max(-ry, 0), 1) ** 0.35;
    const near = Math.min(Math.max(0.55 + 0.45 * Math.min(Math.max(y / 0.25, 0), 1), 0), 1); // darker close to the road
    for (let c = 0; c < 3; c++) {
      const surroundings =
        (ry >= 0
          ? SKY_HORIZON[c]! * (1 - up) + SKY_ZENITH[c]! * up
          : ROAD_HORIZON[c]! * (1 - down) + ROAD_BELOW[c]! * down) +
        sun * SUN_COLOR[c]!;
      const color = colors[n * 3 + c]!;
      let value: number;
      if (paint[n]) {
        // creases facing the sky catch the light
        const ridge =
          Math.min(Math.max((edge[n]! - 0.1) / 0.25, 0), 1) *
          Math.min(Math.max(0.35 + 0.65 * ny, 0), 1) *
          Math.min(Math.max(0.4 + 0.6 * lambert, 0), 1);
        value =
          color * (0.76 + 0.3 * lambert) +
          surroundings * (0.05 + 0.45 * fresnel) * GLOSS +
          ridge * RIDGE_COLOR[c]! * GLOSS;
      } else if (glass[n]) value = color * 0.5 + GLASS_TINT[c]! + surroundings * (0.09 + 0.55 * fresnel) * GLOSS;
      else value = color * (0.8 + 0.3 * lambert);
      shaded[n * 3 + c] = Math.min(
        Math.max(value * near * (paint[n] ? (recipe as VehiclePictureStyle).paint.exposure : 1), 0),
        255,
      );
    }
  }

  // The shadow: the solid's outline from above, on the road through the base point.
  const shadowPixels = new Uint8Array(w * h);
  for (let n = 0; n < solid.footprint.length; n += 2) {
    const px = solid.footprint[n]!,
      pz = solid.footprint[n + 1]!;
    const x = px * cos + pz * sin,
      depth = -px * sin + pz * cos + distance;
    if (depth <= 0.05) continue;
    const u = Math.floor(cx + (focal * x) / depth),
      v = Math.floor(cy + (focal * camera.height) / depth);
    for (let dy = -POINT_PIXELS / 2; dy < POINT_PIXELS / 2; dy++)
      for (let dx = -POINT_PIXELS / 2; dx < POINT_PIXELS / 2; dx++) {
        const row = v + dy,
          column = u + dx;
        if (row >= 0 && row < h && column >= 0 && column < w) shadowPixels[row * w + column] = 1;
      }
  }

  // With roles, the hollows' darkening of each cell of camera pixels.
  const hollow =
    roles &&
    hollowsOf(nearest, point, w, h, sub, scale, roles.hollows, roles.steps.sizes.includes(size) ? roles.steps : null);
  // Each texel from its camera pixels: what it is, and its mean color.
  const slots = roles ? null : slotColors(recipe as VehiclePictureStyle);
  const indices = new Uint8Array(width * height),
    shadow = new Uint8Array(width * height),
    brightness = new Float32Array(roles ? width * height : 0),
    keptShare = new Float32Array(roles ? width * height : 0),
    stepShare = new Float32Array(roles ? width * height : 0);
  // With roles, each role's point count and lit sums in the texel at hand, and its points in step cells.
  const byRole = new Float64Array(roles ? roles.count * 4 : 0),
    stepped = new Float64Array(roles ? roles.count : 0);
  const lampShare = new Float32Array(width * height);
  const pixels = sub * sub;
  let fullestCoverage = 0,
    fullestAt = -1,
    fullestSlot = 0,
    opaque = false;
  for (let ty = 0; ty < height; ty++)
    for (let tx = 0; tx < width; tx++) {
      let covered = 0,
        lamp = 0,
        painted = 0,
        glazed = 0,
        shade = 0,
        r = 0,
        g = 0,
        b = 0;
      byRole.fill(0);
      stepped.fill(0);
      for (let sy = 0; sy < sub; sy++) {
        const row = (ty * sub + sy) * w + tx * sub;
        for (let sx = 0; sx < sub; sx++) {
          shade += shadowPixels[row + sx]!;
          const n = point[row + sx]!;
          if (n < 0) continue;
          covered++;
          lamp += solid.lamp[n]!;
          painted += paint[n]!;
          glazed += glass[n]!;
          r += shaded[n * 3]!;
          g += shaded[n * 3 + 1]!;
          b += shaded[n * 3 + 2]!;
          if (roles && hollow) {
            const at = roles.points[n]! * 4,
              y = ty * sub + sy,
              x = tx * sub + sx;
            const cell = Math.floor(y / hollow.cellPixels) * hollow.columns + Math.floor(x / hollow.cellPixels);
            const darkening = hollow.values[cell]!;
            if (hollow.steps?.[cell]) stepped[roles.points[n]!]!++;
            byRole[at]!++;
            for (let c = 0; c < 3; c++)
              byRole[at + 1 + c]! += Math.min(1, shaded[n * 3 + c]! * darkening + specular[n]!);
          }
        }
      }
      const texelAt = ty * width + tx;
      shadow[texelAt] = +(shade / pixels >= SHARE);
      if (!covered) continue;
      r /= covered;
      g /= covered;
      b /= covered;
      lampShare[texelAt] = lamp / covered;
      let slot: number;
      if (roles) {
        let best = 0;
        for (let role = 1; role < roles.count; role++) if (byRole[role * 4]! > byRole[best * 4]!) best = role;
        const n = byRole[best * 4]!;
        slot = best + 1;
        brightness[texelAt] = Math.max(byRole[best * 4 + 1]!, byRole[best * 4 + 2]!, byRole[best * 4 + 3]!) / n;
        keptShare[texelAt] = byRole[roles.kept * 4]! / covered;
        stepShare[texelAt] = stepped[best]! / n;
      } else if (lamp / covered >= SHARE) slot = 15;
      else if (painted / covered >= SHARE) {
        // Paint takes the body slot whose key brightness is nearest.
        const brightness = 0.45 * r + 0.35 * g + 0.2 * b;
        const keys = (recipe as VehiclePictureStyle).bodyKeys;
        let at = keys.length - 1;
        if (brightness >= keys[0]!) at = 0;
        else
          for (let i = 1; i < keys.length; i++)
            if (brightness >= keys[i]!) {
              at = i - (keys[i - 1]! - brightness < brightness - keys[i]! ? 1 : 0);
              break;
            }
        slot = at + 1;
      } else if (glazed / covered >= SHARE) {
        const mean = (r + g + b) / 3;
        slot =
          mean > (recipe as VehiclePictureStyle).glass.glint
            ? slots!.lightestNeutral
            : mean > GLASS_LIGHT
              ? slots!.glassLight
              : slots!.glassDark;
      } else {
        // Everything else takes the nearest color that is neither body nor glass. Brightness counts for less than
        // chromaticity, so a shaded amber stays amber rather than turning the darker red; chromaticity counts in
        // proportion to the texel's brightness, so a dark texel stays a dark neutral.
        slot = slots!.others[0]!;
        let best = Infinity;
        const sum = r + g + b || 1;
        const chromaticity = (CHROMATICITY_WEIGHT * sum) / 765;
        for (const candidate of slots!.others) {
          const [cr, cg, cb] = slots!.reference[candidate - 1]!;
          const candidateSum = cr + cg + cb || 1;
          const error =
            BRIGHTNESS_WEIGHT * ((sum - candidateSum) / 3) ** 2 +
            chromaticity ** 2 *
              ((r / sum - cr / candidateSum) ** 2 +
                (g / sum - cg / candidateSum) ** 2 +
                (b / sum - cb / candidateSum) ** 2);
          if (error < best) {
            best = error;
            slot = candidate;
          }
        }
      }
      if (covered / pixels >= SHARE) {
        indices[texelAt] = slot;
        opaque = true;
      }
      if (covered > fullestCoverage) {
        fullestCoverage = covered;
        fullestAt = texelAt;
        fullestSlot = slot;
      }
    }
  // A subpixel silhouette remains visible: retain its fullest texel in its ordinary classified color.
  // Ties keep the first texel in row order. This does not alter frames which already reached half coverage.
  if (!opaque && fullestAt >= 0) indices[fullestAt] = fullestSlot;
  // The lamp never vanishes while the tail shows: each lamp's fullest texel stays a lamp texel.
  if (size >= 1 && size <= LAMP_KEPT_TO_SIZE)
    for (const [from, to] of [
      [0, halfWidth],
      [halfWidth, width],
    ] as const) {
      let fullest = -1,
        share = LAMP_SHOWS,
        kept = false;
      for (let ty = 0; ty < height && !kept; ty++)
        for (let tx = from; tx < to; tx++) {
          const texelAt = ty * width + tx;
          if (indices[texelAt] === 15) {
            kept = true;
            break;
          }
          if (indices[texelAt] && lampShare[texelAt]! > share) {
            share = lampShare[texelAt]!;
            fullest = texelAt;
          }
        }
      if (!kept && fullest >= 0) indices[fullest] = 15;
    }
  return { width, height, anchorX: halfWidth, anchorY: above, indices, shadow, brightness, keptShare, stepShare };
}

/** The opaque texels' frame: its rows as hexadecimal digits and its anchor in texel-centre coordinates. */
export function frame(cells: Uint8Array, width: number, height: number, anchorX: number, anchorY: number) {
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (cells[y * width + x]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  const empty = right < 0;
  if (empty) {
    // Nothing reached half a texel: the frame is the one texel holding the base point.
    left = right = Math.min(Math.max(Math.floor(anchorX), 0), width - 1);
    top = bottom = Math.min(Math.max(Math.floor(anchorY), 0), height - 1);
  }
  const rows: string[] = [];
  for (let y = top; y <= bottom; y++) {
    let row = '';
    for (let x = left; x <= right; x++) row += cells[y * width + x]!.toString(16);
    rows.push(row);
  }
  return {
    width: right - left + 1,
    height: bottom - top + 1,
    anchorX: anchorX - 0.5 - left,
    anchorY: anchorY - 0.5 - top,
    rows,
    empty,
  };
}

/** One direction's picture: every size with its shadow. */
function drawPicture(
  solid: VehicleSolid,
  recipe: VehiclePictureStyle,
  camera: Pick<CameraDefinition, 'focalLength' | 'height'>,
  yaw: number,
): { sizes: Frame[] } {
  return framePicture(
    Array.from({ length: VEHICLE_PICTURE_SIZES }, (_, size) => drawSize(solid, recipe, camera, yaw, size)),
  );
}

/** A direction's drawn sizes as its picture: each cropped to its opaque texels, with its shadow. */
export function framePicture(drawnSizes: readonly DrawnSize[]): { sizes: Frame[] } {
  const sizes: Frame[] = [];
  for (const drawn of drawnSizes) {
    const picture = frame(drawn.indices, drawn.width, drawn.height, drawn.anchorX, drawn.anchorY);
    const shadow = frame(drawn.shadow, drawn.width, drawn.height, drawn.anchorX, drawn.anchorY);
    // A shadow keeps at least one opaque texel at every size.
    const shadowRows = shadow.empty ? ['1'] : shadow.rows;
    sizes.push({
      width: picture.width,
      height: picture.height,
      anchorX: picture.anchorX,
      anchorY: picture.anchorY,
      rows: picture.rows,
      shadow: {
        width: shadow.width,
        height: shadow.height,
        anchorX: shadow.anchorX,
        anchorY: shadow.anchorY,
        rows: shadowRows,
      },
    });
  }
  return { sizes };
}

const rgb555 = ([r, g, b]: Rgb) => rgbaToRgb555(rgba(r, g, b));

/**
 * The vehicle sprite set of a solid: `recipe.yawVariants` directions, image 0 seen from behind and each next one turned
 * right by one step, every size drawn by its own camera. `progress` hears each finished direction.
 * A bank array runs from negative to positive lean, evenly spaced over ±bankDegrees, including both extremes.
 */
export function drawVehicleSpriteSet(
  solid: VehicleSolid | readonly VehicleSolid[],
  recipe: VehiclePictureStyle,
  camera: Pick<CameraDefinition, 'focalLength' | 'height'>,
  progress: (done: number) => void = () => {},
  bankDegrees = 0,
): VehicleSpriteSetDocument {
  const banks = 'count' in solid ? [solid] : solid;
  if (!banks.length || (banks.length > 1 ? !(bankDegrees > 0 && bankDegrees < 90) : bankDegrees !== 0))
    throw new RangeError('Multiple bank solids need an angle in (0,90); one solid needs zero');
  const pictures = [];
  const assets: number[][] = [];
  for (let i = 0; i < recipe.yawVariants; i++) {
    const row: number[] = [];
    for (const bank of banks) {
      row.push(pictures.length);
      pictures.push(drawPicture(bank, recipe, camera, (i * 2 * Math.PI) / recipe.yawVariants));
    }
    assets.push(row);
    progress(i + 1);
  }
  return {
    yawVariants: recipe.yawVariants,
    bankVariants: banks.length,
    ...(banks.length > 1 ? { bankDegrees } : {}),
    palettes: Object.fromEntries(Object.entries(recipe.palettes).map(([name, colors]) => [name, colors.map(rgb555)])),
    brakeLamp: { off: rgb555(recipe.brakeLamp.off), on: rgb555(recipe.brakeLamp.on) },
    assets,
    pictures,
  };
}
