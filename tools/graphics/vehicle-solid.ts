import { unpackRgba } from '../../src/image/rgb555.js';
import type { VehiclePictureRecipe, VehicleView } from './vehicle-picture-recipe.js';

/**
 * A vehicle's solid, built from its four views: the space every view's outline allows, in vehicle coordinates with the
 * origin at the base point (the centre of mass seen from above, on the body's underside plane, the road at rest), x to
 * the right, y up and z forward. Its surface carries the views' colors. Dimensions come from the mechanics document.
 */

/** The solid's grid step, metres. */
const VOXEL = 0.01;
/** The share of a wheel's radius kept unstretched in the side view, so a wheel stays round. */
const WHEEL_KEEP = 1.12;
/** The share of a tyre's radius that turns visibly: inside it the side view is smeared about the hub. */
const RIM_SHARE = 0.7;
/** A near-white pixel: the summed channel distance from white below which a `white` background is told. */
const WHITE_DISTANCE = 45;
/** The radius, metres, of the disk that opens an outline: parts thinner than it (mirrors) are taken apart. */
const THIN_PART_RADIUS = 0.09;
/** How far, metres, a mirror stands proud of the body's half width at its stations. */
const MIRROR_PROUD = 0.04;
/** The rounding of the solid's edges, its surface normals and its edge measure: Gaussian sigmas, metres. */
const ROUNDING_SIGMA = 0.025;
const NORMAL_SIGMA = 0.02;
const EDGE_SIGMA = 0.05;
/** A view colors a surface by the fourth power of how squarely it faces it. */
const FACING_POWER = 4;
/** A view's colors are trusted this many pixels inside its outline. */
const VIEW_MARGIN_PIXELS = 3;
/** A surface darker than this value is dark: tyre in a wheel, glass in the glasshouse. */
const DARK_VALUE = 75;
/** Brake lamps lie within this distance, metres, of the tail. */
const LAMP_DEPTH = 0.4;
const UNSEEN_COLOR = [25, 25, 27] as const;
const UNDERSIDE_COLOR = [18, 18, 20] as const;

export interface VehicleDimensions {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly frontAxle: number;
  readonly rearAxle: number;
  readonly frontWheelRadius: number;
  readonly rearWheelRadius: number;
}

/** A decoded view: its colors and which pixels are the vehicle. */
export interface ViewPicture {
  readonly width: number;
  readonly height: number;
  /** Three channels per pixel, 0–255. */
  readonly rgb: Float32Array;
  readonly inside: Uint8Array;
}

/** The solid's surface, one entry per surface point. */
export interface VehicleSolid {
  readonly count: number;
  /** Positions and outward normals, three values per point. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** The views' color at each point, three channels 0–255. */
  readonly colors: Float32Array;
  /** 0 on flat panels, towards 1 on sharp outward edges. */
  readonly edge: Float32Array;
  readonly paint: Uint8Array;
  readonly glass: Uint8Array;
  readonly lamp: Uint8Array;
  /** The outline seen from above: x and z of every column the solid occupies. */
  readonly footprint: Float32Array;
  /** The farthest the solid reaches from the base point's vertical axis, and its height, metres. */
  readonly reach: number;
  readonly height: number;
}

// ---- rasters --------------------------------------------------------------------------------------------------------

/** The cells joined to a seed set through `open` cells, four ways. */
function flood(open: Uint8Array, width: number, height: number, seeds: readonly number[]): Uint8Array {
  const reached = new Uint8Array(open.length);
  const stack: number[] = [];
  for (const seed of seeds)
    if (open[seed] && !reached[seed]) {
      reached[seed] = 1;
      stack.push(seed);
    }
  while (stack.length) {
    const cell = stack.pop()!;
    const x = cell % width,
      y = (cell - x) / width;
    const visit = (next: number) => {
      if (open[next] && !reached[next]) {
        reached[next] = 1;
        stack.push(next);
      }
    };
    if (x > 0) visit(cell - 1);
    if (x < width - 1) visit(cell + 1);
    if (y > 0) visit(cell - width);
    if (y < height - 1) visit(cell + width);
  }
  return reached;
}

