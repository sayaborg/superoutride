import type { VehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import type { Rgb } from './vehicle-picture-recipe.js';
import type { VehiclePictureStyle } from './vehicle-pictures.js';
import { createProceduralVehicleSolid, type Point3 } from './procedural-vehicle-solid.js';

/** Original authoring geometry, in metres. Details and rider poses are visual estimates, not measured drawings. */
export const ROAD_BIKE_PICTURES = {
  CB900F_1981: 'cb900f-1981',
  GSX1100SZ: 'gsx1100sz',
  GPZ900R_A1: 'gpz900r-a1',
  GSX_R750_1985: 'gsx-r750-1985',
  VMAX1200_1985: 'vmax1200-1985',
} as const;
export type RoadBikeId = keyof typeof ROAD_BIKE_PICTURES;
/** Authored image range only: neither a physics constraint nor a claim of road-bike cornering clearance. */
export const ROAD_BIKE_BANK_DEGREES = 45;
const black: Rgb = [18, 19, 22],
  dark: Rgb = [55, 58, 62],
  metal: Rgb = [145, 148, 153],
  silver: Rgb = [200, 203, 206],
  white: Rgb = [245, 245, 240],
  amber: Rgb = [240, 140, 20],
  red: Rgb = [210, 28, 32],
  blue: Rgb = [28, 62, 160],
  paint: Rgb = [180, 180, 180];
const bodies: Record<RoadBikeId, Rgb> = {
  CB900F_1981: [18, 20, 24],
  GSX1100SZ: silver,
  GPZ900R_A1: red,
  GSX_R750_1985: white,
  VMAX1200_1985: [115, 20, 35],
};

/** Body shades vary by palette; lights, metal, tires and the anonymous rider retain their colors. */
export function roadBikePictureStyle(id: RoadBikeId): VehiclePictureStyle {
  const shade = (body: Rgb, factor: number): Rgb => [
    Math.round(body[0] * factor),
    Math.round(body[1] * factor),
    Math.round(body[2] * factor),
  ];
  const palette = (body: Rgb): readonly Rgb[] => [
    body,
    shade(body, 0.7),
    shade(body, 0.38),
    black,
    dark,
    metal,
    silver,
    white,
    [20, 35, 45],
    [110, 150, 165],
    red,
    amber,
    blue,
    [115, 110, 105],
  ];
  return {
    yawVariants: 64,
    slots: { body: 3, neutral: 5, glass: 2, accent: 4 },
    bodyKeys: [240, 170, 90],
    palettes: {
      stock: palette(bodies[id]),
      red: palette([240, 60, 72]),
      blue: palette([40, 100, 200]),
      black: palette([45, 47, 52]),
    },
    paint: { exposure: 1 },
    glass: { glint: 240 },
    brakeLamp: { off: [115, 15, 18], on: [255, 45, 32] },
  };
}

export function roadBikeSolids(id: RoadBikeId, m: VehicleMechanicsDocument) {
  const s = createProceduralVehicleSolid(),
    cb = id === 'CB900F_1981',
    katana = id === 'GSX1100SZ',
    gpz = id === 'GPZ900R_A1',
    gsxr = id === 'GSX_R750_1985',
    vmax = id === 'VMAX1200_1985';
  const front = m.frontAxle,
    rear = -m.rearAxle,
    frontRadius = m.frontWheelRadius,
    rearRadius = m.rearWheelRadius,
    seat = vmax ? 0.765 : cb ? 0.81 : katana ? 0.775 : gpz ? 0.78 : 0.755,
    end = rear - 0.22,
    shoulder = cb || vmax ? 1.15 : 1.04,
    headZ = cb || vmax ? -0.04 : 0.2,
    handleY = cb || vmax ? 1.02 : 0.87,
    handleZ = front - 0.32,
    frontWidth = cb || katana ? 0.089 : gpz ? 0.12 : 0.11,
    rearWidth = cb ? 0.108 : katana ? 0.114 : vmax ? 0.15 : gsxr ? 0.14 : 0.13,
    frontRim = ((cb || katana ? 19 : gpz ? 16 : 18) * 0.0254) / 2,
    rearRim = ((katana ? 17 : vmax ? 15 : 18) * 0.0254) / 2,
    spokes = cb ? 5 : katana ? 6 : vmax ? 5 : 3;
  const tube = (points: readonly Point3[], radius: number, color: Rgb) => {
    for (let i = 1; i < points.length; i++) s.cylinder(points[i - 1]!, points[i]!, radius, color);
  };
  s.wheel([0, frontRadius, front], frontRadius, frontWidth, cb || vmax ? silver : metal, spokes, frontRim);
  s.wheel([0, rearRadius, rear], rearRadius, rearWidth, cb || vmax ? silver : metal, spokes, rearRim);
  s.cylinder(
    [rearWidth / 2 + 0.008, rearRadius, rear],
    [rearWidth / 2 + 0.014, rearRadius, rear],
    cb ? 0.1485 : katana ? 0.1375 : gpz ? 0.135 : gsxr ? 0.14 : 0.141,
    metal,
  );
  if (vmax)
    for (const side of [-1, 1])
      s.cylinder(
        [side * (rearWidth / 2 + 0.002), rearRadius, rear],
        [side * (rearWidth / 2 + 0.006), rearRadius, rear],
        rearRim,
        (p) => (Math.hypot(p[1] - rearRadius, p[2] - rear) > rearRim - 0.02 ? silver : dark),
      );
  // Narrow curved fenders leave both wheels readable from the side and follow the authored wheel radii.
  for (const [z, radius, width] of [
    [front, frontRadius, frontWidth],
    [rear, rearRadius, rearWidth],
  ] as const)
    for (let angle = -0.75; angle <= 0.75; angle += 0.08) {
      const center: Point3 = [0, radius + (radius + 0.025) * Math.cos(angle), z + (radius + 0.025) * Math.sin(angle)];
      s.cylinder([-width * 0.6, center[1], center[2]], [width * 0.6, center[1], center[2]], 0.014, paint, 'paint');
    }
  // Forks, brake discs and steering head. Anti-dive housings are visual parts, not a suspension model.
  for (const side of [-1, 1]) {
    s.cylinder(
      [side * 0.085, handleY, handleZ + 0.04],
      [side * 0.085, frontRadius, front],
      vmax ? 0.02 : gsxr ? 0.0205 : gpz ? 0.019 : 0.0185,
      silver,
    );
    s.cylinder([side * 0.085, frontRadius + 0.25, front - 0.1], [side * 0.085, frontRadius, front], 0.027, metal);
    s.cylinder(
      [side * (frontWidth / 2 + 0.008), frontRadius, front],
      [side * (frontWidth / 2 + 0.014), frontRadius, front],
      cb ? 0.138 : vmax ? 0.141 : gpz ? 0.14 : gsxr ? 0.15 : 0.135,
      metal,
    );
    if (katana || gpz || gsxr) s.box([side * 0.085, frontRadius + 0.1, front + 0.015], [0.032, 0.047, 0.032], dark);
    const swing: Point3 = [side * 0.11, 0.43, -0.16];
    s.cylinder(swing, [side * 0.11, rearRadius, rear], vmax && side < 0 ? 0.055 : 0.028, gsxr ? silver : dark);
    if (cb || katana || vmax) {
      s.cylinder([side * 0.16, seat - 0.03, rear + 0.16], [side * 0.16, rearRadius + 0.02, rear + 0.03], 0.032, silver);
      for (let i = 0; i < 8; i++)
        s.ellipsoid([side * 0.16, rearRadius + 0.11 + i * 0.03, rear + 0.07 + i * 0.009], [0.039, 0.009, 0.039], dark);
    }
    tube(
      [
        [side * 0.16, 0.42, -0.18],
        [side * 0.18, 0.72, 0.25],
        [side * 0.1, 0.83, front - 0.28],
      ],
      gsxr ? 0.035 : 0.023,
      gsxr ? silver : dark,
    );
  }
  // Left-side chain and sprocket, or the VMAX's shaft housing/final-drive case on that side.
  if (vmax) {
    s.cylinder([-0.12, 0.38, -0.15], [-0.12, rearRadius, rear], 0.045, metal);
    s.cylinder([-0.135, rearRadius, rear], [-0.075, rearRadius, rear], 0.105, metal);
  } else {
    s.cylinder([-rearWidth / 2 - 0.015, rearRadius, rear], [-rearWidth / 2 - 0.025, rearRadius, rear], 0.105, metal);
    for (const y of [rearRadius - 0.085, rearRadius + 0.085])
      s.cylinder([-rearWidth / 2 - 0.026, y, rear], [-0.13, 0.42 + (y - rearRadius) * 0.5, -0.13], 0.009, dark);
  }
  // Four-cylinder block; the V4's two fore/aft banks and large unconnected intake-look side covers are separate.
  s.ellipsoid([0, 0.37, -0.03], [0.23, 0.16, 0.23], vmax || cb ? black : metal);
  if (vmax) {
    for (const z of [-0.09, 0.15]) {
      s.box([0, 0.51, z], [0.2, 0.12, 0.08], dark);
      for (let y = 0.43; y < 0.64; y += 0.035) s.box([0, y, z], [0.215, 0.007, 0.09], metal);
    }
    for (const side of [-1, 1]) {
      s.ellipsoid([side * 0.22, 0.77, 0.1], [0.09, 0.13, 0.19], silver);
      s.box([side * 0.268, 0.78, 0.17], [0.025, 0.08, 0.065], dark);
      for (let i = 0; i < 4; i++)
        s.box([side * 0.2, 0.64 - i * 0.035, -0.34 + i * 0.013], [0.025, 0.015, 0.14 - i * 0.025], silver);
    }
  } else {
    s.box([0, 0.53, 0.06], [0.25, 0.13, 0.16], katana ? metal : dark);
    if (cb || katana) for (let y = 0.42; y < 0.67; y += 0.035) s.box([0, y, 0.06], [0.26, 0.008, 0.17], dark);
  }
  if (gpz || gsxr || vmax) {
    s.box([0, gsxr ? 0.58 : 0.52, 0.37], [0.23, gsxr ? 0.07 : 0.13, 0.025], dark);
    for (let y = gsxr ? 0.53 : 0.42; y < (gsxr ? 0.64 : 0.64); y += 0.025)
      s.cylinder([-0.22, y, 0.398], [0.22, y, 0.398], 0.006, metal);
  }
  // Stock headers and silencers: single right outlet on the GSX-R; paired outlets on the other four.
  for (const x of [-0.18, -0.06, 0.06, 0.18])
    tube(
      [
        [x, 0.54, 0.23],
        [x, 0.31, 0.3],
        [gsxr ? 0.13 : Math.sign(x) * 0.14, 0.25, -0.13],
      ],
      0.018,
      metal,
    );
  for (const side of gsxr ? [1] : [-1, 1]) {
    tube(
      [
        [side * 0.14, 0.25, -0.13],
        [side * 0.25, 0.31, -0.34],
        [side * 0.26, 0.36, rear - 0.13],
      ],
      vmax ? 0.06 : 0.047,
      cb || vmax ? silver : dark,
    );
    s.cylinder([side * 0.26, 0.36, rear - 0.12], [side * 0.26, 0.36, rear - 0.15], 0.027, black);
  }
  // Tank (VMAX: upper airbox/electrical cover, actual tank is under the seat), seat and tail.
  const tankBand = (p: Point3, n: Point3) => cb && Math.abs(n[0]) > 0.35 && Math.abs(p[1] - (seat + 0.07)) < 0.03;
  s.ellipsoid(
    [0, seat + 0.05, 0.03],
    [vmax ? 0.2 : 0.235, 0.16, 0.32],
    (p, n) => (tankBand(p, n) ? (p[1] > seat + 0.07 ? amber : red) : paint),
    (p, n) => (tankBand(p, n) ? 'plain' : 'paint'),
  );
  s.ellipsoid([0, seat - 0.035, rear + 0.12], [0.22, 0.1, 0.29], katana ? black : paint, katana ? 'plain' : 'paint');
  if (cb)
    for (const side of [-1, 1])
      s.cylinder([side * 0.18, seat - 0.045, rear - 0.07], [side * 0.2, seat - 0.045, rear + 0.29], 0.014, red);
  s.ellipsoid([0, seat + 0.01, -0.39], [0.205, 0.055, 0.32], (p) =>
    gsxr ? blue : katana && p[2] < -0.44 ? silver : black,
  );
  s.box([0, seat - 0.1, end + 0.015], [0.12, 0.045, 0.027], black);
  s.box([0, seat - 0.1, end - 0.015], [0.1, 0.033, 0.012], red, 'lamp');
  s.box([0, seat - 0.22, end + 0.02], [0.09, 0.065, 0.012], black);
  s.box([0, seat - 0.23, end + 0.005], [0.075, 0.04, 0.006], white);
  if (katana) {
    s.box([0, 0.88, front - 0.16], [0.22, 0.115, 0.16], paint, 'paint');
    s.ellipsoid([0, 1.025, front - 0.29], [0.18, 0.13, 0.1], dark, 'glass');
    s.box([0, 0.92, front + 0.006], [0.135, 0.065, 0.015], white);
  } else if (gpz || gsxr) {
    // Side slabs keep the steering wheel opening clear and distinguish the full fairing from KATANA's nose.
    for (const side of [-1, 1]) {
      s.ellipsoid([side * 0.21, 0.52, 0.2], [0.045, 0.24, 0.38], paint, 'paint');
      s.box([side * 0.252, gpz ? 0.42 : 0.45, 0.2], [0.008, 0.055, 0.32], gpz ? silver : blue);
      s.box([side * 0.252, 0.66, 0.04], [0.01, 0.05, 0.1], dark);
    }
    s.ellipsoid([0, 0.88, front - 0.2], [0.25, 0.16, 0.23], gsxr ? blue : paint, gsxr ? 'plain' : 'paint');
    s.ellipsoid([0, 1.05, front - 0.31], [0.19, 0.15, 0.15], dark, 'glass');
    if (gpz) s.box([0, 0.91, front + 0.025], [0.15, 0.06, 0.018], white);
    else
      for (const side of [-1, 1]) {
        s.cylinder([side * 0.108, 0.91, front + 0.015], [side * 0.108, 0.91, front + 0.035], 0.087, black);
        s.cylinder([side * 0.108, 0.91, front + 0.035], [side * 0.108, 0.91, front + 0.042], 0.073, white);
      }
  } else {
    s.cylinder([0, 0.96, front - 0.22], [0, 0.96, front - 0.08], 0.105, cb ? black : silver);
    s.cylinder([0, 0.96, front - 0.08], [0, 0.96, front - 0.065], 0.09, white);
  }
  // Stock mirrors and amber indicators. Turn signals are fixed appearance, not new game controls.
  for (const side of [-1, 1]) {
    tube(
      [
        [side * 0.18, handleY, handleZ],
        [side * 0.31, handleY + 0.13, handleZ + 0.01],
        [side * (m.overallWidth / 2 - 0.03), handleY + 0.17, handleZ],
      ],
      0.012,
      black,
    );
    s.ellipsoid(
      [side * (m.overallWidth / 2 - 0.03), handleY + 0.17, handleZ],
      cb || vmax ? [0.045, 0.045, 0.025] : [0.06, 0.038, 0.025],
      dark,
    );
    s.ellipsoid(
      [side * (m.overallWidth / 2 - 0.03), handleY + 0.17, handleZ - 0.024],
      cb || vmax ? [0.037, 0.037, 0.004] : [0.05, 0.027, 0.004],
      silver,
    );
    for (const [z, y] of [
      [front - 0.08, 0.84],
      [end + 0.03, seat - 0.11],
    ] as const) {
      s.cylinder([side * 0.13, y, z], [side * 0.27, y, z], 0.012, black);
      s.box([side * 0.27, y, z], [0.035, 0.025, 0.025], amber);
    }
    s.cylinder([side * 0.1, handleY, handleZ], [side * 0.29, handleY + 0.015, handleZ], 0.015, black);
  }
  // Anonymous period road rider: more upright on the two naked bikes, forward on the three sports bikes.
  s.ellipsoid([0, shoulder - 0.13, -0.17], [0.18, 0.24, cb || vmax ? 0.15 : 0.24], dark);
  for (const side of [-1, 1]) {
    tube(
      [
        [side * 0.14, shoulder, -0.12],
        [side * 0.25, handleY + 0.02, 0.02],
        [side * 0.28, handleY + 0.025, handleZ],
      ],
      0.055,
      dark,
    );
    tube(
      [
        [side * 0.15, seat + 0.03, -0.4],
        [side * 0.26, 0.56, -0.03],
        [side * 0.21, 0.39, -0.32],
      ],
      0.065,
      dark,
    );
    s.ellipsoid([side * 0.21, 0.36, -0.28], [0.06, 0.06, 0.13], black);
  }
  const headY = shoulder + 0.22;
  s.ellipsoid([0, headY, headZ], [0.13, 0.15, 0.15], (p, n) =>
    n[2] > 0.4 && p[1] > headY - 0.035 && p[1] < headY + 0.055 ? black : white,
  );
  return Array.from({ length: 7 }, (_, bank) => s.finish(((bank - 3) * ROAD_BIKE_BANK_DEGREES * Math.PI) / (3 * 180)));
}
