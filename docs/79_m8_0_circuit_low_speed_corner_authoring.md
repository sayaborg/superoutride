# M8.0 Circuit Low-Speed Corner Authoring

Status: released follow-on course-authoring authority within the M8.0 public DEV composition.

This document supersedes only the current public CIRCUIT geometry/minimum-radius description in
`74_m7_1_highway_calibration_course_authoring.md`. M7.1 remains the historical record of the
original all-high-speed calibration lap. Renderer, topology, race, camera and vehicle-physics
authority are unchanged.

## 1. Architecture decision gate

1. The requested braking corner belongs to explicit DEV course authoring.
2. Existing RasterPath, GuidePath and finite CIRCUIT compilation express it without a new engine primitive.
3. World X/Y/Z, Guide chainage, SurfaceMap support and race progress retain one authority each.
4. No circuit-, corner-, vehicle- or route-specific branch is added to physics, AI, camera or renderer.
5. The ordinary authored path supplies the behavior; lower consumers remain topology-blind.
6. Open Core, chainage pseudo-depth, the ten-degree Raster-turn limit, physical gates and finite lap unfolding remain unchanged.
7. `tests/m7-1-highway-calibration-course.test.mjs` proves the geometry and an ordinary rival-physics traversal.

## 2. Course change

The original long straights, 720 m alternating sweeps, 470 m end curves and airborne proving
section remain. The second long side now finishes with one explicit compound sequence:

```text
right 90 degrees, source radius 90 m
left 180 degrees, source radius 90 m
right 90 degrees, source radius 90 m
150 m exit straight
ordinary 470 m end curve and start-axis return straight
```

All circular source geometry is rasterized at no more than five degrees per vertex. The compiled
minimum Guide radius is approximately 89.91 m, above the ordinary Core minimum for the authored
lateral domain. The complete lap remains explicitly closed above Core and is approximately
8.807 km long.

## 3. CIRCUIT versus BRANCHING ownership

The first low-speed Guide corner begins at approximately `s=6196 m`, after the existing M7.2
BRANCHING physical handoff seam at `s=6120 m`. The route gates and handoff therefore remain on
their authored straight interval. BRANCHING commits to ordinary child content before this new
section; CIRCUIT continues on the common finite lap source and reaches the low-speed complex.

This placement avoids a route-specific lower-layer exception and does not duplicate the public
course coordinate authority.

## 4. Causal calibration

Radius 90 m is the tightest tested rounded value that the unchanged ordinary rival controller and
M8.0 car physics traverse reliably in this three-corner sequence. With the existing 0.72 g rival
target, the approach command is approximately `25.2 m/s` (`90.7 km/h`).

The executable integration probe starts the ordinary car 180 m before the complex at `45 m/s`
(`162 km/h`). It must:

- brake below 26 m/s;
- traverse the complete compound section without losing physical support;
- remain inside the 7 m asphalt half-width;
- accelerate above 40 m/s after the exit.

No recovery, pose rewrite, grip override or special corner logic is used by that proof.
