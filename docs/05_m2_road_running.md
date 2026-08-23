# SUPER OUTRIDE — M2 Road Running Implementation Note

Status: implemented Go/No-Go checkpoint  
Authority: `00_core_design_freeze.md` remains the sole core specification.

## Purpose

M2 exists to answer the project’s first decisive implementation question:

> Can a vehicle remain authoritative in world coordinates, move diagonally relative to a road, and still be presented as a chainage-driven raster pseudo-3D road without camera-space-Z or lateral depth correction?

The current implementation answers **yes for the flat-road prototype**.

## Implemented

### Free world vehicle prototype

The M2 vehicle is deliberately temporary physics. It has:

- world `x/z`
- free yaw
- scalar speed
- steering / throttle / brake
- local Guide Curve coordinate tracking

The world position is never snapped to road center or to `(s,l)`.

### Camera checkpoint implementation

For this checkpoint:

- `s_cam = s_car - D_cam`
- `D_cam = 20 m`
- lateral camera target follows the Core `l_car - D_cam sin(delta)` relation
- lateral camera position is clamped to the Guide chart envelope
- camera yaw directly follows vehicle yaw in this DEV profile (yaw smoothing is deferred)
- camera roll remains zero

This keeps the player’s chainage pseudo-depth exactly `D_cam` while allowing the vehicle to point away from road heading.

### Flat TerrainLine generator

M2 implements the flat-height specialization of the Road Generator:

- forward-only visibility from level-0 Raster heading
- `d_min / d_max` clipping
- screen-row inversion to chainage
- one terrain record per horizontal screen row
- far-to-near ordering
- GroundMap lateral endpoints
- exact affine `l <-> screen X` mapping on each row

For the M2 visual prototype, ground and road materials are analytic flat spans:

```text
outside / ground = green
road             = gray
```

No polygon road, z-buffer, depth test, perspective-correct texture mapping, or camera-space-Z correction is used.

## Debug course

M2 adds a simple closed stadium course:

- two 200 m straights
- two 60 m-radius semicircular ends
- arc chords at 10-degree increments
- circular-authoring radius metadata retained
- total length comfortably exceeds `2 * d_max`

The long straight exists specifically to make diagonal road-relative travel easy to inspect.

## Go / No-Go tests

The checkpoint is GO only if all of the following hold:

1. A world-space move at 20 degrees to a straight road produces both positive `Δs` and positive `l`.
2. Camera chainage keeps player pseudo-depth exactly `D_cam` under lateral displacement and yaw difference.
3. TerrainLine records are emitted far to near.
4. Every non-degenerate ground span satisfies `xGroundL < xGroundR`.
5. Road edges are derived through the scanline affine lateral map.
6. More-than-90-degree rear-facing camera state produces an empty forward terrain interval.
7. Player scale remains `f / D_cam` even when Euclidean camera distance differs.

All tests pass in this checkpoint.

## Not yet implemented

M2 is intentionally not the final renderer. Deferred work includes:

- piecewise-linear height / hill and dip Road Generator
- full segment setup `x=a_x+b_x/d`, `y=a_y+b_y/d`
- thin-span collapse
- textured GroundMap
- GroundBase L/R transparency
- Far Background bitmap
- world sprites
- player sprite variants
- real car/bike physics
- camera yaw LPF / vertical follow tuning

These remain later milestones rather than being folded into the M2 proof.
