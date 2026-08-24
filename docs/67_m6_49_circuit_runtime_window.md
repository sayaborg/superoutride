# M6.49 — Circuit Runtime Window Integration

## 0. Status

**Complete candidate; release requires docs-inclusive exact-head CI and validation-file-inclusive exact-head CI before main fast-forward.**

Package:

```text
super-outride-m6-49@0.6.49
```

Code-green checkpoint:

```text
feature head: e41bee83c8d3925d5646787b17b2d98c3ea09023
GitHub Actions: #466
run id: 32788978408
build job: 97626621991
exact checkout: e41bee83c8d3925d5646787b17b2d98c3ea09023
406 tests / 406 pass / 0 fail
```

M6.49 integrates the M6.48 upper-level CIRCUIT topology with ordinary open runtime consumers. It does not introduce a circuit renderer, cyclic Core geometry, or a cyclic RouteDag.

---

## 1. Problem

M6.48 established the correct geometry/topology split:

```text
one authored lap
= ordinary open RasterPath that explicitly returns to its start world point

CIRCUIT
= upper-level identification of that authored endpoint seam
```

That solved topology, but runtime consumers still need a usable chainage domain across the seam:

- Guide;
- HeightProfileReader;
- VisualProfileReader;
- SurfaceMapReader;
- BakedGroundMapReader;
- TerrainLine generation;
- ordinary renderer projection.

Making each of those consumers circuit-aware would duplicate topology logic throughout the engine.

M6.49 therefore answers a narrower question:

> **How can one-lap circuit sources be presented as one finite ordinary open runtime course so every downstream consumer remains topology-blind?**

---

## 2. Governing rule

> **Topology is resolved once at the runtime-window boundary. Everything below that boundary sees one finite open course.**

The integration flow is:

```text
CircuitTopology
+ one-lap open sources
+ startWinding
+ repeatCount
        │
        ▼
compileCircuitRuntimeWindow(...)
        │
        ├─ ordinary open RasterPath
        ├─ ordinary open GuidePath
        ├─ finite HeightProfileReader
        ├─ finite VisualProfileReader
        ├─ finite SurfaceMapReader
        └─ finite virtual BakedGroundMapReader
        │
        ▼
existing camera / physics / TerrainLine / renderer paths
```

No lower layer receives `routeKind === CIRCUIT`.

---

## 3. Finite window chainage

A window is seam-aligned and contains `N = repeatCount` authored lap copies.

For lap length `L`:

```text
window length = N * L
0 <= s_window <= N * L
```

The window also records the topology coordinate of its first point:

```text
s_unwrapped_start = startWinding * L
s_unwrapped_end   = s_unwrapped_start + N * L
```

Conversion is explicit:

```text
s_window = s_unwrapped - s_unwrapped_start
s_unwrapped = s_unwrapped_start + s_window
```

Out-of-window values throw. No renderer modulo exists.

---

## 4. Seam ownership

Exact seam ownership must be deterministic.

For an interior finite-window seam:

```text
s_window = k * L, 0 < k < N
→ source s = 0 of lap k
```

For the final finite open endpoint:

```text
s_window = N * L
→ source s = L of the final lap
```

This distinction preserves both requirements:

1. an internal circuit seam behaves like a normal continuation into the next copy;
2. the finite runtime window still has a real open endpoint whose endpoint semantics are inspectable without implicit wrap.

There is no ambiguous “sometimes 0, sometimes L” hidden in lower readers. The mapping belongs only to the circuit runtime-window layer.

---

## 5. Raster and Guide integration

`compileCircuitRuntimeWindow()` reuses M6.48:

```ts
unfoldCircuitRasterPath(topology, repeatCount)
```

The result is one normal open RasterPath with monotonically increasing chainage.

That RasterPath is compiled by ordinary:

```ts
compileGuidePath(...)
```

Therefore internal lap seams are ordinary interior Raster/Guide locations. Existing Core owns:

- turn validation;
- miter validation;
- Guide fillets;
- world coordinate sampling;
- forward visibility.

A camera positioned before an internal lap seam can see beyond that seam using the existing `computeForwardVisibleInterval()` because there is no Core endpoint there anymore.

---

## 6. Height integration

`CircuitHeightWindow` implements `HeightProfileReader` over `[0,N*L]`.

The one-lap source remains ordinary open authoring. The window repeats its source nodes into finite monotonically increasing chainage and delegates:

```text
sampleRender
samplePhysics
sampleCamera
distanceToNextRenderNode
```

The circuit seam additionally requires one physical height datum:

```text
Y_render(0) == Y_render(L)
Y_phys(0)   == Y_phys(L)
Y_camera(0) == Y_camera(L)
```

A source that does not return to the same seam height is rejected instead of being corrected at runtime.

This is geometry continuity, not a cosmetic patch.

---

## 7. Visual integration

`CircuitVisualWindow` implements `VisualProfileReader` over the same finite open chainage ruler.

At an interior seam, source selection restarts from one-lap `s=0`. At the finite final endpoint, the source is sampled at `s=L`.

