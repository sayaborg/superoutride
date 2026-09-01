# M9.6 — FISCO CIRCUIT Authoring

Status: current CIRCUIT DEV course-authoring and browser course-4 authority.

This milestone adds a second public CIRCUIT lap. Browser course `3` retains the M9.3 Tsukuba
Course 2000 fixture; course `4` selects a functional reconstruction of the current Fuji Speedway
main racing course (FISCO). It does not reconstruct the pre-2005 banked layout.

Vehicle/input/HUD mechanics, tire and steering calibration, explicit CircuitTopology, finite open
runtime windows, race progress, camera and renderer authority remain unchanged.

## 1. Research boundary

Primary references:

- Fuji Speedway official racing-course page:
  <https://fsw.tv/guide/facility/racing.html>
- Fuji Speedway official course-data plan:
  <https://www.fsw.tv/freeinfo/pdf-cms/54dcc2b0d22984499fdd616b3cb3d54a2edc80aa.pdf>
- JAF circuit registry and current-layout history:
  <https://motorsports.jaf.or.jp/course/circuit/fuji/>

Published facts retained by the DEV authoring are:

```text
lap length             = 4563 m
direction              = clockwise
track width            = 15–25 m
home straight          = 1475 m
corner count           = 17 (6 left, 11 right)
site elevation range   = 545–585 m
maximum downhill grade = 10.05 percent
maximum uphill grade   = 8.88 percent

principal sequence:
home straight
-> TGR Corner / Turn 2
-> Coca-Cola Corner
-> 100R
-> ADVAN Corner
-> 300R
-> Dunlop Corner and technical complex
-> Turn 13 / GR Supra and GR GT corners
-> Panasonic Corner
-> home straight
```

The references do not provide a complete machine-readable centerline, every arc angle or every
connector length. M9.6 therefore does not claim survey or homologation accuracy. Exact arc angles,
unlabelled connectors and minor radius choices are original simplified authoring selected to
preserve the published identity while closing the existing Raster primitive at exactly 4563 m.

## 2. Architecture decision gate

1. Course identity, geometry, elevation and cross-section belong to CIRCUIT DEV authoring.
2. Existing Raster straight/arc authoring, HeightProfile, SurfaceMap, GroundMapProfile,
   CircuitTopology and finite runtime-window compilation express the complete result.
3. The existing browser course table can add `4 / ?mode=fisco` without a second route kind or a
   second composition root. Both CIRCUIT selections use `src/main-circuit.ts`.
4. `src/main-circuit.ts` selects the complete authored fixture once before ordinary runtime use.
   No per-frame course branch or duplicate active-course state is introduced.
5. No FISCO branch is added to physics, tires, input, camera, renderer, recovery, race progress or
   topology compilers.
6. World-space physics, chainage pseudo-depth, fixed metric presentation, open Core, explicit
   circuit topology, zero camera roll, 200 m far depth and the ten-degree Raster limit remain
   unchanged.
7. Regression proves published dimensions and sequence, exact non-intersecting closure, elevation
   envelope, cross-section, N+1 finite runtime, ordinary FR/BIKE1 traversal and composition-root
   isolation.

## 3. Functional lap authoring

The source is `src/dev/m9-6-fisco-circuit.ts`.

```text
one-lap Raster length          = 4563 m
home straight                  = 1475 m
authored corner count          = 17
nominal asphalt width          = 18 m
shoulder width                 = 2 m per side
maximum authored Raster turn   = 5 degrees
explicit endpoint displacement = 0 m
accumulated heading            = one clockwise revolution
```

The simplified arc chain retains the published `75R`, `80R`, `100R` and `300R` families. Fixed
connector constants close the simplified course without a runtime correction or hidden geometry
warp. The 18 m nominal asphalt width sits inside the published 15–25 m range. The track has solid
edge markings and no highway center line. SurfaceMap independently owns asphalt, shoulder and
grass support.

## 4. Elevation

The relative HeightProfile retains the published 40 m envelope and the characteristic descent from
the home straight to the low Dunlop area followed by the steep technical climb:

```text
relative minimum height   = 0 m
relative maximum height   = 40 m
authored relief           = 40 m
maximum smooth grade      = 9.54 percent
start/end relative height = 40 m
```

The profile stays inside the published absolute grade limits. It is a functional longitudinal
reconstruction, not surveyed elevation data.

## 5. Browser and runtime contract

The shared browser course authority is:

```text
1 / ?mode=linear    -> LINEAR
2 / ?mode=branching -> BRANCHING
3 / ?mode=circuit   -> CIRCUIT / TSUKUBA
4 / ?mode=fisco     -> CIRCUIT / FISCO
```

The route kind remains `CIRCUIT` for both `3` and `4`. The three-lap FISCO race compiles four
finite copies, so every scored FINISH is an ordinary internal seam with one full runout/lookahead
lap. Lower consumers receive one ordinary open Raster/Guide/Height/Visual/Surface window.

The standalone-record rule in `validation/README.md` requires a new validation record because this
milestone changes current public course-authoring and browser-composition authority. The exact
validation-inclusive head must receive the complete CI suite before non-force fast-forward release.