/** The four-connected parts of a mask: a label per cell (0 outside) and each part's cell count from label 1. */
function label(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(mask.length);
  const sizes = [0];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    labels[start] = id;
    while (stack.length) {
      const cell = stack.pop()!;
      size++;
      const x = cell % width,
        y = (cell - x) / width;
      const visit = (next: number) => {
        if (mask[next] && !labels[next]) {
          labels[next] = id;
          stack.push(next);
        }
      };
      if (x > 0) visit(cell - 1);
      if (x < width - 1) visit(cell + 1);
      if (y > 0) visit(cell - width);
      if (y < height - 1) visit(cell + width);
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/** Decode one view: its colors, and the vehicle as the largest part that is not background. */
export function readViewPicture(
  pixels: Uint32Array,
  width: number,
  height: number,
  background: VehiclePictureRecipe['background'],
): ViewPicture {
  const rgb = new Float32Array(width * height * 3);
  const candidate = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    const { r, g, b, a } = unpackRgba(pixels[i]!);
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    candidate[i] = background === 'alpha' ? +(a < 128) : +(765 - r - g - b < WHITE_DISTANCE);
  }
  let outside: Uint8Array = candidate;
  if (background === 'white') {
    // White inside the vehicle (a lamp, a highlight) is not background: background reaches the picture's border.
    const border: number[] = [];
    for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
    outside = flood(candidate, width, height, border);
    if (!outside.includes(1)) throw new RangeError('A view shows no white background at its border');
  }
  const vehicle = outside.map((cell) => +!cell);
  const { labels, sizes } = label(vehicle, width, height);
  let largest = 0;
  for (let id = 1; id < sizes.length; id++) if (largest === 0 || sizes[id]! > sizes[largest]!) largest = id;
  if (largest === 0) throw new RangeError('A view shows no vehicle');
  const inside = new Uint8Array(width * height);
  for (let i = 0; i < inside.length; i++) inside[i] = +(labels[i] === largest);
  return { width, height, rgb, inside };
}

/** Bilinear sample of a one-channel raster at pixel-centre coordinates; outside it is `beyond`. */
function sampleMask(mask: Uint8Array, width: number, height: number, u: number, v: number): number {
  const x0 = Math.floor(u),
    y0 = Math.floor(v);
  const fx = u - x0,
    fy = v - y0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]!);
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x0 + 1, y0) * fx * (1 - fy) +
    at(x0, y0 + 1) * (1 - fx) * fy +
    at(x0 + 1, y0 + 1) * fx * fy
  );
}

/** Bilinear sample of a picture's colors, the nearest pixel beyond its edge. */
function sampleColor(picture: ViewPicture, u: number, v: number, out: Float32Array, at: number, weight: number): void {
  const { width, height, rgb } = picture;
  const cu = Math.min(Math.max(u, 0), width - 1),
    cv = Math.min(Math.max(v, 0), height - 1);
  const x0 = Math.min(Math.floor(cu), width - 2 < 0 ? 0 : width - 2),
    y0 = Math.min(Math.floor(cv), height - 2 < 0 ? 0 : height - 2);
  const x1 = Math.min(x0 + 1, width - 1),
    y1 = Math.min(y0 + 1, height - 1);
  const fx = cu - x0,
    fy = cv - y0;
  for (let c = 0; c < 3; c++) {
    const value =
      rgb[(y0 * width + x0) * 3 + c]! * (1 - fx) * (1 - fy) +
      rgb[(y0 * width + x1) * 3 + c]! * fx * (1 - fy) +
      rgb[(y1 * width + x0) * 3 + c]! * (1 - fx) * fy +
      rgb[(y1 * width + x1) * 3 + c]! * fx * fy;
    out[at + c] = out[at + c]! + weight * value;
  }
}

/**
 * Squared Euclidean distance from every cell to the nearest `feature` cell (Felzenszwalb and Huttenlocher's exact
 * transform); infinite where there is none.
 */
