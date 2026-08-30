# M9.1 Low/Mid-Speed Mountain Circuit

Status: current CIRCUIT DEV course-authoring authority above unchanged Core, topology, renderer,
camera and vehicle physics.

This document supersedes only the current public CIRCUIT geometry and elevation in
`86_m8_7_varied_elevation_circuit.md`. M8.7 remains the historical record of the former
12.076 km medium/high-speed circuit with two jump crests. LINEAR, BRANCHING, vehicle profiles,
input, mechanics, camera, rendering, topology and race-progress authority remain unchanged.

## 1. Architecture decision gate

1. Drift opportunity, corner cadence and elevation belong to CIRCUIT DEV authoring.
2. Existing straight/arc Raster authoring, HeightProfile and finite CircuitTopology compilation
   express the whole change without a new primitive.
3. There is no drift zone, handling override, grip override, speed override, jump trigger,
   recovery trigger or section identifier.
4. World pose, contact/tire forces, Guide coordinates and race progress retain one authority each.
5. The CIRCUIT composition selects one ordinary runtime; lower physics, camera and renderer layers
   receive the same ordinary finite open window as before.
6. Open Core, chainage pseudo-depth, 200 m far depth, zero camera roll and the ten-degree Raster
   turn limit remain unchanged.
7. Regression proves the curvature distribution, elevation envelope, explicit closure, ordinary
   FR/BIKE1 traversal and BRANCHING isolation.

## 2. Circuit geometry

The explicit closed lap is:

```text
lap length                    = 7076.777343820672 m (approximately 7.077 km)
tight complex radius          = 95 m
low/medium complex radius     = 135 m
end hairpin radius            = 150 m
medium complex radius         = 180 m
flowing-medium radius         = 240 m
maximum authored Raster turn = 5 degrees
curved Guide share            = approximately 66.18 percent
```

Each half-lap contains four balanced left/right complexes separated by short ordinary connectors,
then one 180-degree hairpin. The second half repeats the same sequence in the opposite world
direction, so displacement cancels and the explicitly duplicated endpoint closes exactly. Both
turn signs are distributed throughout the lap.

Every finite Guide radius is below 240 m. The curvature-speed authority therefore asks the
ordinary rival to negotiate corners at low/mid-speed rather than treating most of the lap as a
high-speed sweep. Short connectors keep yaw and lateral velocity relevant into the following
corner, creating player-visible drift-control opportunities through the existing tire-force chain.

## 3. Mountain elevation

One smooth physical HeightProfile is authored across the lap:

```text
minimum height             = approximately -50 m
maximum height             = approximately +55 m
total relief               = approximately 105 m
maximum smooth grade       = approximately 18.42 percent
grade-direction changes    = 10 per lap
```

The stronger impression comes from frequent continuous climbs and descents, not localized launch
ramps. The M8.7 jump-specific crest windows are removed. Physics and camera sample the same smooth
height authority, and every vehicle stays on the ordinary suspension/contact path.

## 4. Causal validation

The unchanged rival Driver and unchanged common vehicle solver complete one lap with both FR and
BIKE1. In the recorded probe:

```text
FR     max |l| = 4.10 m, minimum observed corner speed = 20.61 m/s
BIKE1  max |l| = 3.63 m, minimum observed corner speed = 20.56 m/s
```

Both finish supported and remain inside the existing 7 m asphalt half-width. The probe contains
no recovery, state rewrite, profile change, grip change, speed injection or course-specific input.
BRANCHING continues to select its existing M7.1/M7.2 parent authoring.
