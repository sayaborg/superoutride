# SUPER OUTRIDE — M6.24 Reusable Stage Authoring / Compiler

## Purpose

M6.22 made committed child stages own independent Raster Course / Guide geometry. M6.23 proved that each child package can own different height, terrain, Far Background and World Sprites. M6.24 removes the remaining DEV-specific assembly duplication by introducing a reusable content compiler.

The renderer architecture does not change.

```text
stage-local authoring
  + active Guide coordinate frame
  + StageRoadView / SurfaceMap / GroundMap source
            ↓
  stage authoring compiler
            ↓
StageRuntimeContentPackage
            ↓
existing camera / physics / renderM5Driving
```

## Authoring authority

A child stage now authors environment content in its own local chart:

```text
heightNodes
visualSections
sprites { s, local l, asset }
Far Background
optional terrain envelope overrides
```

The authoring data does not contain the parent/source lateral origin.

For a child sprite authored at local lateral position `l_local`, the compiler alone applies:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

and then uses the existing `compileCourseSprite()` against the active child Guide.

This is a source-coordinate conversion only. It does not change renderer pseudo-depth, vehicle physics, or the world pose.

## Compiler responsibilities

`src/runtime/stage-authoring-compiler.ts` performs only deterministic content assembly:

1. derive course length from the active Guide,
2. compile `CyclicHeightProfile`,
3. compile `CyclicVisualProfile`,
4. assemble the ordinary `TerrainVisualProfile`,
5. compile stage-local sprite authoring into ordinary world-space `CourseSprite`s,
6. assemble a complete `StageRuntimeContentPackage` from source geometry/physics plus authored environment.

It does not know RouteDag stage IDs, LEFT/RIGHT choice, handoff gates, camera pixels, or renderer branch logic.

## M6.24 DEV child definitions

The existing M6.23 content identity is retained, but represented declaratively.

LEFT:

```text
identity: coast
height: low relief after shared-flat prefix
visual: LEFT_COAST_STAGE
sprites: sign / guardrail / building
background: M6.21 coast/ocean bitmap
```

RIGHT:

```text
identity: mountain
height: stronger climbs after shared-flat prefix
visual: RIGHT_MOUNTAIN_STAGE
sprites: trees / sign / building
background: M6.21 mountain/valley bitmap
```

Both keep child `s=0..60m` at height zero. The handoff is near child `s≈11.74m`, so the `D_cam=5m` camera neighborhood remains on the shared datum.

## Runtime selection remains unchanged

The runtime authority is still:

```text
activePackageId
→ StageRuntimeContentRegistry
→ StageRuntimeContentPackage
```

Route selection is not part of the authoring compiler.

The browser compatibility entry `createM622LiveStageRuntimeRegistry()` remains in place so `main.ts` does not accumulate milestone-specific wiring. Its implementation now delegates to the M6.24 registry builder.

## Frozen renderer invariants

M6.24 does not modify any of these:

- physics authority is world-space,
- no vehicle snap to road center,
- one chainage maps to one horizontal scanline,
- pseudo-depth is signed chainage difference only,
- no camera-space Z,
- no Euclidean/lateral depth correction,
- same d means same scale,
- same d + same height means same screen Y,
- Raster Segment road,
- 10 degree maximum vertex turn,
- common far-to-near Terrain + World Sprite Painter,
- no z-buffer,
- no polygon road,
- no perspective-correct texture,
- no arbitrary runtime sprite rotation,
- 0/1 transparency only,
- camera roll zero,
- GroundMap and SurfaceMap remain independent,
- full-screen Far Background remains package content.

## Metric authority

Unchanged:

```text
car width = 2.0m
source width = 80px
40 px/m at player depth
f = 200px
D_cam = 5m
d_min = 2.5m
```

No `visualScale` is introduced.

## Why this milestone exists

Without M6.24, every new stage would repeat construction code for height, terrain, sprites and package fields, and would be tempted to leak parent source coordinates into authored content. The compiler creates a narrow reusable boundary before the route is extended to multiple sequential stages and future branches.

The intended next step is to use the same stage authoring boundary for a child-to-next-stage continuation, rather than adding new renderer logic.
