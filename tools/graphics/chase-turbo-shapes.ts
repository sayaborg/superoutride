import type { VehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import type { Rgb } from './vehicle-picture-recipe.js';
import type { VehiclePictureStyle } from './vehicle-pictures.js';
import { createProceduralVehicleSolid, type Point3, type SurfaceColor } from './procedural-vehicle-solid.js';

/** Original, provisional authoring geometry. Dimensions and limitations are recorded in chase-turbo-vehicles.md. */
export const CHASE_TURBO_PICTURES = {
  PORSCHE_928_S4_1987: 'porsche-928-s4-1987',
  TURBO_ESPRIT_1984: 'turbo-esprit-1984',
  COUNTACH_5000_QV_1988: 'countach-5000-qv-1988',
  '911_TURBO_3_3_1986': '911-turbo-3-3-1986',
  FERRARI_GTO_1985: 'ferrari-gto-1985',
  PORSCHE_928_S_1984: 'porsche-928-s-1984',
  TOYOTA_PICKUP_1980: 'toyota-pickup-1980',
  FERRARI_F40_1990: 'ferrari-f40-1990',
  PORSCHE_959_1988: 'porsche-959-1988',
  CORVETTE_C4_1984: 'corvette-c4-1984',
  AUSTIN_MINI_850_1964: 'austin-mini-850-1964',
  WRANGLER_YJ_1995: 'wrangler-yj-1995',
  NOVA_250_1977: 'nova-250-1977',
  NOVA_9C1_1977: 'nova-9c1-1977',
} as const;
export type ChaseTurboId = keyof typeof CHASE_TURBO_PICTURES;
const black: Rgb = [18, 20, 23],
  dark: Rgb = [55, 58, 62],
  metal: Rgb = [145, 148, 153],
  silver: Rgb = [200, 203, 206],
  white: Rgb = [245, 245, 240],
  red: Rgb = [210, 28, 32],
  blue: Rgb = [28, 62, 160],
  amber: Rgb = [240, 140, 20],
  paint: Rgb = [180, 180, 180];
const bodies: Record<ChaseTurboId, Rgb> = {
  PORSCHE_928_S4_1987: [35, 37, 41],
  TURBO_ESPRIT_1984: white,
  COUNTACH_5000_QV_1988: [245, 215, 35],
  '911_TURBO_3_3_1986': silver,
  FERRARI_GTO_1985: blue,
  PORSCHE_928_S_1984: red,
  TOYOTA_PICKUP_1980: [190, 115, 55],
  FERRARI_F40_1990: red,
  PORSCHE_959_1988: white,
  CORVETTE_C4_1984: blue,
  AUSTIN_MINI_850_1964: [45, 115, 75],
  WRANGLER_YJ_1995: [180, 150, 95],
  NOVA_250_1977: [120, 170, 190],
  NOVA_9C1_1977: black,
};

export function chaseTurboPictureStyle(id: ChaseTurboId): VehiclePictureStyle {
  const shade = (body: Rgb, f: number): Rgb => [
    Math.round(body[0] * f),
    Math.round(body[1] * f),
    Math.round(body[2] * f),
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
      white: palette(white),
    },
    paint: { exposure: 1 },
    glass: { glint: 240 },
    brakeLamp: { off: [115, 15, 18], on: [255, 45, 32] },
  };
}

