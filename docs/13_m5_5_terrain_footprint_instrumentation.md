# M5.5 — TerrainLine Source-Footprint Instrumentation

## Status

M5.5 instruments the existing Road Generator so GroundMap LOD decisions can be derived from the **actual TerrainLine mapping**, not only from flat-road approximation formulas.

It deliberately does not change terrain drawing, Painter ordering, pseudo-depth, geometry or vehicle physics.

## 1. TerrainLine footprint metadata

Every `M3TerrainLine` now records:

```text
sourceFootprint {
    deltaS
    deltaSCollapse
    deltaSEffective
    deltaL
    collapsed
}
```

These meanings follow Core §§25 and 64.

For an ordinary output row `y`, pixel-center notation gives boundaries `y` and `y+1`, so:

```text
deltaS = |s(y+1) - s(y)|
```

using the same segment inverse mapping as the Road Generator and clipping to the active forward `d_min..d_max` interval.

For the existing algebraic single-row collapse path:

```text
deltaSCollapse = represented clipped chainage interval length
deltaSEffective = max(deltaS, deltaSCollapse)
```

The collapse path remains presentation-neutral; M5.5 only records its source footprint.

## 2. Exact lateral footprint

The scanline already maps the authored lateral width affinely into:

```text
xGroundL .. xGroundR
```

Therefore one output pixel represents exactly:

```text
deltaL = (groundLeft + groundRight) / (xGroundR - xGroundL)
```

for every non-degenerate emitted TerrainLine.

No Euclidean or perspective depth correction is introduced.

## 3. Compiler reduction

`src/compiler/terrain-footprint-analysis.ts` reduces actual emitted TerrainLines into:

```text
lineCount
collapsedLineCount
maxDeltaS
maxDeltaSCollapse
maxDeltaSEffective
maxDeltaL
requiredChainageLevel
maxDiagnosticLateralLevel
```

`requiredChainageLevel` uses M5.4's chainage-only GroundMap authority.

`maxDiagnosticLateralLevel` remains diagnostic and cannot raise the shared pyramid level.

## 4. Important boundary

The deterministic debug-course sweep is an **observed envelope**, not yet the final target-design envelope.

It samples current course geometry and multiple large yaw offsets through the actual Road Generator. This is useful evidence, but it is not sufficient to freeze production `k_max` because final validation must still cover the chosen target envelopes for:

- camera height / vertical framing
- pitch
- grade and future courses
- near/far clip
- explicit thin-span collapse threshold
- future special visual cases

M5.5 therefore records facts without inventing an LOD depth.

## 5. Next

1. define a target-profile camera/pitch/height envelope without changing Core geometry rules
2. add an explicit compiler thin-span threshold/profile rather than relying only on algebraic degeneracy
3. sweep the full target envelope using this exact telemetry
4. derive and validate the real `k_max`
5. then connect baked GroundMap pyramid chunks to runtime sampling
