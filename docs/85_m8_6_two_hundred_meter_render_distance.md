# M8.6 Two-Hundred-Meter Render Distance and Horizon Audit

Status: current renderer-distance presentation authority above unchanged frozen pseudo-depth,
camera architecture and topology boundaries.

This document supersedes only the M8.5 current far-depth value of `150 m`. M8.5 remains the
current 12-degree base-pitch and camera-height tuning authority. M8.2 remains the movement-yaw,
body-pitch-follow, centering and player-camera architecture authority.

## 1. Architecture decision gate

1. Near/far renderer distance belongs to the shared metric presentation layer.
2. Existing ordinary `dMin`/`dMax` terrain and sprite intervals express the change without a new
   renderer, topology or camera abstraction.
3. One exported authority supplies LINEAR, BRANCHING, CIRCUIT, successor-stage authoring,
   GroundMap compilation and workload validation.
4. No course-, route-, topology- or vehicle-specific lower-layer branch is introduced.
5. Finite open route composition continues to author enough ordinary runout for the larger
   forward window. Extending that envelope adds a straight tail after the existing authored
   deformation, so presentation distance cannot reshape the physical route before FINISH.
6. Chainage pseudo-depth, forward-facing cutoff, endpoint clipping, `D_cam=5 m`, `f=200 px`,
   40 px/m player scale, zero roll and player `Y=190` remain unchanged.
7. Regression proves the exact interval, shared authority, GroundMap sufficiency, horizon equation,
   background alignment and re-observed renderer workload.

## 2. Current forward interval

```text
d_min                         = 2.5 m from camera
d_max                         = 200 m from camera
D_cam                         = 5 m behind player
maximum player-relative view  = 195 m
```

The maximum is camera-relative because renderer depth remains exactly:

```text
d = s_render - s_camera
```

It is not a guarantee that every course point 195 m ahead of the player is visible. The ordinary
open endpoint and the existing forward-facing heading cutoff may shorten the interval.

## 3. Infinite horizon audit

The geometric horizon is not derived from `d_max`. It is the infinite-depth limit of the frozen
pseudo-projection:

```text
y_horizon = centerY - f sin(cameraPitch)
```

For the flat current camera profile:

```text
centerY      = 120 px
f            = 200 px
cameraPitch  = 12 degrees downward
y_horizon    = 78.41766183644815 px
```

Physical body pitch changes `cameraPitch`, so the geometric horizon moves consistently during
cresting and nose dive. The Far Background is not fixed at an old screen row: each frame maps its
authored `sourceHorizonY` to this geometric horizon. Integer sampling introduces at most one-half
pixel of raster rounding; there is no systematic horizon offset.

## 4. GroundMap and workload evidence

The wider `197.5 m` near-to-far footprint requires compiled target `kMax=7`. The current baked
debug asset uses `32768` base chainage texels, `kMax=7`, and remains an ordinary open GroundMap.

Normal/debug and tunnel stress workloads are re-observed under the 200 m interval. Their explicit
target continues to be derived mechanically from the recorded maxima with the existing 25 percent
margin. The far-distance change does not alter renderer ordering, add a depth buffer, or introduce
a CIRCUIT renderer path.
