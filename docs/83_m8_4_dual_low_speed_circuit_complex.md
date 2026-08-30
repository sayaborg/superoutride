# M8.4 Dual Low-Speed Circuit Complex

Status: current CIRCUIT DEV course-authoring authority above unchanged Core, topology, renderer,
camera and vehicle physics.

This document supersedes only the current public CIRCUIT geometry and one-complex description in
`79_m8_0_circuit_low_speed_corner_authoring.md`. That document remains the released historical
record of the first low-speed complex.

## 1. Architecture decision gate

1. Additional low-speed driving belongs to explicit DEV circuit course authoring.
2. Existing RasterPath, GuidePath and finite circuit compilation express it without a new primitive.
3. World pose, Guide chainage, physical support and ordered race progress retain one authority each.
4. No course-section mode or speed override is added to physics, AI, camera or renderer.
5. The ordinary authored curvature makes both actors brake through the existing input publisher.
6. Open Core, chainage pseudo-depth, the ten-degree Raster-turn limit and finite lap unfolding remain unchanged.
7. The circuit authoring regression proves two separated complexes and an ordinary complete traversal.

## 2. Course geometry

The existing high-speed opening, 720 m sweep sequence, 470 m end curves, hills and first compound
low-speed section remain. After the unchanged M7.2 handoff interval, CIRCUIT now contains:

```text
right 90 degrees, radius 90 m
left 180 degrees, radius 90 m
right 90 degrees, radius 90 m
200 m connection straight
left 90 degrees, radius 90 m
right 180 degrees, radius 90 m
left 90 degrees, radius 90 m
150 m exit straight
ordinary 470 m end curve and start-axis return
```

Both compound sections return to the side axis and have opposite handedness. Every authored Raster
turn remains at most five degrees. The compiled minimum Guide radius remains approximately 89.91 m.

The exact authored lap length is:

```text
10132.756027190104 m
approximately 10.133 km
```

## 3. Route ownership

Both low-speed sections remain after the BRANCHING route gate and handoff seam. BRANCHING has
already committed to child content before reaching this circuit-only continuation, so route gates,
handoff coordinates and point-to-point child geometry are unchanged.

## 4. Causal regression

The executable course regression separates the radius-under-100 m Guide corners into exactly two
groups with a 200 m straight between them. It starts the ordinary rival-controlled car before the
first complex and requires it to clear the second plus runout while:

- braking below 26 m/s through the unchanged curvature speed authority;
- remaining physically supported;
- remaining within the authored 7 m asphalt half-width;
- accelerating above 40 m/s after the final exit.

No recovery, pose rewrite, grip override or low-speed-section behavior mode is permitted by the proof.
