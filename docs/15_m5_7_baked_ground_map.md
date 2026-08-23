# M5.7 — Baked GroundMap runtime integration

## Purpose

M5.4-M5.6 established the GroundMap density authority, the one-pyramid anisotropic prefilter rule, actual TerrainLine source-footprint telemetry, and the proven current target `k_max=6`. M5.7 moves that result out of the procedural DEV sampler and into a compiler-baked runtime asset.

## Build-time asset

`npm run build` now performs:

```text
tsc -p tsconfig.json
→ node tools/build-ground-map.mjs
```

The bake step:

1. compiles the current Surface Region authoring
2. derives GroundMap density from the current metric camera authority
3. derives `k_max` from the M5.6 target envelope
4. rasterizes deterministic level 0 at texel centers
5. generates the complete 2×4 anisotropic pyramid
6. encodes the result as bounded chunk payloads
7. writes:

```text
dist/assets/m5-ground-map.json
dist/assets/m5-ground-map.bin
```

The runtime does not generate or filter the GroundMap.

## Current baked dimensions

```text
courseLength          = 776.5128086698837 m
baseLateralTexels     = 960
baseChainageTexels    = 16384
actualBaseQL          = 0.025 m/texel
actualBaseQS          = 0.04739458060729271 m/texel
kMax                  = 6
```

Alignment to the complete pyramid makes actual `q_s` slightly finer than the M5.4 authority. It is never allowed to become coarser than `q_l/q_s` authority.

## Storage

Level 0 retains the authoring palette exactly:

```text
level 0 = palette8
```

Prefiltered levels use compact opaque 15-bit storage:

```text
levels 1-6 = RGB555 little-endian
```

Current output:

```text
logical chunk refs    = 141
unique payloads       = 124
binaryBytes           = 20,220,030
raw RGBA pyramid      = 71,902,320 bytes
storage ratio         = 0.2812152653766944
```

Encoded payloads are SHA-256 identified and identical chunks share one payload. Chunking is a storage/reference mechanism; it does not create a second LOD authority.

## Runtime selection

Every TerrainLine already carries:

```text
Delta_s_eff
```

The runtime selects exactly one shared-pyramid level per TerrainLine:

```text
k = clamp(ceil(log4(Delta_s_eff / q_s)), 0, 6)
```

Then the complete horizontal GroundMap span samples that already-prefiltered level with nearest texel addressing.

There is no runtime anisotropic filtering and lateral footprint never promotes the shared level.

## Semantic equivalence

The procedural `sampleGroundMap` function remains the compiler/source-reference path. Regression tests verify that every probed level-0 baked texel center returns exactly the same color as the procedural source.

Thus M5.7 changes storage and filtering location, not GroundMap semantics.

## Preserved boundaries

M5.7 does not introduce:

- a 2D LOD table
- lateral-driven shared LOD promotion
- runtime anisotropic filtering
- polygon road geometry
- a z-buffer
- perspective-correct texture mapping
- coupling between `GroundBase=TRANSPARENT` and `SurfaceMap=VOID`

The next block is target performance-budget instrumentation and validation for terrain and sprite output work.
