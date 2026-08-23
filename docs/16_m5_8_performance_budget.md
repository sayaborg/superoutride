# M5.8 — Render Performance Budget Instrumentation

## Purpose

M5.8 adds exact workload telemetry to the existing renderer so course/compiler validation can reason about the actual 320×240 output work without changing the renderer architecture.

The counters are observational. They do **not** cause runtime dropping of required TerrainLines or other semantic changes.

## Terrain metrics

Every generated TerrainLine belongs to one destination screen row. The renderer therefore records:

```text
TerrainLine count / frame
TerrainLine count / screen row
terrain output samples / frame
terrain output samples / screen row
```

`terrain output samples` counts the actual GroundMap and colored GroundBase output work performed by the terrain path. Transparent GroundBase spans that perform no output work do not add samples.

This is compatible with the Core content/compiler budget model: a budget violation is an authoring/compiler problem, not permission to discard a non-optional TerrainLine at runtime.

## Sprite metrics

The scaled-sprite blitter now has an optional scanline workload observer. It reports:

```text
output samples / scanline
written opaque pixels / scanline
```

The observer changes no clipping, sampling, transparency, or draw order.

The M5 frame aggregator records:

```text
visible world sprite count / frame
sprite output samples / frame
sprite output samples / scanline
sprite written pixels / frame
sprite written pixels / scanline
```

The scanline/frame workload totals include the Player Sprite because it uses the same scaler/blitter resource. `visibleSpriteCount` remains the world-sprite count, so the semantic distinction is preserved.

## GroundMap LOD telemetry

The renderer also records how many TerrainLines used each already-baked GroundMap level. This is diagnostic only and does not change level authority.

Current 70-frame stress sweep:

```text
level 0 : 3437 TerrainLines
level 1 : 3436
level 2 : 1755
level 3 :  979
level 4 :  546
level 5 :  173
level 6 :   18
```

The sweep therefore exercises the proven M5.6 `k_max=6` in the actual baked M5.7 runtime path.

## Current observed envelope

The M5.8 compiler/test sweep covers the current debug course at roughly 40 m chainage intervals, yaw offsets `-60° / 0° / +60°`, and extra lateral probes through the dense cliff/guardrail region.

Measured maxima are:

```text
TerrainLine count / frame             171
TerrainLine count / screen row          9
terrain output samples / frame      54,720
terrain output samples / screen row   2,880
visible world sprites / frame           17
sprite output samples incl player   18,364 / frame
sprite output samples / scanline        268
sprite written pixels incl player   12,938 / frame
sprite written pixels / scanline        268
GroundMap max level used                  6
```

## Provisional current-debug-content budget

M5.8 applies one explicit mechanical headroom factor:

```text
headroom = 1.25
budget   = ceil(observed maximum × 1.25)
```

This yields:

```text
TerrainLine count max / frame         214
TerrainLine count max / screen row     12
terrain output samples max / frame 68,400
terrain output samples max / row     3,600
visible world sprites max / frame      22
sprite output samples max / frame  22,955
sprite output samples max / scanline  335
```

The single factor is deliberately explicit so the provisional budget cannot become a collection of unexplained tuning numbers.

## Important status

This is **not yet the final target-hardware budget**.

The current debug content does not contain the Core tunnel/portal close-up stress case. M5.9 must add that content using the existing architecture, rerun the workload sweep, and either:

- demonstrate that the current provisional budget covers it, or
- rebase the budget from the stronger measured envelope with an explicit documented margin.

## Preserved renderer rules

M5.8 does not add:

- runtime TerrainLine dropping because of budget counters
- a z-buffer
- polygon road geometry
- perspective-correct texture mapping
- runtime GroundMap anisotropic filtering
- a 2D GroundMap LOD table
- lateral-driven shared LOD promotion

Performance pressure must first be addressed by content/compiler choices such as thin-span handling, compile-time decimation, sprite culling/LOD for optional content, asset sharing, or Far Background substitution where the Core permits it.
