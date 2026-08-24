# M6.48 — Explicit Circuit Topology Foundation

## 0. Status

**Complete candidate; release requires docs-inclusive exact-head CI and validation-file-inclusive exact-head CI before main fast-forward.**

Package:

```text
super-outride-m6-48@0.6.48
```

Code-green checkpoint:

```text
feature head: d320e8635cd2e5a42000ff785f2be837b5eb7f9a
GitHub Actions: #453
build job: 97620478759
exact checkout: d320e8635cd2e5a42000ff785f2be837b5eb7f9a
396 tests / 396 pass / 0 fail
```

M6.48 does not redefine renderer Core. It implements the upper-level CIRCUIT direction required by the M6.44 open-path and M6.45 open-source architecture.

---

## 1. Problem

The product has three route structures:

```text
LINEAR
BRANCHING
CIRCUIT
```

M6.44 intentionally made the general Raster/Guide geometry primitive open:

```text
P0 → P1 → ... → Pn
```

with no synthetic:

```text
Pn → P0
```

M6.45 likewise made general stage sources open and retained explicitly named `Cyclic*` adapters only as opt-in topology adapters.

The remaining design question was therefore not “how should Core become closed?” It was:

> **How can a circuit identify a lap seam and maintain continuous chainage while keeping every ordinary Core/source consumer open?**

M6.48 answers that question.

---

## 2. Governing rule

> **A circuit is topology over an open path, not a different renderer geometry primitive.**

The topology layer may:

- identify two endpoint coordinates as one lap seam;
- maintain continuous/unwrapped topology chainage;
- map finite lap-local source data into the appropriate topology window;
- explicitly select cyclic source adapters when later integration requires them.

It may not:

- add a last→first segment inside `RasterPath`;
- add modulo depth to projection;
- make `GuidePath` cyclic by default;
- weaken the point-to-point `RouteDag` cycle rejection;
- duplicate the Core Raster turn/miter rules;
- treat topology winding as race-lap validation.

---

## 3. Explicit one-lap authoring

A circuit lap remains an ordinary open `RasterPath`.

The authored vertex list explicitly returns to the start world position:

```text
P0 → P1 → ... → Pn-1 → Pn
                         Pn.world == P0.world
```

The final ordinary segment:

```text
Pn-1 → Pn
```

is the physical closing leg of the lap.

There is still no extra Core segment:

```text
Pn → P0
```

because `Pn` and `P0` are already the same authored world seam coordinate.

This preserves the M6.44 meaning of an open path exactly.

---

## 4. CircuitTopology authority

`src/gameplay/circuit-topology.ts` introduces:

```ts
interface CircuitTopology {
  id: string;
  lapPath: RasterPath;
  lapLength: number;
  seamTurn: number;
}
```

`compileCircuitTopology(id, lapPath)` requires:

1. a non-empty topology id;
2. a valid ordinary open `RasterPath`;
3. exact equality of the first and final world coordinates;
4. consistent seam endpoint authoring metadata.

At M6.48 the endpoint metadata with seam identity is `sourceRadius`; conflicting first/final values are rejected.

The topology object does not alter the source `RasterPath`.

---

## 5. Seam geometry uses existing Core authority

A subtle danger would be to calculate the endpoint-to-endpoint circuit turn in a new circuit-specific routine and independently enforce the 10° rule.

That would create two geometry authorities.

M6.48 instead creates a temporary two-lap vertex sequence:

```text
lap 0 → seam → lap 1
```

and recompiles it with:

```ts
compileRasterPath(...)
```

The lap seam becomes an ordinary interior Raster vertex in this proof path.

Therefore existing Core alone validates:

```text
turn <= 10°
miter validity
segment non-degeneracy
ordinary Raster interior rules
```

`CircuitTopology.seamTurn` is read back from that Core-compiled proof.

No second turn formula or circuit-specific miter implementation exists.

---

## 6. Finite unfolding

M6.48 provides:

```ts
unfoldCircuitRasterPath(topology, repeatCount)
```

For `repeatCount = 3`:

```text
lap 0 → lap 1 → lap 2
```

becomes one ordinary finite open `RasterPath`.

Later consumers can therefore operate over monotonically increasing finite chainage:

```text
0 ------------------------------------> 3L
```

without knowing that the source was topologically cyclic.

Every seam between copies is an ordinary interior Raster vertex and is checked by `compileRasterPath()`.

This is the intended bridge to a topology-neutral renderer/runtime window.

---

## 7. Continuous topology chainage

A circuit needs a coordinate that does not jump from `L` back to `0` every lap.

M6.48 defines:

```text
s_unwrapped = winding * L + s_local
0 <= s_local < L
```

with:

```ts
decomposeCircuitChainage(...)
wrapCircuitChainage(...)
liftCircuitLocalChainageNear(...)
```

The modulo operation is therefore explicitly owned by `CircuitTopology`, not by general Raster/Guide/source readers.

Example:

```text
L - 2 → L + 2
```

can remain continuous in topology coordinates even though the one-lap local source coordinate changes from near `L` to near `0`.