function squaredDistanceTo(feature: Uint8Array, width: number, height: number): Float64Array {
  const INF = 1e20;
  const out = new Float64Array(width * height);
  const length = Math.max(width, height);
  const f = new Float64Array(length),
    d = new Float64Array(length),
    z = new Float64Array(length + 1);
  const v = new Int32Array(length);
  const pass = (n: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = 0;
      for (;;) {
        const p = v[k]!;
        s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
        if (s > z[k]!) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1]! < q) k++;
      const p = v[k]!;
      d[q] = (q - p) * (q - p) + f[p]!;
    }
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = feature[y * width + x] ? 0 : INF;
    pass(height);
    for (let y = 0; y < height; y++) out[y * width + x] = d[y]!;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = out[y * width + x]!;
    pass(width);
    for (let x = 0; x < width; x++) out[y * width + x] = d[x]!;
  }
  return out;
}

/** Signed distance to a mask's edge in cells: negative inside. */
function signedDistance(mask: Uint8Array, width: number, height: number): Float32Array {
  const outside = squaredDistanceTo(mask, width, height);
  const inside = squaredDistanceTo(
    mask.map((cell) => +!cell),
    width,
    height,
  );
  return Float32Array.from(outside, (value, i) => Math.sqrt(value) - Math.sqrt(inside[i]!));
}

/** A mask opened by a disk of `radius` cells: what a disk that fits inside it can cover. Beyond the raster is empty. */
function openByDisk(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const pw = width + 2,
    ph = height + 2;
  const empty = new Uint8Array(pw * ph).fill(1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) empty[(y + 1) * pw + x + 1] = +!mask[y * width + x];
  const toEmpty = squaredDistanceTo(empty, pw, ph);
  const eroded = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) eroded[y * width + x] = +(toEmpty[(y + 1) * pw + x + 1]! > radius * radius);
  const toEroded = squaredDistanceTo(eroded, width, height);
  return Uint8Array.from(toEroded, (value) => +(value <= radius * radius));
}

/** A separable Gaussian blur of a volume in place, each axis mirrored at its ends. */
function blur(volume: Float32Array, nx: number, ny: number, nz: number, sigma: number): void {
  const radius = Math.floor(4 * sigma + 0.5);
  const kernel = new Float64Array(2 * radius + 1);
  let total = 0;
  for (let i = -radius; i <= radius; i++) total += kernel[i + radius] = Math.exp((-0.5 * i * i) / (sigma * sigma));
  for (let i = 0; i < kernel.length; i++) kernel[i] = kernel[i]! / total;
  const line = new Float64Array(Math.max(nx, ny, nz) + 2 * radius);
  const axis = (n: number, stride: number, start: number) => {
    for (let i = 0; i < n; i++) line[i + radius] = volume[start + i * stride]!;
    for (let i = 0; i < radius; i++) {
      // mirrored: d c b a | a b c d
      line[radius - 1 - i] = line[radius + Math.min(i, n - 1)]!;
      line[radius + n + i] = line[radius + Math.max(n - 1 - i, 0)]!;
    }
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) sum += kernel[k]! * line[i + k]!;
      volume[start + i * stride] = sum;
    }
  };
  // index = (x * ny + y) * nz + z
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) axis(nz, 1, (x * ny + y) * nz);
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) axis(ny, nz, x * ny * nz + z);
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) axis(nx, ny * nz, y * nz + z);
}

/** Piecewise-linear interpolation through rising `xs`, held at its ends. */
function interpolate(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]!) return ys[0]!;
  for (let i = 1; i < xs.length; i++)
    if (x <= xs[i]!) return ys[i - 1]! + ((ys[i]! - ys[i - 1]!) * (x - xs[i - 1]!)) / (xs[i]! - xs[i - 1]!);
  return ys[ys.length - 1]!;
}

/** Whether a point lies inside a polygon (the even-odd rule). */
function insidePolygon(polygon: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!,
      [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < xi + ((xj - xi) * (y - yi)) / (yj - yi)) inside = !inside;
  }
  return inside;
}

// ---- the views' fit to the vehicle ------------------------------------------------------------------------------

/** Where each view shows a point of the vehicle, in that view's pixel-centre coordinates. */
export interface ViewFit {
  /** The stations of the nose and the tail. */
  readonly front: number;
  readonly rear: number;
  side(z: number, y: number): readonly [number, number];
  top(z: number, x: number): readonly [number, number];
  frontView(x: number, y: number): readonly [number, number];
  rearView(x: number, y: number): readonly [number, number];
  /** The side view's pixels per metre of height, and its rows of the two hubs. */
  readonly sideScale: number;
}