The reader owns only source-address mapping. Far Background / GroundBase semantics remain unchanged.

---

## 8. SurfaceMap integration

`CircuitSurfaceWindow` implements `SurfaceMapReader`.

The physical map therefore follows the exact same finite window ruler as geometry and visual data:

```text
s_window
→ explicit circuit source mapping
→ source SurfaceMap.sample(s_local,l)
```

No physics subsystem receives a cyclic special case.

GroundMap and SurfaceMap remain semantically independent.

---

## 9. Virtual baked GroundMap

The baked GroundMap has a stronger existing runtime contract than a simple sampler: stage validation also reads its metadata.

M6.49 deliberately does **not** weaken that contract and does not introduce an optional-metadata compatibility branch.

Instead `CircuitBakedGroundMapWindow` implements the existing `BakedGroundMapReader` truthfully as a virtual finite asset.

For each source pyramid level:

```text
window chainageTexels = source chainageTexels * repeatCount
```

Chunk references are repeated with row offsets:

```text
lap 0 chunks → original rows
lap 1 chunks → rows + sourceChainageTexels
lap 2 chunks → rows + 2*sourceChainageTexels
...
```

The payload ids remain identical.

Therefore:

```text
virtual row references increase
texture payload bytes do not duplicate
```

`metadata.courseLength` truthfully becomes `N*L`, allowing existing stage/runtime length validation to remain strict.

This is preferable to adding a circuit exception to stage validation.

---

## 10. Terrain reader cleanup

M6.49 also removes one remaining stale cyclic type dependency from `TerrainVisualProfile`.

Before:

```text
height: CyclicHeightProfile
visual: CyclicVisualProfile
```

Now:

```text
height: HeightProfileReader
visual: VisualProfileReader
```

This changes no rendering mathematics. It makes the type boundary agree with the open-source architecture already established by M6.45–M6.47.

As a result, the circuit finite window passes directly into ordinary `generateTerrainLines()`.

---

## 11. Renderer remains topology-blind

M6.49 adds no CIRCUIT branch to `src/render/m5-renderer.ts`.

Renderer depth remains exactly:

```text
d = s_render - s_camera
```

The renderer receives only finite monotonically increasing open chainage.

It does not know:

- lap length;
- winding;
- local lap chainage;
- modulo rules;
- race-lap count;
- `routeKind`.

This preserves the architectural boundary:

```text
geometry ≠ topology
renderer ≠ route
open = general
circuit = explicit upper-level compilation
```

---

## 12. Topological winding is still not race-lap authority

M6.49 does not change the M6.48 distinction:

```text
window / unwrapped chainage
→ coordinate state

validated checkpoint sequence + physical FINISH
→ race progress / lap authority
```

Crossing an internal runtime-window seam cannot grant a race lap by itself.

Likewise, reverse motion, teleportation, recovery or source-address conversion cannot create validated race progress.

---

## 13. Non-goals

M6.49 intentionally does not implement:

- switching the live Pages fixture from BRANCHING to CIRCUIT;
- CIRCUIT race-rule/checkpoint product authoring;
- live circuit rival strategy;
- dynamic sliding/recentering of a finite window;
- infinite geometry allocation;
- world-sprite repetition across circuit laps;
- circuit-specific renderer paths;
- a cyclic RouteDag.

Those can be added above or beside this foundation without modifying renderer Core.

---

## 14. Direct regression coverage

Ten M6.49 regressions verify:

1. a finite circuit window compiles to ordinary open Raster/Guide geometry;
2. renderer forward visibility crosses an internal circuit seam without endpoint clipping;
3. unwrapped/window conversion is explicit and bounded;
4. interior seam source ownership is `s=0`, while the finite final endpoint remains `s=L`;
5. Height/Visual readers expose one finite open domain;
6. mismatched circuit seam height is rejected;
7. SurfaceMap repeats source semantics across internal seams without wrapping the finite endpoint;
8. virtual baked GroundMap metadata repeats row references while reusing source payload identity;
9. ordinary TerrainLine generation crosses a circuit seam through topology-neutral reader contracts;
10. runtime integration remains outside renderer and RouteDag authority, and TerrainVisualProfile no longer requires cyclic concrete types.

Code-green checkpoint:

```text
feature head: e41bee83c8d3925d5646787b17b2d98c3ea09023
GitHub Actions: #466
run id: 32788978408
build job: 97626621991
exact checkout expected: e41bee83c8d3925d5646787b17b2d98c3ea09023
exact checkout actual:   e41bee83c8d3925d5646787b17b2d98c3ea09023
406 tests / 406 pass / 0 fail
```

---

## 15. Release rule

The code-green checkpoint proves the implementation before release metadata.

After package/README/docs changes:

1. run the complete suite on the exact docs-inclusive feature head;
2. write `M6_49_VALIDATION.txt` referencing that pre-validation green head;
3. run the complete suite again on the exact validation-file-inclusive feature head;
4. fast-forward `main` only to that exact final CI-green SHA with `force=false`;
5. verify `main` equals that SHA exactly.