`liftCircuitLocalChainageNear()` maps an authored one-lap source coordinate in `[0,L]` to the equivalent continuous coordinate nearest a supplied unwrapped reference.

The explicit authored endpoint `L` is topology-equivalent to local `0`.

---

## 8. Winding is not race-lap authority

This is a critical separation.

`CircuitChainagePosition.winding` means only:

> how many topology-length intervals the continuous coordinate has crossed.

It does not mean:

> how many valid race laps the actor has completed.

Race progress remains governed by physical validation:

```text
ordered required gates/checkpoints
→ forward physical FINISH crossing
→ validated lap/result authority
```

Therefore:

- raw chainage mutation cannot award a lap;
- teleport cannot award a lap;
- reverse seam crossing cannot award a lap;
- shortcutting required checkpoints cannot award a lap.

The old race-progress principle remains intact: geometric/topological position is an observation; validated physical boundaries own race progress.

---

## 9. Relationship to explicit cyclic source adapters

M6.48 does not yet build a complete live CIRCUIT runtime package.

M6.45 already supplies opt-in adapters such as:

```text
CyclicHeightProfile
CyclicVisualProfile
CyclicGroundMapLogicalProfile
CyclicBakedGroundMapAsset
CyclicSurfaceMap
```

M6.48 provides the missing topology-side authority that can later decide when and how such an adapter should be used.

The desired direction is:

```text
CircuitTopology continuous chainage
→ map to one-lap source coordinate / finite unfolded window
→ ordinary reader or explicit Cyclic* adapter
→ ordinary runtime/Core consumer
```

Not:

```text
renderer detects circuit
→ renderer modulo-wraps chainage
```

---

## 10. RouteDag remains acyclic

The point-to-point route graph remains:

```text
LINEAR / BRANCHING
→ acyclic RouteDag
```

CIRCUIT topology is not represented by adding a cycle to that graph.

M6.48 imports no `route-dag` module and changes none of its rules.

A circuit may later use its own course-mode/runtime authority while reusing ordinary stage/runtime primitives below it.

---

## 11. Renderer remains topology-neutral

M6.48 does not change:

```text
pseudoDepth = s_render - s_camera
```

The renderer receives only a finite open chainage domain selected/prepared upstream.

No renderer field is added for:

```text
courseLength
lapIndex
isCircuit
wrapMode
```

The Painter and metric-sprite rules remain unchanged.

---

## 12. What remains unchanged

M6.48 preserves:

- world X/Y/Z physics authority;
- free lateral vehicle motion;
- one-chainage/one-scanline renderer structure;
- direct pseudo-depth `s_render - s_camera`;
- 2.0m = 80px player-depth metric authority;
- `f=200px`, `D_cam=5m` current values;
- Raster interior turn hard limit 10°;
- Guide as coordinate/camera support only;
- one far→near TerrainLine/WorldSprite Painter;
- no z-buffer/polygon road/perspective-correct road texture;
- open general Height/Visual/Ground/Surface source interfaces;
- current live BRANCHING route and field-lock behavior;
- PENDING → physical seam → COMMIT route transactions;
- COMMIT world-pose/yaw/velocity invariance;
- 0..16 rival product envelope;
- point-to-point RouteDag acyclicity.

---

## 13. Direct regression coverage

M6.48 adds seven direct regressions:

1. explicit repeated endpoint identifies a valid circuit seam;
2. an ordinary non-returning open path is rejected rather than implicitly closed;
3. conflicting seam `sourceRadius` metadata is rejected;
4. three-lap unfolding yields exactly three times the segment count/length and ordinary interior seam turns;
5. positive and negative continuous chainage decompose into canonical local chainage and winding;
6. one-lap source chainage lifts through the seam near a continuous reference while invalid source chainage is rejected;
7. the circuit module remains outside renderer/projection/RouteDag authority and delegates geometry proof to Core.

Code-green checkpoint:

```text
GitHub Actions run: #453
run id: 32786872538
build job: 97620478759
exact head: d320e8635cd2e5a42000ff785f2be837b5eb7f9a
396 tests
396 pass
0 fail
```

---

## 14. Files

New:

```text
src/gameplay/circuit-topology.ts
tests/m6-48-explicit-circuit-topology.test.mjs
docs/66_m6_48_explicit_circuit_topology.md
```

Version/current-state files updated:

```text
package.json
package-lock.json
index.html
README.md
```

Renderer/Core source files are not modified by M6.48.

---

## 15. Next architectural step

M6.49 should integrate a **Circuit Guide / Source Window** above the same open primitives:

```text
CircuitTopology
→ finite unfolded Raster window
→ ordinary Guide compilation across seam
→ topology/local mapping for Height / Visual / Ground / Surface sources
→ finite runtime content window
→ existing renderer
```

The important constraint remains:

> **Topology prepares an ordinary finite view. Core consumes that view without knowing why it repeats.**

M6.49 should not introduce a global `closed` flag, a renderer modulo branch, or a second geometry implementation.