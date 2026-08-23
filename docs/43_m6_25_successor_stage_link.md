# SUPER OUTRIDE — M6.25 Successor Stage Continuation Link

## Purpose

M6.25 extracts the geometry-continuity rule behind M6.22 into a reusable runtime primitive so that any active stage can hand off to a successor stage without teleporting the vehicle or introducing renderer branch logic.

The new `StageContinuationLink` represents a validated correspondence between two Guide coordinate frames across an authored overlap interval.

## Authority

A link owns only coordinate correspondence:

```text
source frame + source seam s + source local l
            ↕ same world road locus
 target frame + target seam s + target local l
```

It does not select routes, move the vehicle, render roads, or alter physics.

The source and target local lateral coordinates may differ. This is required by the existing parent-to-child handoff:

```text
parent LEFT road center  l=-7.5m  ↔ child LEFT l=0
parent RIGHT road center l=+7.5m  ↔ child RIGHT l=0
```

## Overlap validation

`compileStageContinuationLink()` validates world position and heading at five samples spanning the complete authored overlap:

```text
-behind
-behind/2
seam
+ahead/2
+ahead
```

For the current M6.22 fixture both overlap distances are `D_cam = 5m`.

A bad target chainage, wrong lateral correspondence, or mismatched geometry is rejected during compilation rather than producing a runtime visual jump.

## Coordinate mapping

Inside a validated overlap, chainage rebasing is only a seam-relative offset:

```text
s_target = targetSeamS + (s_source - sourceSeamS)
```

Signed lateral displacement from the linked road locus is preserved:

```text
l_target = targetLocalL + (l_source - sourceLocalL)
```

These are coordinate expressions only. World X/Y/Z, yaw and velocities remain authoritative and unchanged.

## Renderer invariants

M6.25 changes no renderer mathematics:

- one chainage -> one horizontal scanline,
- pseudo-depth remains signed chainage difference only,
- no camera-space Z,
- no Euclidean/lateral depth correction,
- same d -> same scale,
- Raster Segment road,
- shared far-to-near Terrain + World Sprite Painter,
- no z-buffer,
- no polygon road,
- no perspective-correct texture,
- no arbitrary runtime sprite rotation,
- 0/1 transparency,
- camera roll zero.

## Why this milestone exists

M6.22 proved parent-to-child continuity with bespoke child construction. M6.25 makes the continuity contract stage-agnostic, which is the prerequisite for connecting the selected child to a later successor stage using the M6.24 authored package compiler.

The next milestone can therefore extend the live point-to-point route with `child -> next stage` handoff while reusing this link rather than duplicating parent-specific assumptions.
