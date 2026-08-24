# M6.45 Open Source Profiles

## Status

**COMPLETE / normative addendum to the M6.44 open-path architecture**

Package authority:

```text
super-outride-m6-45@0.6.45
```

M6.45 changes source-domain ownership only. It does not change frozen renderer mathematics, vehicle physics authority, Raster/Guide geometry semantics, route arbitration, sprite scale, or Painter order.

---

## 1. Design rule

M6.44 made the general geometry and physical `SurfaceMap` open. M6.45 applies the same rule to the remaining stage-owned source channels.

The canonical rule is:

```text
general stage source = open domain [0, L]
cyclic addressing     = explicit named adapter
```

No general source may infer that `L` reconnects to `0` merely because older DEV content happened to be loop-shaped.

The general primitives are now:

```text
RasterPath
GuidePath
SurfaceMap
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
```

Explicit periodic primitives remain available only when topology above Core deliberately asks for them:

```text
CyclicSurfaceMap
CyclicHeightProfile
CyclicVisualProfile
CyclicGroundMapLogicalProfile
CyclicBakedGroundMapAsset
```

The word `Cyclic` is therefore an opt-in topology decision rather than an inherited property of ordinary stage content.

---

## 2. Open chainage contract

For every general M6.45 source:

```text
0 <= s <= L
```

is the valid domain.

Sampling outside that interval is an authoring/runtime validation error. The source does not:

- modulo-wrap;
- clamp silently;
- guess a successor;
- manufacture a seam;
- inspect course mode;
- ask the renderer whether the course is linear, branching, or circuit.

Tiny floating-point endpoint tolerance may normalize a value that is mathematically `0` or `L`; it is not topology behavior.

---

## 3. HeightProfile

`HeightProfile` is the general open height authority.

Its compiled representation owns explicit nodes at both real endpoints:

```text
node[0].s    = 0
node[last].s = L
```

This is deliberate. The profile itself must never invent a hidden last-to-first height segment.

Therefore:

- `sampleRender(0)` and `sampleRender(L)` are valid;
- `samplePhysics(0..L)` and `sampleCamera(0..L)` are valid;
- `distanceToNextRenderNode(L) = 0`;
- `s < 0` or `s > L` is rejected;
- there is no automatic `L -> 0` interpolation.

### 3.1 Authoring endpoint policy

Stage authoring is allowed to specify height **change points** rather than redundantly writing a final runout node.

`compileStageEnvironment()` therefore owns one explicit compiler rule:

```text
if last authored height node < L:
    append { s: L, y: last.y }
```

This means the final authored height is held constant through the ordinary open runout.

The distinction is important:

```text
authoring compiler may make an explicit content decision
HeightProfile itself may not guess missing topology
```

If authored height data extends beyond the Guide endpoint, compilation fails.

---

## 4. VisualProfile

`VisualProfile` is the general open GroundBase/visual-section authority.

Sections still use `sStart` change points and the last section remains active through the real endpoint `L`, but addressing never wraps.

At `s=L`:

- the last section is returned;
- `distanceToNextSection(L) = 0`.

Outside `[0,L]`, sampling fails.

`CyclicVisualProfile` is the only visual-profile primitive that periodically maps chainage.

---

## 5. Logical GroundMap

`compileSurfaceRegions()` now produces a general open `GroundMapLogicalProfile`.

The logical material channel therefore follows the same stage domain as Raster/Guide/SurfaceMap instead of inheriting an old course loop.

`CyclicGroundMapLogicalProfile` remains an explicit adapter for content whose upper-level topology intentionally repeats the source.

GroundMap logical material remains independent from:

- GroundBase transparency;
- SurfaceMap physical support;
- renderer depth;
- route choice.

---

## 6. Baked GroundMap

`BakedGroundMapAsset` now exposes the baked texture pyramid as one open chainage source.

Runtime sampling rules are:

```text
s = 0   -> first baked row
s = L   -> last baked row
s < 0   -> RangeError
s > L   -> RangeError
```

