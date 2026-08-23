# SUPER OUTRIDE — M1 Core Geometry Implementation Note

Status: implemented development checkpoint  
Authority: `00_core_design_freeze.md` remains the sole mathematical specification.

## Scope

M1 implements the first executable geometry layer required before the Road Generator:

- signed cyclic chainage difference (`wrapSigned`)
- world XZ heading basis
- closed Raster Course compilation
- Raster reference-line sampling
- Guide Curve circular fillets
- `R_min` / fillet overlap validation
- circular-authoring `R_c cos(Δ/2)` rule
- Guide Curve sampling with the same global `s`
- explicit global initialization search
- previous-segment-neighborhood local world→Guide search
- pseudo-depth and pseudo projection
- straight-road yaw equation cross-check

The implementation does **not** add polygon road rendering, z-buffering, camera-space-Z depth, lateral depth correction, or gameplay physics.

## Runtime boundaries

```text
RasterCourse
  ├─ authoritative raster reference polyline
  └─ global plan chainage s

GuideCurve
  ├─ straight pieces
  ├─ local circular fillets
  └─ same global s as RasterCourse

world point
  ├─ explicit initialization -> global Guide search
  └─ normal frame -> local Guide neighborhood search

PseudoProjection
  └─ depth = wrapSigned(s_object - s_camera)
```

## DEV visualization

The M1 browser screen contains a projection probe only. It draws fixed-chainage horizontal slices so the following invariants can be visually inspected:

- one chainage produces one horizontal Y
- lateral position changes X, not pseudo-depth
- same `s` and same height produce the same scale and Y
- steering input is temporarily mapped to a camera-yaw probe
- throttle advances a DEV camera along `s`

The probe is not the final Road Generator and is not vehicle physics.

## Acceptance tests

M1 is accepted only when:

1. TypeScript strict check passes.
2. M0 input tests remain green.
3. `wrapSigned` boundary behavior matches the Core interval.
4. 10-degree `mu` and `R_min` reference values match the Core derivation.
5. compiled Guide boundaries are G1.
6. world→Guide recovers signed lateral position.
7. local search never silently substitutes a global search.
8. same-s projection invariants hold.
9. general pseudo projection reduces to the straight-road yaw formula.
10. Raster vertices sharper than 10 degrees are rejected.