/**
 * Fit the views to the mechanics document: heights by each view's road and roof rows, widths by its overall width, and
 * stations so that the wheels stand at the axles and the ends at the overall length. The side view is stretched
 * between those marks only, never across a wheel.
 */
export function fitViews(recipe: VehiclePictureRecipe, vehicle: VehicleDimensions): ViewFit {
  const { side, top, front, rear } = recipe;
  const sideScale = (side.road - side.roof) / vehicle.height;
  const overhang = vehicle.length - vehicle.frontAxle - vehicle.rearAxle;
  const zFront = vehicle.frontAxle + overhang * side.frontOverhangShare;
  const zRear = zFront - vehicle.length;
  const keepFront = vehicle.frontWheelRadius * WHEEL_KEEP,
    keepRear = vehicle.rearWheelRadius * WHEEL_KEEP;
  // Stations fall from the nose to the tail while columns rise.
  const sideBack = [
    -zFront,
    -(vehicle.frontAxle + keepFront),
    -(vehicle.frontAxle - keepFront),
    vehicle.rearAxle - keepRear,
    vehicle.rearAxle + keepRear,
    -zRear,
  ];
  const sideColumn = [
    side.frontEnd,
    side.frontWheel - keepFront * sideScale,
    side.frontWheel + keepFront * sideScale,
    side.rearWheel - keepRear * sideScale,
    side.rearWheel + keepRear * sideScale,
    side.rearEnd,
  ];
  const stationAtSideColumn = (column: number) => -interpolate(column, sideColumn, sideBack);
  const topBack = [-zFront, ...top.ties.map(([sideColumnOfTie]) => -stationAtSideColumn(sideColumnOfTie)), -zRear];
  const topColumn = [top.frontEnd, ...top.ties.map(([, column]) => column), top.rearEnd];
  const topScale = top.width / vehicle.width;
  const frontScale = front.width / vehicle.width,
    frontRise = (front.road - front.roof) / vehicle.height;
  const rearScale = rear.width / vehicle.width,
    rearRise = (rear.road - rear.roof) / vehicle.height;
  return {
    front: zFront,
    rear: zRear,
    sideScale,
    side: (z, y) => [interpolate(-z, sideBack, sideColumn), side.road - y * sideScale],
    top: (z, x) => [interpolate(-z, topBack, topColumn), top.centre - x * topScale],
    // Seen from the front the vehicle's right is on the left; seen from behind it is on the right.
    frontView: (x, y) => [front.centre - x * frontScale, front.road - y * frontRise],
    rearView: (x, y) => [rear.centre + x * rearScale, rear.road - y * rearRise],
  };
}

/** A turning wheel: inside `radius` every pixel takes the mean color of its circle about the hub. */
function spinWheel(picture: ViewPicture, hubX: number, hubY: number, radius: number): void {
  const steps = Math.ceil(radius * 2) + 2;
  const profile = new Float32Array(steps * 3);
  const sample = new Float32Array(3);
  for (let i = 0; i < steps; i++) {
    const r = i * 0.5;
    sample.fill(0);
    for (let a = 0; a < 360; a++) {
      const angle = (a * Math.PI) / 180;
      sampleColor(picture, hubX + r * Math.cos(angle), hubY + r * Math.sin(angle), sample, 0, 1 / 360);
    }
    profile.set(sample, i * 3);
  }
  const { width, height, rgb } = picture;
  for (let y = Math.max(0, Math.floor(hubY - radius)); y <= Math.min(height - 1, Math.ceil(hubY + radius)); y++)
    for (let x = Math.max(0, Math.floor(hubX - radius)); x <= Math.min(width - 1, Math.ceil(hubX + radius)); x++) {
      const distance = Math.hypot(x - hubX, y - hubY);
      if (distance > radius) continue;
      const at = Math.min(distance * 2, steps - 1.001),
        i = Math.floor(at),
        f = at - i;
      for (let c = 0; c < 3; c++)
        rgb[(y * width + x) * 3 + c] = profile[i * 3 + c]! * (1 - f) + profile[(i + 1) * 3 + c]! * f;
    }
}

