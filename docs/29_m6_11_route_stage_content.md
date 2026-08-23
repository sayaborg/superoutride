# M6.11 — Route Stage Content Manifest Boundary

## Purpose

M6.8–M6.10 established validated route selection and routed point-to-point completion. M6.11 adds the next boundary: each Route DAG node identifies which complete stage content package should be active, while the renderer itself remains unaware of the DAG.

M6.11 does **not** switch real renderer assets yet. It defines only the manifest and selection authority.

## Selection flow

```text
validated physical branch crossing
→ Route DAG transition
→ activeStageId
→ RouteStageContentManifest
→ exactly one opaque packageId
```

The renderer still receives only one active course/content package at a time.

## Package reference

```text
RouteStageContentPackageRef {
    packageId
    worldFrameId
}
```

`packageId` is intentionally opaque. A later loader/compiler may resolve it to the full collection of Guide/Raster Course/GroundMap/SurfaceMap/Far Background/world sprites and other stage assets.

Gameplay does not import or own those renderer internals.

## Manifest invariants

`compileRouteStageContentManifest()` requires:

- every Route DAG stage has exactly one binding
- every binding targets an existing stage
- every binding references an existing package
- every authored package is actually reachable from a binding
- package IDs are unique
- all packages share one explicit `worldFrameId`

## Why one world frame now

Physics is world-space authoritative. A content change must therefore not silently reinterpret the vehicle's X/Z/yaw in a different coordinate frame.

M6.11 has no world-transform/teleport contract, so mixed frames are rejected rather than guessed.

```text
stage transition
≠ vehicle teleport
≠ coordinate-frame change
```

If a future design genuinely requires stage-local frames, that must be introduced as an explicit, separately validated handoff transform rather than hidden inside content selection.

## Runtime resolver

`resolveActiveRouteStageContent()` returns exactly one pair:

```text
active stage ID + opaque package reference
```

It does not mutate:

- vehicle world pose or velocity
- camera
- renderer
- SurfaceMap
- race/route progress

The actual content activation mechanism remains future work.

## Validation

PR #21, Actions run 32615880615:

```text
177 tests
177 pass
0 fail
```

The regression also verifies the manifest module has no renderer or concrete vehicle-physics imports.

See `M6_11_VALIDATION.txt`.

## Next

Before implementing real stage switching, the physical/render continuity at a branch must be designed explicitly. In particular, the project must decide how two individually renderable stage packages overlap around a junction so the player sees a continuous fork while world physics remains continuous. That junction-content problem should be solved without weakening the Core rule that the renderer processes one chainage-driven course at a time.
