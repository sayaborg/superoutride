# M7.2 Default BRANCHING Highway Integration

Status: release authority candidate. Exact release status is established by Git/PR/main-ref and main-push Pages workflow identity.

M7.2 corrects the M7.1 composition scope. M7.1 added the requested highway calibration course to the explicit CIRCUIT entry only. The normal `/` product entry remained on the approximately 0.766 km historical stadium parent stage. M7.2 makes the long four-lane highway the parent stage of the default BRANCHING composition without changing the `/ -> BRANCHING` product contract.

Vehicle handling remains `DEV_UNCALIBRATED`. This milestone changes course authoring and route composition, not force-model tuning.

## 1. Architecture decision gate

1. Parent road geometry, height, cross-section and split placement belong to DEV course authoring. Physical route progress remains owned by RouteDag gates and handoff seams.
2. Existing Raster/Guide, junction cross-section, SurfaceMap, GroundMap and declarative live-route primitives express the requirement. No new renderer, physics or topology mode is needed.
3. One explicit parent-fork profile owns the junction, route-gate and handoff-seam chainages. The same profile is passed through child overlap and declarative route compilation; no parallel gate coordinate truth is introduced.
4. Renderer, vehicle physics, camera and generic RouteDag layers receive no BRANCHING or M7.2 special case.
5. The M7.1 highway raster is reused as a finite ordinary open BRANCHING parent. The route exits through physical gates before the authored endpoint, so no wrapping or circuit progress enters the default composition.
6. World pose continuity, open-path behavior, chainage pseudo-depth, the ten-degree Raster-turn limit, GroundMap/SurfaceMap independence and physical gate -> PENDING -> seam COMMIT remain intact.
7. `tests/m7-2-default-branching-highway.test.mjs` proves the default composition, four-lane support/paint, flat straight fork placement, moved world-space gates/seams and lane-center spawn/recovery authority.

## 2. Default parent stage

The default BRANCHING parent now uses the approximately 7.762 km M7.1 highway geometry as one open path:

```text
lane count            = 4
lane width            = 3.5 m
total asphalt width   = 14.0 m
player start lane     = l = -1.75 m
rival start lane      = l = +1.75 m
```

The M7.1 elevation proving section, long curves and lane-paint dimensions remain available on `/`. The explicit CIRCUIT composition remains available at `/?mode=circuit` and continues to use circuit topology/race authority above open Core.

Long authored straights are subdivided into at most 50 m zero-curvature Raster segments. This does not change their world shape or length. It provides sufficient local vertices for ordinary child-stage overlap extraction while retaining the frozen turn limit.

## 3. First BRANCHING split

The first split is placed on the flat straight near the end of the second highway side:

```text
widen start       s = 5800 m
median start      s = 5900 m
fully separated  s = 6000 m
route gate        s = 6060 m
handoff seam      s = 6120 m
```

The 14 m incoming asphalt surface becomes two 7 m child roads separated by an 8 m median. Both sibling gates remain one physical progress boundary. The seam remains downstream of the gate and COMMIT changes chart/content authority without rewriting world X/Y/Z, yaw or velocity.

The new parent profile selects forward-open child continuations. The historical M6 parent profile retains its original closed-back DEV child geometry as its default. This prevents the current product fixture from rewriting milestone-history fixtures while allowing both to use the same compiler.

## 4. Paint, support and recovery

Before widening, explicit four-lane M7.1 markings remain visible even when a future junction profile is attached. Once widening begins, the junction cross-section owns split paint and median presentation. GroundMap paint remains visual-only; SurfaceMap independently supplies asphalt, shoulder, grass and support.

Player and rival spawning use their authored lane centers. Ordinary recovery uses the matching lane-center profiles. Wrong-branch recovery continues to derive geography from the locked physical route gate and is unchanged.

## 5. Not changed

M7.2 does not change:

- car or motorcycle force/control solvers;
- grip, steering, TCS, ABS, powertrain or camera-cue tuning;
- RouteDag choice rules or shared first-crossing authority;
- CIRCUIT lap/checkpoint authority;
- renderer depth, metric scale, sprite rules or Painter order;
- the rule that human driving trials own final product feel.