// ---- the solid --------------------------------------------------------------------------------------------------

/** Build the solid of `vehicle` from its views by its recipe. The side view's wheels are drawn turning. */
export function buildVehicleSolid(
  recipe: VehiclePictureRecipe,
  vehicle: VehicleDimensions,
  views: Readonly<Record<VehicleView, ViewPicture>>,
): VehicleSolid {
  const fit = fitViews(recipe, vehicle);
  const hubRow = (radius: number) => recipe.side.road - radius * fit.sideScale;
  spinWheel(
    views.side,
    recipe.side.frontWheel,
    hubRow(vehicle.frontWheelRadius),
    vehicle.frontWheelRadius * fit.sideScale * RIM_SHARE,
  );
  spinWheel(
    views.side,
    recipe.side.rearWheel,
    hubRow(vehicle.rearWheelRadius),
    vehicle.rearWheelRadius * fit.sideScale * RIM_SHARE,
  );

  // The grid: cell centres. x spans the widest view, y the height, z the length, each with a margin.
  const half = vehicle.width / 2 + 0.22;
  const nx = 2 * Math.round(half / VOXEL),
    ny = Math.ceil((vehicle.height + 0.04) / VOXEL),
    nz = Math.ceil((fit.front - fit.rear + 0.06) / VOXEL);
  const xAt = (i: number) => -nx * VOXEL * 0.5 + (i + 0.5) * VOXEL,
    yAt = (j: number) => (j + 0.5) * VOXEL,
    zAt = (k: number) => fit.rear - 0.03 + (k + 0.5) * VOXEL;

  // Each view's outline on the grid; a vehicle is symmetric, so a cell is inside when it and its mirror are.
  const inside = (view: ViewPicture, [u, v]: readonly [number, number]) =>
    +(sampleMask(view.inside, view.width, view.height, u, v) > 0.5);
  const sideOutline = new Uint8Array(nz * ny); // [z][y]
  const topOutline = new Uint8Array(nz * nx); // [z][x]
  const frontOutline = new Uint8Array(nx * ny); // [x][y]
  const rearOutline = new Uint8Array(nx * ny);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) sideOutline[k * ny + j] = inside(views.side, fit.side(zAt(k), yAt(j)));
    for (let i = 0; i < nx; i++) topOutline[k * nx + i] = inside(views.top, fit.top(zAt(k), xAt(i)));
  }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      frontOutline[i * ny + j] = inside(views.front, fit.frontView(xAt(i), yAt(j)));
      rearOutline[i * ny + j] = inside(views.rear, fit.rearView(xAt(i), yAt(j)));
    }
  const mirrorX = (outline: Uint8Array, rows: number, across: (row: number, i: number) => number) => {
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < nx / 2; i++) {
        const a = across(row, i),
          b = across(row, nx - 1 - i);
        outline[a] = outline[b] = outline[a]! & outline[b]!;
      }
  };
  mirrorX(topOutline, nz, (k, i) => k * nx + i);
  mirrorX(frontOutline, ny, (j, i) => i * ny + j);
  mirrorX(rearOutline, ny, (j, i) => i * ny + j);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny && yAt(j) < recipe.rear.undersideFromFront; j++)
      rearOutline[i * ny + j] = rearOutline[i * ny + j]! & frontOutline[i * ny + j]!;

  // Mirrors are thin parts of a facing outline. Left in it they would run the length of the cabin, so each outline
  // loses them and the front view's are put back at their own stations.
  const radius = THIN_PART_RADIUS / VOXEL;
  const withoutMirrors = (outline: Uint8Array) => {
    // openByDisk reads [row][column] rasters: use x as the column.
    const raster = new Uint8Array(nx * ny);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) raster[j * nx + i] = outline[i * ny + j]!;
    const body = openByDisk(raster, nx, ny, radius);
    const thin = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const near =
          body[j * nx + i]! ||
          (i > 0 && body[j * nx + i - 1]!) ||
          (i < nx - 1 && body[j * nx + i + 1]!) ||
          (j > 0 && body[(j - 1) * nx + i]!) ||
          (j < ny - 1 && body[(j + 1) * nx + i]!);
        thin[j * nx + i] = +(raster[j * nx + i]! && !near);
      }
    const { labels, sizes } = label(thin, nx, ny);
    const height = new Float64Array(sizes.length),
      outward = new Float64Array(sizes.length);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const id = labels[j * nx + i]!;
        height[id] = height[id]! + yAt(j);
        outward[id] = outward[id]! + Math.abs(xAt(i));
      }
    const mirrors = new Uint8Array(nx * ny); // [x][y]
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const id = labels[j * nx + i]!;
        if (id === 0 || sizes[id]! <= 40) continue;
        const meanHeight = height[id]! / sizes[id]!;
        if (
          meanHeight > recipe.mirrors.low &&
          meanHeight < recipe.mirrors.high &&
          outward[id]! / sizes[id]! > recipe.mirrors.outside
        ) {
          mirrors[i * ny + j] = 1;
          outline[i * ny + j] = 0;
        }
      }
    return mirrors;
  };
  const mirrors = withoutMirrors(frontOutline);
  withoutMirrors(rearOutline);
  // A mirror's stations: where the top view stands proud of the body's half width.
  const halfWidth = new Float64Array(nz);
  for (let k = 0; k < nz; k++) {
    let cells = 0;
    for (let i = 0; i < nx; i++) cells += topOutline[k * nx + i]!;
    halfWidth[k] = (cells * VOXEL) / 2;
  }
  const bodyHalves = Array.from(halfWidth)
    .filter((_, k) => zAt(k) > recipe.mirrors.from - 0.7 && zAt(k) < recipe.mirrors.to)
    .sort((a, b) => a - b);
  const bodyHalf =
    bodyHalves.length % 2
      ? bodyHalves[(bodyHalves.length - 1) / 2]!
      : (bodyHalves[bodyHalves.length / 2 - 1]! + bodyHalves[bodyHalves.length / 2]!) / 2;

  // Where a mirror stands, the top view's outline is the mirror's, not the body's: there the body's runs straight
  // between the stations either side of the mirror.
  const mirrorAt = Array.from(
    halfWidth,
    (width, k) => width > bodyHalf + MIRROR_PROUD && zAt(k) > recipe.mirrors.from && zAt(k) < recipe.mirrors.to,
  );
  for (let k = 0; k < nz; k++) {
    if (!mirrorAt[k]) continue;
    let before = k,
      after = k;
    while (before > 0 && mirrorAt[before]) before--;
    while (after < nz - 1 && mirrorAt[after]) after++;
    const body = halfWidth[before]! + ((halfWidth[after]! - halfWidth[before]!) * (k - before)) / (after - before);
    for (let i = 0; i < nx; i++) if (Math.abs(xAt(i)) > body) topOutline[k * nx + i] = 0;
  }

  // The solid: inside the side and top outlines, and inside the facing outline, which passes from the rear view's to
  // the front view's between the recipe's stations.
  const frontDistance = signedDistance(
    Uint8Array.from({ length: nx * ny }, (_, at) => frontOutline[(at % nx) * ny + Math.floor(at / nx)]!),
    nx,
    ny,
  );
  const rearDistance = signedDistance(
    Uint8Array.from({ length: nx * ny }, (_, at) => rearOutline[(at % nx) * ny + Math.floor(at / nx)]!),
    nx,
    ny,
  );
  const size = nx * ny * nz;
  const at = (i: number, j: number, k: number) => (i * ny + j) * nz + k;
  const raw = new Uint8Array(size);
  for (let k = 0; k < nz; k++) {
    const z = zAt(k);
    const t = Math.min(
      Math.max((z - recipe.outlines.rearUntil) / (recipe.outlines.frontFrom - recipe.outlines.rearUntil), 0),
      1,
    );
    const w = t * t * (3 - 2 * t);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const facing = w * frontDistance[j * nx + i]! + (1 - w) * rearDistance[j * nx + i]! < 0;
        raw[at(i, j, k)] = +(
          (facing && sideOutline[k * ny + j]! && topOutline[k * nx + i]!) ||
          (mirrorAt[k] === true && mirrors[i * ny + j]!)
        );
      }
  }
  // The recipe's corrections: each lowers the top of the columns inside its polygon.
  for (const { polygon, depth, feather } of recipe.lowered) {
    const outside = new Uint8Array(nz * nx);
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++) {
        const [u, v] = fit.top(zAt(k), xAt(i));
        const [, mirrored] = fit.top(zAt(k), -xAt(i));
        outside[k * nx + i] = +!(insidePolygon(polygon, u, v) || insidePolygon(polygon, u, mirrored));
      }
    const toEdge = squaredDistanceTo(outside, nx, nz);
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++) {
        const t = Math.min((Math.sqrt(toEdge[k * nx + i]!) * VOXEL) / feather, 1);
        const drop = depth * t * t * (3 - 2 * t);
        let top = ny - 1;
        while (top >= 0 && !raw[at(i, top, k)]) top--;
        for (let j = top; j >= 0 && yAt(j) > yAt(top) - drop; j--) raw[at(i, j, k)] = 0;
      }
  }
  // Round the edges the outlines leave square, keeping the tyres on the road.
  const field = Float32Array.from(raw);
  blur(field, nx, ny, nz, ROUNDING_SIGMA / VOXEL);
  const solid = Uint8Array.from(field, (value) => +(value > 0.5));
  {
    const floor = new Float32Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) floor[i * nz + k] = raw[at(i, 0, k)]!;
    blur(floor, nx, 1, nz, 1);
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) if (raw[at(i, 0, k)] && floor[i * nz + k]! > 0.5) solid[at(i, 0, k)] = 1;
  }
  for (let n = 0; n < size; n++) field[n] = solid[n]!;
  blur(field, nx, ny, nz, NORMAL_SIGMA / VOXEL);
  const wide = Float32Array.from(solid);
  blur(wide, nx, ny, nz, EDGE_SIGMA / VOXEL);

  // Surface points: solid cells with an empty neighbour, moved onto the smoothed surface.
  const occupied = (i: number, j: number, k: number) =>
    i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && solid[at(i, j, k)] === 1;
  const slope = (i: number, j: number, k: number, di: number, dj: number, dk: number, n: number, c: number) => {
    // central difference, one-sided at the grid's ends
    const lo = c > 0 ? field[at(i - di, j - dj, k - dk)]! : field[at(i, j, k)]!;
    const hi = c < n - 1 ? field[at(i + di, j + dj, k + dk)]! : field[at(i, j, k)]!;
    return (hi - lo) / (c > 0 && c < n - 1 ? 2 : 1);
  };
  const positions: number[] = [],
    normals: number[] = [],
    edge: number[] = [];
  let reach = 0;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nz; k++) {
        if (!solid[at(i, j, k)]) continue;
        if (
          occupied(i - 1, j, k) &&
          occupied(i + 1, j, k) &&
          occupied(i, j - 1, k) &&
          occupied(i, j + 1, k) &&
          occupied(i, j, k - 1) &&
          occupied(i, j, k + 1)
        )
          continue;
        const gx = slope(i, j, k, 1, 0, 0, nx, i),
          gy = slope(i, j, k, 0, 1, 0, ny, j),
          gz = slope(i, j, k, 0, 0, 1, nz, k);
        const g = Math.hypot(gx, gy, gz) + 1e-9;
        const nxn = -gx / g,
          nyn = -gy / g,
          nzn = -gz / g;
        const shift = Math.min(Math.max((field[at(i, j, k)]! - 0.5) / g, -1), 1) * VOXEL;
        const x = xAt(i) + nxn * shift,
          y = Math.max(yAt(j) + nyn * shift, 0),
          z = zAt(k) + nzn * shift;
        positions.push(x, y, z);
        normals.push(nxn, nyn, nzn);
        edge.push(Math.min(Math.max(0.5 - wide[at(i, j, k)]!, 0), 0.5) * 2);
        reach = Math.max(reach, Math.hypot(x, z));
      }
  const count = edge.length;
  const footprint: number[] = [];
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      let any = false;
      for (let j = 0; j < ny && !any; j++) any = solid[at(i, j, k)] === 1;
      if (any) footprint.push(xAt(i), zAt(k));
    }

  // Color: each view by how squarely the surface faces it, where the view shows the vehicle there.
  const trusted = (view: ViewPicture) => {
    // cells at least VIEW_MARGIN_PIXELS inside the outline
    const toOutside = squaredDistanceTo(
      view.inside.map((cell) => +!cell),
      view.width,
      view.height,
    );
    return Uint8Array.from(toOutside, (value) => +(value > VIEW_MARGIN_PIXELS * VIEW_MARGIN_PIXELS));
  };
  const trust = {
    side: trusted(views.side),
    top: trusted(views.top),
    front: trusted(views.front),
    rear: trusted(views.rear),
  };
  const colors = new Float32Array(count * 3);
  const paint = new Uint8Array(count),
    glass = new Uint8Array(count),
    lamp = new Uint8Array(count);
  const [pr, pg, pb] = recipe.paint.color;
  const paintSum = pr + pg + pb || 1;
  const tread = vehicle.width / 2 - 0.37;
  for (let n = 0; n < count; n++) {
    const x = positions[n * 3]!,
      y = positions[n * 3 + 1]!,
      z = positions[n * 3 + 2]!;
    const nxn = normals[n * 3]!,
      nyn = normals[n * 3 + 1]!,
      nzn = normals[n * 3 + 2]!;
    const places = {
      side: fit.side(z, y),
      top: fit.top(z, x),
      front: fit.frontView(x, y),
      rear: fit.rearView(x, y),
    };
    const facing = { side: Math.abs(nxn), top: Math.max(nyn, 0), front: Math.max(nzn, 0), rear: Math.max(-nzn, 0) };
    const weights = { side: 0, top: 0, front: 0, rear: 0 };
    let total = 0;
    for (const name of ['side', 'top', 'front', 'rear'] as const) {
      const view = views[name];
      weights[name] =
        facing[name] ** FACING_POWER *
        sampleMask(trust[name], view.width, view.height, places[name][0], places[name][1]);
      total += weights[name];
    }
    if (nyn < -0.55) colors.set(UNDERSIDE_COLOR, n * 3);
    else if (total < 1e-6) colors.set(UNSEEN_COLOR, n * 3);
    else
      for (const name of ['side', 'top', 'front', 'rear'] as const)
        sampleColor(views[name], places[name][0], places[name][1], colors, n * 3, weights[name] / total);
    const r = colors[n * 3]!,
      g = colors[n * 3 + 1]!,
      b = colors[n * 3 + 2]!;
    const value = Math.max(r, g, b);
    const sum = r + g + b || 1;
    const dark = value < DARK_VALUE;
    const wheel =
      Math.abs(x) > tread &&
      (Math.hypot(z - vehicle.frontAxle, y - vehicle.frontWheelRadius) < vehicle.frontWheelRadius * 1.05 ||
        Math.hypot(z + vehicle.rearAxle, y - vehicle.rearWheelRadius) < vehicle.rearWheelRadius * 1.05);
    paint[n] = +(
      !wheel &&
      value >= recipe.paint.brightness &&
      Math.hypot(r / sum - pr / paintSum, g / sum - pg / paintSum, b / sum - pb / paintSum) <= recipe.paint.tolerance
    );
    const pane =
      total >= 1e-6 &&
      weights.side / total > 0.5 &&
      recipe.glass.sidePanes.some((polygon) => insidePolygon(polygon, places.side[0], places.side[1]));
    glass[n] = +(pane || (dark && !wheel && y > recipe.glass.above && z > recipe.glass.from && z < recipe.glass.to));
    if (pane) paint[n] = 0;
    if (total >= 1e-6 && weights.rear / total > 0.5 && z < fit.rear + LAMP_DEPTH) {
      const [u, v] = places.rear;
      lamp[n] = +recipe.brakeLamps.some(([left, top, right, bottom]) => u > left && u < right && v > top && v < bottom);
    }
  }
  return {
    count,
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors,
    edge: Float32Array.from(edge),
    paint,
    glass,
    lamp,
    footprint: Float32Array.from(footprint),
    reach,
    height: vehicle.height,
  };
}
