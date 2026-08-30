# M8.5 Downward Camera Presentation

Status: current camera presentation-tuning authority above unchanged M8.2 movement-yaw/body-pitch
architecture and unchanged frozen renderer depth.

This document supersedes only the M8.2 initial `8 degree` base-down-pitch and corresponding
flat-road camera-height calibration. M8.2 continues to own movement-facing yaw, physical body-pitch
tracking, exact horizontal centering, low-speed yaw hold and the debug body-yaw arrow.

## 1. Architecture decision gate

1. View pitch and player framing belong to the camera presentation layer.
2. Existing `M5CameraProfile` fields express the change without new renderer or physics state.
3. One current profile owns the values for LINEAR, BRANCHING, CIRCUIT, GroundMap compilation and
   current workload validation.
4. No route-, course-, vehicle- or low-speed-section branch is added below composition.
5. The same result cannot be authored into course geometry without corrupting physical height.
6. `D_cam=5 m`, `f=200 px`, 40 px/m player scale, `Y=190`, zero roll, chainage depth and
   forward-only visibility remain unchanged.
7. Regression proves the exact framing relation, increased far-road vertical separation, shared
   profile use, GroundMap density and current render budgets.

## 2. Current profile

```text
base downward pitch = 12 degrees
flat-road height    = 2.8518788493639118 m
player target Y     = 190
center Y            = 120
focal length        = 200 px
D_cam               = 5 m
d_max               = 150 m from camera / 145 m ahead of player
```

The flat-road height is derived rather than independently tuned:

```text
h = (Y_player - centerY + f sin(pitch)) D_cam / (f cos(pitch))
```

It therefore places the player ground anchor at `Y=190` without spending the bounded vertical
correction on a permanent pitch offset.

Physical body pitch remains nose-up-positive and camera pitch downward-positive:

```text
camera pitch = 12 degrees - physical body pitch
```

Nose dive and crest response remain physical camera presentation; no sprite pitch rotation or
additional pitch sprite axis is introduced.

## 3. Intended visual effect and limits

Relative to the former framed 8-degree view, a flat road from player depth to the 150 m far plane
occupies more than 12 percent additional vertical screen span. This makes the existing forward
portion of distant curves easier to read without increasing pseudo-depth.

The change does not weaken the forward-facing cutoff. A hairpin section whose authored heading is
more than 90 degrees from camera movement yaw is still excluded from the forward pass.

## 4. GroundMap and workload evidence

The higher effective camera height changes the chainage texel-density authority. The baked debug
asset is regenerated with 20480 base chainage texels and retains `kMax=6`. Normal and tunnel render
workloads are re-observed under the 12-degree profile and receive the same explicit 25 percent
target margin.