`CyclicBakedGroundMapAsset(source)` is the explicit periodic adapter.

### 6.1 Asset format does not change

The binary/metadata storage format remains version `1`.

No migration is needed because the stored pyramid already represents a finite interval. What changed is **addressing semantics**, not the byte layout.

The offline compiler now rasterizes texel centers directly over the open interval. It no longer applies `wrapPositive()` while baking ordinary source rows.

This avoids introducing an unnecessary topology field or duplicate asset format.

---

## 7. Reader boundaries

Consumers that do not own topology depend on structural reader contracts, not on route shape.

Examples include:

```text
HeightProfileReader
GroundMapLogicalProfileReader
BakedGroundMapReader
SurfaceMapReader
```

The runtime package, sprite compiler, vehicle/camera consumers and rendering pipeline therefore need only the operations they consume. They do not decide whether the provider is open or cyclic.

This preserves the architectural direction:

```text
content / course-mode layer may choose a source adapter
                     ↓
ordinary reader contract
                     ↓
physics / camera / renderer
```

not:

```text
renderer → inspect course topology → wrap/branch specially
```

---

## 8. Ordinary branching content is open

The M6.22 child continuation and M6.23 child environment fixtures represent point-to-point/branching stages. They now construct ordinary:

```text
SurfaceMap
HeightProfile
VisualProfile
```

rather than cyclic variants.

Likewise the reusable stage authoring compiler emits an open `HeightProfile` and `VisualProfile`.

This is important because explicit cyclic adapters should remain exceptional by construction. They are available for future circuit or historical DEV content, but ordinary point-to-point stages do not opt into them accidentally.

---

## 9. Renderer authority is unchanged

M6.45 does not add any renderer topology branch.

The frozen rules remain:

```text
d = s_render - s_camera
```

and:

```text
one chainage -> one horizontal scanline
Terrain + World Sprite -> one far-to-near Painter stream
```

The renderer does not receive:

- `courseLength` for depth wrapping;
- `LINEAR` / `BRANCHING` / `CIRCUIT` switches;
- a special endpoint seam path;
- a cyclic GroundMap fallback.

Open endpoint clipping remains ordinary geometry behavior established by M6.44.

---

## 10. Circuit remains an upper-layer concern

M6.45 does not implement circuit gameplay.

A future circuit may deliberately assemble periodic behavior above the general primitives. Where repeated source addressing is appropriate, it must be visible through explicitly named adapters.

For example:

```text
CIRCUIT topology/compiler
    -> explicit Cyclic* source adapters where required
    -> same reader consumers
    -> same renderer equations
```

A circuit must not turn `HeightProfile`, `VisualProfile`, `GroundMapLogicalProfile`, `BakedGroundMapAsset`, RasterPath, GuidePath, or pseudo-depth back into implicitly cyclic primitives.

---

## 11. Regression authority

M6.45 directly verifies:

1. open `HeightProfile` requires explicit `0` and `L` endpoints and rejects out-of-range sampling;
2. periodic height addressing requires `CyclicHeightProfile`;
3. open `VisualProfile` and explicit `CyclicVisualProfile` remain distinct;
4. open logical GroundMap and explicit cyclic logical GroundMap remain distinct;
5. stage compilation explicitly extends the final authored height to the Guide endpoint;
6. general baked GroundMap rejects out-of-range chainage;
7. cyclic baked GroundMap addressing requires `CyclicBakedGroundMapAsset`.

M6.44 ended at **369 tests**. M6.45 adds/splits the profile-topology coverage for **375 tests total** at the pre-documentation code checkpoint.

The full suite also revalidates all existing deep-route, handoff, multi-actor, renderer, GroundMap LOD and fixed-metric-sprite invariants.

---

## 12. Final principle

The architectural rule after M6.45 is deliberately simple:

> **Open is the general data model. Cyclic is a named topology adapter. The renderer is neither.**

This keeps LINEAR and BRANCHING courses natural, keeps future CIRCUIT support explicit, and prevents historical loop-shaped DEV content from determining Core semantics.
