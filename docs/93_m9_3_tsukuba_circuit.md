# M9.3 — Tsukuba Course 2000 CIRCUIT Authoring

Status: current CIRCUIT DEV course-authoring authority.

This milestone replaces only the public CIRCUIT lap geometry, elevation and track cross-section
selected by `src/main-circuit.ts`. M9.1 vehicle/input/HUD mechanics, M9.2 steering calibration,
explicit CircuitTopology, finite open runtime windows, race progress, camera and renderer authority
remain unchanged.

## 1. Research boundary

The reconstruction uses the four-wheel Course 2000 layout. It does not use the motorcycle-only
MC/Asia chicane.

Primary references:

- Tsukuba Circuit official course description and published corner radii:
  <https://www.tsukuba-circuit.jp/guide/course-spec.html>
- Tsukuba Circuit official Course 2000 plan and longitudinal profile:
  <https://www.tsukuba-circuit.jp/guide/img/course-spec_2000.pdf>
- JAF circuit registry for length, direction and width:
  <https://motorsports.jaf.or.jp/course/circuit/tsukuba/>

Published facts retained by the DEV authoring are:

```text
lap length       = 2045 m
direction        = clockwise
track width      = 10–15 m
home straight    = 282 m
back straight    = 437 m

course order:
home straight
-> Turn 1 compound 55R / 35R
-> broad S curve (75R family)
-> first hairpin
-> Dunlop 35R right
-> four-wheel 80R right / 170R left
-> second hairpin compound 25R / 105R
-> back straight
-> final compound 100R / 90R
-> home straight
```

The official longitudinal description also establishes a predominantly flat lap, an uphill home-
straight end, a downhill Turn 1 exit and small rolling changes elsewhere.

The official plan does not publish a complete machine-readable centerline, every arc angle or
every connector length. M9.3 therefore does not claim survey or homologation accuracy. Exact arc
angles and unlabelled connectors are an original simplified reconstruction chosen to preserve the
published order/radius families while closing the existing Raster primitive at exactly 2045 m.

## 2. Architecture decision gate

1. Circuit identity, road shape, elevation and cross-section belong to CIRCUIT DEV authoring.
2. Existing straight/arc Raster authoring, HeightProfile, SurfaceMap, GroundMapProfile,
   CircuitTopology and finite runtime-window compilation express the complete result.
3. No duplicate world/Guide/chainage state or coordinate authority is introduced.
4. No course-, vehicle- or mode-specific branch is added to physics, tires, input, camera,
   renderer, recovery or race progress.
5. `src/main-circuit.ts` is the existing permitted top-level composition root; LINEAR and
   BRANCHING retain their current authoring.
6. World-space physics, chainage pseudo-depth, fixed metric presentation, open Core, explicit
   circuit topology, zero camera roll, 200 m far depth and the ten-degree Raster limit remain
   unchanged.
7. Regression proves the published dimensions/order/radius families, exact closure, restrained
   elevation, track cross-section, N+1 finite-open runtime, ordinary FR/BIKE1 straight traversal
   and BRANCHING isolation.

## 3. Functional lap authoring

The source is `src/dev/m9-3-tsukuba-circuit.ts`.

```text
one-lap Raster length            = 2045 m
home straight                    = 282 m
back straight                    = 437 m
nominal asphalt width            = 12 m
shoulder width                   = 1.5 m per side
maximum authored Raster turn     = 5 degrees
explicit endpoint displacement   = 0 m
explicit accumulated heading     = one clockwise revolution
```

The common Course 2000 radius families represented by the simplified arc chain are:

```text
25R, 35R, 55R, 75R, 80R, 90R, 100R, 105R, 170R
```

Two short tangent transitions separate a smaller-radius polygonal arc from a following larger-
radius arc. They prevent adjacent Guide fillets from overlapping while preserving the same normal
Core compiler rules. Connector values are fixed authoring constants and never runtime correction.

The track has solid edge markings and no highway center/lane marking. The 12 m nominal asphalt
width sits inside JAF's published 10–15 m range. SurfaceMap independently owns asphalt, shoulder
and grass support; visual paint does not manufacture physical grip.

## 4. Elevation

The smooth HeightProfile follows the official longitudinal profile qualitatively without inventing
survey precision:

```text
authored minimum height       = -0.6 m relative datum
authored maximum height       = +1.6 m relative datum
authored relief               = 2.2 m
maximum smooth grade          < 1.3 percent
start/end height datum        = 0 m
```

This replaces the M9.1 mountain course's 105 m relief only inside the CIRCUIT fixture. Physics and
camera continue to sample the same ordinary smooth height authority.

## 5. Runtime and validation

The three-lap race compiles four finite copies. Every scored FINISH therefore remains an ordinary
internal seam with one full runout/lookahead lap, and lower consumers receive one ordinary open
Raster/Guide/Height/Visual/Surface window.

The standalone-record rule in `validation/README.md` requires a new validation record because this
milestone changes current CIRCUIT course-authoring authority. The exact validation-inclusive head
must receive the complete CI suite before non-force fast-forward release.