export function chaseTurboSolids(id: ChaseTurboId, m: VehicleMechanicsDocument) {
  const s = createProceduralVehicleSolid(),
    x = m.overallWidth / 2,
    z = m.overallLength / 2,
    h = m.overallHeight;
  const s4 = id === 'PORSCHE_928_S4_1987',
    early928 = id === 'PORSCHE_928_S_1984',
    p928 = s4 || early928,
    p930 = id === '911_TURBO_3_3_1986',
    p959 = id === 'PORSCHE_959_1988',
    esprit = id === 'TURBO_ESPRIT_1984',
    countach = id === 'COUNTACH_5000_QV_1988',
    gto = id === 'FERRARI_GTO_1985',
    f40 = id === 'FERRARI_F40_1990',
    c4 = id === 'CORVETTE_C4_1984',
    mini = id === 'AUSTIN_MINI_850_1964',
    pickup = id === 'TOYOTA_PICKUP_1980',
    jeep = id === 'WRANGLER_YJ_1995',
    police = id === 'NOVA_9C1_1977',
    nova = police || id === 'NOVA_250_1977';
  const mix = (a: Point3, b: Point3, t: number): Point3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const bodyColor: SurfaceColor = (p) => (police && Math.abs(p[2]) < 0.32 * z ? white : paint);
  const material = (p: Point3) => (police && Math.abs(p[2]) < 0.32 * z ? ('plain' as const) : ('paint' as const));
  // Sample authored quadrilateral panels with the same spacing as the shared solid. Wheel openings are geometry.
  const quad = (
    a: Point3,
    b: Point3,
    c: Point3,
    d: Point3,
    color: SurfaceColor = bodyColor,
    kind: 'paint' | 'glass' | 'plain' = 'paint',
    arches = false,
    windowOpening = false,
  ) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cross: Point3 = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const length = Math.hypot(...cross);
    if (!length) return;
    const facing =
      cross[0] * (a[0] + b[0] + c[0] + d[0]) +
      cross[1] * (a[1] + b[1] + c[1] + d[1] - 1.4 * h) +
      cross[2] * (a[2] + b[2] + c[2] + d[2]);
    const sign = facing < 0 ? -1 : 1;
    const normal: Point3 = [(sign * cross[0]) / length, (sign * cross[1]) / length, (sign * cross[2]) / length];
    const distance = (p: Point3, q: Point3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const nu = Math.ceil(Math.max(distance(a, b), distance(d, c)) / 0.008),
      nv = Math.ceil(Math.max(distance(a, d), distance(b, c)) / 0.008);
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        if (windowOpening && i / nu > 0.08 && i / nu < 0.92 && j / nv > 0.12 && j / nv < 0.88) continue;
        const p = mix(mix(a, b, i / nu), mix(d, c, i / nu), j / nv);
        if (
          arches &&
          [
            [m.frontAxle, m.frontWheelRadius],
            [-m.rearAxle, m.rearWheelRadius],
          ].some(
            ([axle, r]) => Math.abs(p[0]) > 0.58 * x && Math.hypot(p[2] - axle!, Math.max(0, p[1] - r!)) < r! + 0.035,
          )
        )
          continue;
        s.point(p, normal, color, kind === 'paint' ? material : kind);
      }
  };
  const window = (a: Point3, b: Point3, c: Point3, d: Point3) => {
    const cx = (a[0] + b[0] + c[0] + d[0]) / 4,
      cz = (a[2] + b[2] + c[2] + d[2]) / 4;
    const inset = (u: number, v: number): Point3 => {
      const p = mix(mix(a, b, u), mix(d, c, u), v);
      return [
        p[0] + (Math.abs(cx) > 0.5 * x ? Math.sign(cx) * 0.006 : 0),
        p[1],
        p[2] + (Math.abs(cx) > 0.5 * x ? 0 : Math.sign(cz) * 0.006),
      ];
    };
    quad(inset(0.08, 0.12), inset(0.92, 0.12), inset(0.92, 0.88), inset(0.08, 0.88), black, 'glass');
  };
  const slab = (
    center: Point3,
    half: Point3,
    color: SurfaceColor = paint,
    kind: 'paint' | 'plain' | 'lamp' = 'paint',
  ) => s.box(center, half, color, kind);
  // Body sections: forward coordinate, half width, shoulder height, centre height (fractions of overall size).
  type Section = readonly [number, number, number, number];
  const stations: readonly Section[] = p928
    ? [
        [-1, 0.78, 0.38, 0.42],
        [-0.8, 1, 0.52, 0.57],
        [-0.15, 0.96, 0.57, 0.6],
        [0.48, 0.97, 0.5, 0.58],
        [0.85, 0.83, 0.36, 0.43],
        [1, 0.62, 0.29, 0.32],
      ]
    : p930 || p959
      ? [
          [-1, 0.76, 0.4, 0.48],
          [-0.7, 1, 0.5, 0.57],
          [-0.1, 0.88, 0.55, 0.6],
          [0.5, 0.89, 0.47, 0.5],
          [0.85, 0.85, 0.41, 0.43],
          [1, 0.68, 0.3, 0.32],
        ]
      : mini
        ? [
            [-1, 0.88, 0.57, 0.59],
            [-0.8, 1, 0.62, 0.64],
            [0.72, 1, 0.62, 0.64],
            [1, 0.88, 0.53, 0.55],
          ]
        : nova
          ? [
              [-1, 0.91, 0.5, 0.53],
              [-0.8, 1, 0.55, 0.57],
              [0.6, 1, 0.54, 0.57],
              [1, 0.92, 0.49, 0.51],
            ]
          : pickup
            ? [
                [-1, 0.94, 0.55, 0.55],
                [0.3, 0.94, 0.55, 0.55],
                [0.55, 0.92, 0.54, 0.55],
                [1, 0.88, 0.48, 0.5],
              ]
            : jeep
              ? [
                  [-0.9, 0.88, 0.48, 0.5],
                  [0.15, 0.88, 0.5, 0.53],
                  [0.45, 0.65, 0.57, 0.59],
                  [0.9, 0.65, 0.57, 0.59],
                ]
              : c4
                ? [
                    [-1, 0.88, 0.45, 0.49],
                    [-0.7, 1, 0.55, 0.58],
                    [0.05, 0.94, 0.54, 0.59],
                    [0.65, 0.97, 0.49, 0.55],
                    [1, 0.78, 0.32, 0.36],
                  ]
                : [
                    [-1, 0.88, 0.49, 0.52],
                    [-0.65, 1, 0.56, 0.58],
                    [0.15, 0.92, 0.49, 0.55],
                    [0.65, 0.94, 0.34, 0.4],
                    [1, 0.78, 0.24, 0.28],
                  ];
  const bottom = jeep ? 0.25 * h : pickup ? 0.18 * h : 0.13 * h;
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1]!,
      b = stations[i]!;
    for (const side of [-1, 1]) {
      const aa: Point3 = [side * a[1] * x, a[2] * h, a[0] * z],
        bb: Point3 = [side * b[1] * x, b[2] * h, b[0] * z];
      quad([aa[0], bottom, aa[2]], [bb[0], bottom, bb[2]], bb, aa, bodyColor, 'paint', true);
      // An open pickup bed has a floor and thin side rails, not a painted solid deck.
      if (pickup && b[0] <= 0.3) {
        quad(aa, bb, [bb[0] * 0.88, bb[1], bb[2]], [aa[0] * 0.88, aa[1], aa[2]]);
        quad(
          [aa[0] * 0.88, 0.28 * h, aa[2]],
          [bb[0] * 0.88, 0.28 * h, bb[2]],
          [bb[0] * 0.88, bb[1], bb[2]],
          [aa[0] * 0.88, aa[1], aa[2]],
          dark,
          'plain',
        );
      } else quad(aa, bb, [0, b[3] * h, b[0] * z], [0, a[3] * h, a[0] * z]);
    }
  }
  for (const index of [0, stations.length - 1]) {
    const a = stations[index]!;
    quad(
      [-a[1] * x, bottom, a[0] * z],
      [a[1] * x, bottom, a[0] * z],
      [a[1] * x, a[2] * h, a[0] * z],
      [-a[1] * x, a[2] * h, a[0] * z],
    );
  }
  if (pickup) slab([0, 0.29 * h, -0.36 * z], [0.8 * x, 0.025, 0.62 * z], dark, 'plain');
  // A separate cabin with framed front, rear and side glazing. Positive z faces the road ahead.
  const floor = (mini ? 0.63 : jeep ? 0.54 : pickup ? 0.56 : nova ? 0.56 : 0.56) * h;
  const roofFront =
    (mini ? 0.52 : jeep ? 0.21 : pickup ? 0.35 : nova ? 0.03 : p930 || p959 ? 0.08 : p928 || c4 ? -0.03 : 0.13) * z;
  const roofRear =
    (mini ? -0.62 : jeep ? -0.75 : pickup ? -0.02 : nova ? -0.42 : p930 || p959 ? -0.4 : p928 || c4 ? -0.4 : -0.24) * z;
  const baseFront = roofFront + (jeep ? 0.07 : pickup ? 0.16 : mini ? 0.13 : 0.3) * z,
    baseRear = roofRear - (jeep ? 0.06 : pickup ? 0.04 : mini ? 0.13 : nova ? 0.18 : 0.34) * z;
  const roofY = (police ? 0.92 : 1) * h,
    roofX = (jeep ? 0.8 : pickup ? 0.83 : mini ? 0.85 : nova ? 0.72 : countach ? 0.58 : 0.68) * x;
  const roofColor = jeep ? black : police ? white : paint;
  const roofKind = jeep || police ? 'plain' : 'paint';
  quad(
    [-roofX, roofY, roofRear],
    [roofX, roofY, roofRear],
    [roofX, roofY, roofFront],
    [-roofX, roofY, roofFront],
    roofColor,
    roofKind,
  );
  for (const [base, top] of [
    [baseFront, roofFront],
    [baseRear, roofRear],
  ]) {
    quad(
      [-0.87 * x, floor, base!],
      [0.87 * x, floor, base!],
      [roofX, roofY, top!],
      [-roofX, roofY, top!],
      roofColor,
      roofKind,
      false,
      true,
    );
    window([-0.87 * x, floor, base!], [0.87 * x, floor, base!], [roofX, roofY, top!], [-roofX, roofY, top!]);
  }
  for (const side of [-1, 1]) {
    const points: Point3[] = [
      [side * 0.87 * x, floor, baseRear],
      [side * 0.87 * x, floor, baseFront],
      [side * roofX, roofY, roofFront],
      [side * roofX, roofY, roofRear],
    ];
    quad(points[0]!, points[1]!, points[2]!, points[3]!, roofColor, roofKind, false, true);
    window(points[0]!, points[1]!, points[2]!, points[3]!);
    if (nova || mini || p928)
      s.cylinder(
        [side * 0.875 * x, floor + 0.02, -0.17 * z],
        [side * roofX, roofY, -0.17 * z],
        0.025,
        roofColor,
        roofKind,
      );
    slab([side * 0.96 * x, floor - 0.06, 0], [0.012, 0.018, 0.07], metal, 'plain');
    if (!mini) slab([side * 1.01 * x, floor + 0.08, baseFront - 0.18], [0.07, 0.04, 0.09], black, 'plain');
    for (const [axle, track, radius, width, rim] of [
      [
        m.frontAxle,
        m.frontTrack,
        m.frontWheelRadius,
        mini ? 0.13 : jeep ? 0.205 : pickup ? 0.165 : nova ? 0.185 : 0.225,
        mini ? 10 : pickup || nova ? 14 : countach || jeep ? 15 : f40 || p959 ? 17 : 16,
      ],
      [
        -m.rearAxle,
        m.rearTrack,
        m.rearWheelRadius,
        mini
          ? 0.13
          : jeep
            ? 0.205
            : pickup
              ? 0.165
              : nova
                ? 0.185
                : early928
                  ? 0.225
                  : countach
                    ? 0.345
                    : f40
                      ? 0.335
                      : gto
                        ? 0.265
                        : 0.245,
        mini ? 10 : pickup || nova ? 14 : countach || jeep ? 15 : f40 || p959 ? 17 : 16,
      ],
    ])
      s.wheel(
        [(side * track!) / 2, radius!, axle!],
        radius!,
        width!,
        metal,
        c4 ? 16 : pickup || jeep ? 6 : mini || nova ? 12 : 5,
        (rim! * 0.0254) / 2,
      );
  }
  // Lamps and trim remain fixed colors; the rear brake lamps use the existing reserved palette slot.
  const tailZ = stations[0]![0] * z - 0.012,
    noseZ = stations.at(-1)![0] * z + 0.012;
  const bumperY = (jeep ? 0.33 : pickup ? 0.23 : mini ? 0.27 : nova ? 0.29 : 0.22) * h;
  slab([0, bumperY, noseZ], [0.86 * x, 0.035, 0.045], mini || nova || pickup ? metal : black, 'plain');
  slab([0, bumperY, tailZ], [0.84 * x, 0.035, 0.04], mini || nova || pickup ? metal : black, 'plain');
  slab([0, bumperY + 0.08, tailZ - 0.045], [0.16, 0.055, 0.007], white, 'plain');
  const roundLamp = (cx: number, cy: number, cz: number, r: number, brake = false) =>
    s.cylinder([cx, cy, cz + 0.008], [cx, cy, cz - 0.012], r, brake ? red : white, brake ? 'lamp' : 'plain');
  for (const side of [-1, 1]) {
    if (c4 || gto || f40) for (const offset of [0.48, 0.72]) roundLamp(side * offset * x, 0.4 * h, tailZ, 0.075, true);
    else
      slab(
        [side * 0.67 * x, (pickup ? 0.43 : jeep ? 0.4 : mini ? 0.48 : p928 ? 0.43 : 0.4) * h, tailZ],
        [mini || jeep || pickup ? 0.07 : 0.2 * x, mini || pickup ? 0.1 : 0.055, 0.01],
        red,
        'lamp',
      );
    if (p930 || mini || nova) roundLamp(side * 0.68 * x, (mini ? 0.57 : nova ? 0.44 : 0.5) * h, noseZ, 0.09);
    else if (p928) s.ellipsoid([side * 0.65 * x, 0.45 * h, 0.78 * z], [0.13, 0.025, 0.16], white);
    else if (p959) s.ellipsoid([side * 0.68 * x, 0.44 * h, 0.79 * z], [0.13, 0.045, 0.18], white);
    else
      slab(
        [side * (jeep ? 0.49 : 0.64) * x, (jeep ? 0.5 : pickup ? 0.44 : 0.25) * h, noseZ],
        [jeep ? 0.095 : pickup ? 0.1 : 0.14, 0.065, 0.01],
        white,
        'plain',
      );
    slab([side * 0.72 * x, bumperY + 0.055, noseZ + 0.015], [0.055, 0.025, 0.012], amber, 'plain');
    if (!(mini || pickup || jeep || nova))
      slab([side * 0.2 * x, 0.15 * h, tailZ - 0.02], [0.045, 0.035, 0.07], metal, 'plain');
  }
  if (mini || nova || pickup || jeep) {
    slab(
      [0, (jeep ? 0.48 : mini ? 0.48 : pickup ? 0.43 : 0.44) * h, noseZ],
      [jeep ? 0.3 * x : 0.48 * x, jeep ? 0.1 * h : 0.075, 0.01],
      black,
      'plain',
    );
    for (let i = -3; i <= 3; i++)
      slab(
        [
          jeep ? i * 0.075 * x : 0,
          (jeep ? 0.48 : mini ? 0.48 : pickup ? 0.43 : 0.44) * h + (jeep ? 0 : i * 0.018),
          noseZ + 0.012,
        ],
        [jeep ? 0.018 : 0.45 * x, jeep ? 0.09 * h : 0.007, 0.005],
        metal,
        'plain',
      );
  }
  if (pickup) for (const side of [-1, 1]) slab([side * 0.83 * x, 0.56 * h, -0.36 * z], [0.035, 0.02, 0.63 * z]);
  if (early928) {
    slab([0, 0.3 * h, tailZ - 0.03], [0.8 * x, 0.055, 0.035], black, 'plain');
    for (const side of [-1, 1]) slab([side * 0.77 * x, 0.42 * h, tailZ - 0.014], [0.04, 0.05, 0.01], amber, 'plain');
  }
  if (jeep) {
    slab([0, 0.76 * h, -0.92 * z], [0.075, 0.025, 0.02], red, 'lamp');
    for (const side of [-1, 1]) slab([side * 0.8 * x, 0.46 * h, m.frontAxle], [0.18 * x, 0.025, 0.44], paint, 'paint');
    // 1995 family roll cage under a soft top, plus an upright rear spare.
    for (const side of [-1, 1])
      s.cylinder([side * 0.7 * x, 0.55 * h, -0.55 * z], [side * 0.7 * x, 0.93 * h, -0.55 * z], 0.035, black);
    s.cylinder([0, 0.53 * h, -0.91 * z], [0, 0.53 * h, -1.01 * z], 0.32, black);
    s.cylinder([0, 0.53 * h, -1.012 * z], [0, 0.53 * h, -1.016 * z], 0.18, metal);
  }
  if (p928 || p930 || p959 || countach || f40 || gto) {
    const wingY = (s4 ? 0.68 : early928 ? 0.52 : p930 ? 0.59 : p959 ? 0.62 : countach ? 0.88 : f40 ? 0.91 : 0.56) * h,
      wingZ = (p928 ? -0.82 : countach ? -0.83 : -0.87) * z,
      wingWidth = (countach ? 0.9 : f40 ? 0.95 : 0.79) * x;
    if (s4 || countach || f40 || p959)
      for (const side of [-1, 1])
        slab([side * (f40 ? 0.91 : 0.6) * x, (wingY + 0.48 * h) / 2, wingZ], [0.025, (wingY - 0.48 * h) / 2, 0.08 * z]);
    slab(
      [0, wingY, wingZ],
      [wingWidth, 0.035, (p930 ? 0.16 : 0.09) * z],
      p930 || early928 ? black : paint,
      p930 || early928 ? 'plain' : 'paint',
    );
  }
  if (esprit || countach || gto || f40) {
    for (let i = 0; i < 7; i++)
      slab([0, 0.59 * h, -(0.45 + i * 0.055) * z], [0.5 * x, 0.01, 0.014 * z], black, 'plain');
    for (const side of [-1, 1]) {
      slab([side * 0.94 * x, 0.43 * h, -0.38 * z], [0.018, 0.08, 0.13 * z], black, 'plain');
      if (countach) slab([side * 0.72 * x, 0.73 * h, -0.36 * z], [0.15, 0.1, 0.14], black, 'plain');
      if (gto || f40)
        for (let i = 0; i < 3; i++)
          slab([side * 0.92 * x, 0.42 * h, -(0.82 + i * 0.045) * z], [0.02, 0.095, 0.012], black, 'plain');
    }
  }
  if (f40) slab([0, 0.17 * h, tailZ - 0.03], [0.035, 0.035, 0.07], metal, 'plain');
  if (c4) slab([0, 0.46 * h, tailZ], [0.36, 0.08, 0.008], black, 'plain');
  if (police) {
    slab([0, 0.94 * h, -0.18 * z], [0.6 * x, 0.025, 0.11], metal, 'plain');
    for (const side of [-1, 1])
      slab([side * 0.43 * x, 0.975 * h, -0.18 * z], [0.14, 0.025 * h, 0.1], side < 0 ? red : blue, 'plain');
  }
  return [s.finish()];
}
