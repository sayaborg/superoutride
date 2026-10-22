import type { VehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import type { Rgb } from './vehicle-picture-recipe.js';
import type { VehiclePictureStyle } from './vehicle-pictures.js';
import { createProceduralVehicleSolid, type Point3, type SurfaceColor } from './procedural-vehicle-solid.js';

/** Original provisional geometry; every shape fraction is an author estimate, documented in racing-vehicles.md. */
export const RACING_PICTURES = {
  NSR500_1987: 'nsr500-1987',
  YZR500_0W98: 'yzr500-0w98',
  MCLAREN_MP4_4: 'mclaren-mp4-4',
  FERRARI_640: 'ferrari-640',
  LOTUS_79_SPECIAL: 'lotus-79-special',
} as const;
export type RacingVehicleId = keyof typeof RACING_PICTURES;
const black: Rgb = [16, 16, 18],
  dark: Rgb = [55, 55, 60],
  metal: Rgb = [145, 148, 153],
  white: Rgb = [245, 245, 240],
  red: Rgb = [225, 30, 24],
  blue: Rgb = [25, 45, 150],
  gold: Rgb = [185, 140, 45],
  yellow: Rgb = [245, 215, 35];
const palette: readonly Rgb[] = [
  black,
  dark,
  metal,
  [195, 197, 198],
  white,
  [20, 35, 45],
  [110, 160, 180],
  red,
  [130, 18, 15],
  blue,
  yellow,
  gold,
  [25, 135, 55],
  [210, 150, 100],
];
export const RACING_PICTURE_STYLE: VehiclePictureStyle = {
  yawVariants: 64,
  slots: { body: 0, neutral: 5, glass: 2, accent: 7 },
  bodyKeys: [],
  palettes: { race: palette, 'race-2': palette, 'race-3': palette, 'race-4': palette },
  paint: { exposure: 1 },
  glass: { glint: 240 },
  brakeLamp: { off: black, on: black },
};
const digits: Record<string, readonly string[]> = {
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '5': ['111', '100', '110', '001', '110'],
  '7': ['111', '001', '010', '010', '010'],
};
function numberAt(value: string, u: number, v: number, width: number, height: number): boolean {
  const column = Math.floor((u / width) * (value.length * 4 - 1)),
    row = Math.floor((v / height) * 5);
  if (column < 0 || column >= value.length * 4 - 1 || row < 0 || row >= 5) return false;
  return digits[value[Math.floor(column / 4)]!]![row]![column % 4] === '1';
}
function car(id: RacingVehicleId, m: VehicleMechanicsDocument) {
  const s = createProceduralVehicleSolid(),
    lotus = id === 'LOTUS_79_SPECIAL',
    ferrari = id === 'FERRARI_640';
  const body = lotus ? black : ferrari ? red : white,
    trim = lotus ? gold : red,
    number = lotus ? '5' : ferrari ? '27' : '12';
  const x = m.overallWidth / 2,
    z = m.overallLength / 2,
    h = m.overallHeight;
  const bodyColor: SurfaceColor = (p, n) => {
    if (Math.abs(n[0]) > 0.5 && numberAt(number, p[0] > 0 ? p[2] - 0.04 : 0.29 - p[2], 0.6 * h - p[1], 0.25, 0.25 * h))
      return lotus ? gold : black;
    if (lotus && (Math.abs(p[1] - 0.39 * h) < 0.018 || Math.abs(p[1] - 0.17 * h) < 0.013)) return gold;
    if (!lotus && !ferrari && p[1] > 0.32 * h && p[2] < -0.1) return red;
    return body;
  };
  // Long narrow nose and low tub. The cockpit is a dark opening, with a separate seated driver.
  s.ellipsoid([0, 0.36 * h, 0.2 * z], [0.26, 0.19 * h, 0.78 * z], bodyColor);
  s.box([0, 0.17 * h, 0.88 * z], [0.82 * x, 0.035 * h, 0.13 * z], lotus ? black : ferrari ? dark : white);
  for (const side of [-1, 1]) {
    s.box([side * 0.77 * x, 0.2 * h, 0.88 * z], [0.025, 0.12 * h, 0.14 * z], trim);
    s.box([side * 0.53 * x, 0.29 * h, -0.18 * z], [0.26 * x, 0.19 * h, 0.43 * z], bodyColor);
    if (lotus) s.box([side * 0.8 * x, 0.13 * h, -0.18 * z], [0.018, 0.095 * h, 0.43 * z], gold);
    // Inlets ahead of the sidepods; dry open wheels and exposed wishbones at both axles.
    s.box([side * 0.52 * x, 0.34 * h, 0.26 * z], [0.18 * x, 0.1 * h, 0.006], black);
    for (const [axle, track, radius, width] of [
      [m.frontAxle, m.frontTrack, m.frontWheelRadius, 0.27],
      [-m.rearAxle, m.rearTrack, m.rearWheelRadius, 0.42],
    ]) {
      s.wheel([(side * track!) / 2, radius!, axle!], radius!, width!, lotus ? gold : metal, 5);
      for (const offset of [-0.17, 0.17])
        s.cylinder([side * 0.2, 0.25 * h, axle! + offset], [(side * track!) / 2, 0.25 * h, axle!], 0.018, metal);
    }
    // Tailpipes remain visible below the rear wing; MP4/4 has a compact turbo outlet on each side.
    s.cylinder([side * 0.27, 0.29 * h, -0.48 * z], [side * 0.34, 0.26 * h, -0.87 * z], 0.035, metal);
  }
  s.ellipsoid([0, 0.49 * h, 0.12 * z], [0.25, 0.05 * h, 0.34], black);
  s.ellipsoid([0, 0.57 * h, 0.08 * z], [0.16, 0.15 * h, 0.21], ferrari ? red : lotus ? white : red);
  const helmet: SurfaceColor = (p, n) =>
    p[1] < 0.73 * h && p[2] > 0.16 * z && n[2] > 0.3
      ? black
      : lotus
        ? p[1] > 0.79 * h
          ? red
          : white
        : ferrari
          ? p[1] > 0.79 * h
            ? blue
            : white
          : yellow;
  s.ellipsoid([0, 0.73 * h, 0.17 * z], [0.125, 0.14 * h, 0.13], helmet);
  if (ferrari) {
    s.ellipsoid([0, 0.65 * h, -0.2 * z], [0.16, 0.34 * h, 0.4 * z], red);
    s.ellipsoid([0, 0.88 * h, -0.03 * z], [0.115, 0.09 * h, 0.025], black);
  } else if (lotus) {
    s.box([0, 0.56 * h, -0.32 * z], [0.24, 0.16 * h, 0.3 * z], black);
    s.cylinder([-0.13, 0.62 * h, -0.1 * z], [0, 0.94 * h, -0.12 * z], 0.023, metal);
    s.cylinder([0, 0.94 * h, -0.12 * z], [0.13, 0.62 * h, -0.1 * z], 0.023, metal);
  } else {
    s.ellipsoid([0, 0.49 * h, -0.4 * z], [0.28, 0.18 * h, 0.42 * z], red);
    s.cylinder([-0.14, 0.52 * h, -0.05 * z], [0, 0.86 * h, -0.1 * z], 0.025, black);
    s.cylinder([0, 0.86 * h, -0.1 * z], [0.14, 0.52 * h, -0.05 * z], 0.025, black);
  }
  // Distinct high rear wing, stays and numbered end plates. No rear lamps.
  for (const side of [-1, 1]) {
    s.box([side * 0.22, 0.57 * h, -0.8 * z], [0.025, 0.25 * h, 0.05], metal);
    s.box([side * 0.77 * x, 0.78 * h, -0.81 * z], [0.02, 0.2 * h, 0.16 * z], (p) =>
      numberAt(number, p[0] > 0 ? 0.25 + p[2] + 0.67 * z : -p[2] - 0.67 * z, 0.94 * h - p[1], 0.25, 0.24 * h)
        ? lotus
          ? gold
          : white
        : lotus
          ? black
          : ferrari
            ? black
            : red,
    );
  }
  s.box([0, 0.9 * h, -0.81 * z], [0.77 * x, 0.045 * h, 0.16 * z], lotus ? black : ferrari ? black : white);
  if (lotus) s.box([0, 0.95 * h, -0.81 * z], [0.7 * x, 0.004, 0.012], gold);
  return [s.finish()];
}
function bike(id: RacingVehicleId, m: VehicleMechanicsDocument) {
  const s = createProceduralVehicleSolid(),
    yamaha = id === 'YZR500_0W98',
    main = yamaha ? red : blue;
  const front = m.frontAxle,
    rear = -m.rearAxle,
    h = m.overallHeight,
    w = m.overallWidth;
  const number = yamaha ? '3' : '2';
  const fairing: SurfaceColor = (p, n) => {
    const plate = Math.abs(n[0]) > 0.5 && p[2] > 0.12 && p[2] < 0.53 && p[1] > 0.39 && p[1] < 0.7;
    if (plate) return numberAt(number, p[0] > 0 ? p[2] - 0.25 : 0.47 - p[2], 0.66 - p[1], 0.22, 0.24) ? black : yellow;
    if (n[2] > 0.55 && p[1] > 0.56 && p[1] < 0.83)
      return numberAt(number, 0.1 - p[0], 0.8 - p[1], 0.2, 0.22) ? black : yellow;
    if (p[1] < 0.31 || p[1] > 0.68) return white;
    if (!yamaha && Math.abs(p[1] - 0.43) < 0.018) return gold;
    if (!yamaha && Math.abs(p[1] - 0.46) < 0.018) return red;
    return main;
  };
  s.wheel([0, m.frontWheelRadius, front], m.frontWheelRadius, 0.12, yamaha ? red : white, 3);
  s.wheel([0, m.rearWheelRadius, rear], m.rearWheelRadius, 0.18, yamaha ? red : white, 3);
  s.ellipsoid([0, 0.49, 0.28], [w * 0.4, 0.31, 0.57], fairing);
  s.ellipsoid([0, 0.69, -0.03], [w * 0.29, 0.18, 0.31], white);
  s.ellipsoid([0, 0.7, rear + 0.03], [w * 0.26, 0.14, 0.26], (p, n) =>
    Math.abs(n[0]) > 0.4 && p[1] > 0.65 ? yellow : main,
  );
  s.box([0, 0.72, -0.25], [w * 0.23, 0.035, 0.2], black);
  s.ellipsoid([0, 0.82, 0.43], [w * 0.22, 0.13, 0.18], [145, 175, 185]);
  for (const side of [-1, 1]) {
    s.cylinder([side * 0.11, 0.74, 0.45], [side * 0.08, m.frontWheelRadius, front], 0.025, metal);
    s.cylinder([side * 0.16, 0.62, 0.02], [side * 0.13, 0.38, -0.34], 0.035, metal);
    // Yamaha's RIGHT arm arches above the front-pair exhaust, unlike its nearly straight left arm.
    const a: Point3 = [side * 0.13, 0.38, -0.24],
      b: Point3 = [side * 0.13, m.rearWheelRadius, rear];
    if (yamaha && side === 1) {
      const arch: Point3 = [0.13, 0.52, -0.46];
      s.cylinder(a, arch, 0.025, metal);
      s.cylinder(arch, b, 0.025, metal);
    } else s.cylinder(a, b, 0.025, metal);
  }
  // Each real side is authored. Yamaha lower pipes cross beneath the engine and both exit on the RIGHT.
  const routes: readonly (readonly Point3[])[] = yamaha
    ? [
        [
          [-0.12, 0.29, 0.35],
          [0.12, 0.17, 0.03],
          [0.24, 0.22, -0.34],
          [0.23, 0.36, -0.75],
        ],
        [
          [0.12, 0.32, 0.35],
          [-0.08, 0.15, 0.08],
          [0.18, 0.16, -0.32],
          [0.2, 0.28, -0.77],
        ],
        [
          [-0.1, 0.53, -0.08],
          [-0.21, 0.54, -0.39],
          [-0.19, 0.64, -0.87],
        ],
        [
          [0.1, 0.53, -0.08],
          [0.21, 0.55, -0.38],
          [0.18, 0.67, -0.87],
        ],
      ]
    : [
        [
          [0.1, 0.32, 0.31],
          [0.22, 0.17, 0.02],
          [0.22, 0.22, -0.42],
          [0.2, 0.39, -0.83],
        ],
        [
          [-0.1, 0.32, 0.3],
          [-0.18, 0.18, 0.0],
          [-0.18, 0.23, -0.45],
          [-0.18, 0.37, -0.81],
        ],
        [
          [0.1, 0.53, -0.06],
          [0.21, 0.56, -0.34],
          [0.2, 0.66, -0.85],
        ],
        [
          [-0.1, 0.53, -0.06],
          [-0.21, 0.53, -0.36],
          [-0.2, 0.65, -0.85],
        ],
      ];
  const clearance = (p: Point3): Point3 => [p[0], Math.abs(p[0]) > 0.15 ? Math.max(0.36, p[1]) : p[1], p[2]];
  for (const route of routes)
    for (let i = 1; i < route.length; i++)
      s.cylinder(clearance(route[i - 1]!), clearance(route[i]!), i === 2 ? 0.045 : 0.025, dark);
  // Tucked rider, bent arms, thighs and boots move with every bank; helmet has a front visor.
  s.ellipsoid([0, 0.83, -0.12], [0.19, 0.14, 0.3], main);
  for (const side of [-1, 1]) {
    s.cylinder([side * 0.14, 0.83, 0.02], [side * 0.24, 0.68, 0.11], 0.065, white);
    s.cylinder([side * 0.24, 0.68, 0.11], [side * 0.16, 0.75, 0.38], 0.045, main);
    s.cylinder([side * 0.16, 0.75, -0.29], [side * 0.25, 0.48, -0.08], 0.075, white);
    s.cylinder([side * 0.25, 0.48, -0.08], [side * 0.2, 0.35, -0.38], 0.055, main);
    s.ellipsoid([side * 0.2, 0.32, -0.36], [0.065, 0.06, 0.12], black);
  }
  s.ellipsoid([0, h - 0.13, 0.23], [0.14, 0.13, 0.16], (p, n) =>
    n[2] > 0.45 && p[1] > h - 0.16 && p[1] < h - 0.08 ? black : p[1] > h - 0.07 ? (yamaha ? red : white) : main,
  );
  return [-60, -40, -20, 0, 20, 40, 60].map((degrees) => s.finish((degrees * Math.PI) / 180));
}
export function racingVehicleSolids(id: RacingVehicleId, mechanics: VehicleMechanicsDocument) {
  return id === 'NSR500_1987' || id === 'YZR500_0W98' ? bike(id, mechanics) : car(id, mechanics);
}
