# M8.7 Varied-Elevation Medium/High-Speed Circuit

Status: current CIRCUIT DEV course-authoring authority above unchanged Core, topology, renderer,
camera and vehicle physics.

This document supersedes the current public CIRCUIT geometry in
`83_m8_4_dual_low_speed_circuit_complex.md`. M8.4 remains the historical record of the former
10.133 km dual low-speed-complex circuit. The M7.2 BRANCHING parent and its physical route gates,
handoff seams and successor content remain unchanged.

## 1. Architecture decision gate

1. Corner sequence, elevation and jump-producing road shape belong to CIRCUIT DEV authoring.
2. Existing RasterPath, HeightProfile and finite CircuitTopology compilation express the entire
   change without a new physics, camera or renderer primitive.
3. World pose, road height, support/contact state and race progress each retain one authority.
4. The CIRCUIT composition selects one new ordinary runtime; no course-section mode or route-kind
   branch is added below composition.
5. Jumps arise from ordinary speed, smooth road height and unilateral tire contact. There is no
   launch impulse, forced airborne flag, pose rewrite or jump trigger.
6. Open Core, chainage pseudo-depth, 200 m far depth, zero roll, finite lap unfolding and the
   ten-degree Raster-turn limit remain unchanged.
7. Regression proves corner-family distribution, explicit closure, relief/grade bounds, two
   natural airborne/recontact events, ordinary AI traversal and BRANCHING isolation.

## 2. Circuit geometry

The explicit closed lap is:

```text
lap length                         = 12076.480410657816 m (approximately 12.076 km)
high-speed sweep radius            = 680 m
medium-fast sweep radius           = 520 m
medium sweep radius                = 320 m
tight-medium sweep radius          = 190 m
end-curve radius                   = 380 m
maximum authored Raster turn       = 5 degrees
```

Each half-lap contains all four left/right balanced sweep families, separated by ordinary
straights, followed by one 180-degree end curve. Repeating the same half-lap in the opposite world
direction cancels displacement and closes at the explicitly duplicated endpoint. Both turn signs
are present throughout the lap.

The former isolated 90 m low-speed compounds are not retained in the current CIRCUIT. The current
design instead varies approximately 106–202 km/h curvature targets across the whole lap through
ordinary authored radii. This changes only CIRCUIT composition; BRANCHING continues to consume its
existing M7.1/M7.2 source.

## 3. Elevation and natural jumps

The smooth physical HeightProfile spans approximately:

```text
minimum height        = -34 m
maximum height        = +62 m
total relief          = 96 m
maximum smooth grade  = approximately 12.49 percent
```

Two straight-line crests are authored at source chainages:

```text
4544.813767013315 m
10583.053972342219 m
```

Each crest falls 6 m across 85 m. At normal high-speed approach velocity the road falls away fast
enough for ordinary unilateral contact to release briefly. The road then rejoins the broader
elevation profile over a long smooth interval, allowing normal suspension recontact without a
recovery or out-of-model state.

## 4. Causal validation

The ordinary rival Driver and unchanged CAR physics complete the 12.076 km lap in the executable
probe while:

- traversing every medium/high-speed corner family;
- remaining inside the 7 m asphalt half-width;
- producing exactly two airborne episodes at the authored crests;
- recontacting normally after the second jump;
- using only canonical steering, throttle and brake input.

The proof contains no direct state writes, speed override, grip override, recovery or section
identifier. A separate source-boundary assertion proves that CIRCUIT selects this runtime while
BRANCHING retains `createM71HighwayCalibrationLapRaster`.
