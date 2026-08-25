# M6.51 Circuit Live Runtime Integration

## 0. Status

M6.51 makes the M6.48/M6.49/M6.50 CIRCUIT architecture actually drivable through the browser runtime while preserving the frozen separation:

```text
geometry != topology
renderer != route
open = general runtime domain
circuit = upper-level composition
physical gate validation = lap authority
```

The central result is intentionally smaller than originally expected:

> **No new live circuit-position tracker is required. The M6.49 finite open Guide is already the live ruler, and the existing local Guide search in ordinary vehicle physics naturally tracks the correct unfolded lap copy.**

No modulo, winding branch, circuit flag or duplicate renderer path is added to Core, vehicle physics, camera or renderer.

---

## 1. Goal

Before M6.51 the circuit stack had three validated pieces:

```text
M6.48  explicit CircuitTopology
M6.49  finite open runtime window
M6.50  finite ordered physical lap-race authority
```

What remained was browser/live integration:

- a player must actually drive across an internal circuit seam;
- vehicle chainage must continue onto the next unfolded copy;
- camera must follow the same finite open ruler;
- renderer must draw normally after the seam;
- physical checkpoints and FINISH must remain race authority;
- the existing BRANCHING browser runtime must remain intact;
- CIRCUIT must not become a mode branch distributed through engine layers.

M6.51 supplies that integration only.

---

## 2. The rejected design: a new circuit chainage tracker

A natural first thought is to add a runtime tracker that:

1. projects world position onto one-lap Guide geometry;
2. obtains local `s`;
3. compares against previous winding;
4. lifts the result to an unwrapped lap copy;
5. feeds the lifted chainage to camera/renderer/physics.

That would work, but it would duplicate state already present in the ordinary open vehicle runtime.

Existing car/bike physics already retains:

```text
course.s
course.l
course.segmentIndex
```

and updates its Guide location with a local search around the previous segment index.

M6.49 already compiles the circuit into one ordinary finite open Guide:

```text
copy 0 -> seam -> copy 1 -> seam -> copy 2 -> seam -> copy 3
```

At an internal seam, adjacent repeated copies are adjacent Guide segments in that finite path. The existing local search therefore advances from the old copy to the next copy exactly as it advances across any ordinary interior Guide boundary.

Adding another circuit tracker would create two authorities for the same live coordinate.

M6.51 deliberately does not do that.

---

## 3. Live coordinate authority

For CIRCUIT live driving, the authoritative runtime coordinate remains the ordinary vehicle course coordinate:

```text
vehicle.course.s
vehicle.course.l
vehicle.course.segmentIndex
```

but its Guide is the finite M6.49 runtime window.

Therefore:

```text
vehicle.course.s == s_window
```

within the finite runtime domain.

Across an internal lap seam:

```text
... L - epsilon
... L
... L + epsilon
```

There is no runtime reset to zero.

Topology-local diagnostics can still be obtained above Core:

```text
s_unwrapped = windowStart + s_window
(winding, s_local) = decomposeCircuitChainage(topology, s_unwrapped)
```

but those values do not replace `vehicle.course.s` and do not drive projection.

---

## 4. Generic live compiler

M6.51 adds:

```text
src/runtime/circuit-live-runtime.ts
```

with one deliberately small operation:

```text
compileCircuitLiveRuntime(
  topology,
  startWinding,
  guideOptions,
  oneLapSources,
  raceAuthoring
)
```

It compiles:

```text
CircuitLiveRuntime
  window
  raceRules
```

The only integration rule it adds is the already-established M6.50 runout rule:

```text
runtime repeatCount = race lapCount + 1
```

Thus a 3-lap race owns a 4-copy finite open runtime window.

The compiler has no dependency on:

- renderer;
- camera;
- car physics;
- motorcycle physics;
- browser DOM;
- RouteDag;
- branching policy.

It is only an upper-level assembly of existing circuit authorities.

---

## 5. Why `lapCount + 1` remains important in live driving

For a race with `N` scored laps:

```text
copy 0   scored lap 1
copy 1   scored lap 2
copy 2   scored lap 3
...
copy N-1 scored lap N
copy N   unscored runout/lookahead
```

The final scored FINISH therefore remains an ordinary internal seam.

This gives the live runtime the same properties at every scored FINISH:

- Guide continues beyond the seam;
- camera still has ordinary forward context;
- terrain renderer still has ordinary lookahead;
- local Guide search sees ordinary adjacent segments;
- no final-lap endpoint branch exists;
- vehicle can continue moving after race completion.

Race completion changes race state, not world/renderer topology.

---

## 6. DEV circuit source

M6.51 introduces a selectable three-lap solo DEV circuit in:

```text
src/dev/m6-51-circuit-live-runtime.ts
```

It reuses the existing M2 stadium Raster authoring.

The M2 source is an ordinary open path. CIRCUIT closure is explicit:

```text
open vertices
+ exactly one duplicate of the first Raster vertex at the end
```

Then M6.48 validates that duplicated endpoint as the topological lap seam.

Nothing in `RasterPath` itself changes.

The fixture uses:

```text
routeKind = CIRCUIT
rivalCount = 0
lapCount = 3
checkpoints = 1/4 L, 1/2 L, 3/4 L
runtime copies = 4
```

This is a DEV integration fixture, not final course content or calibrated handling.

---

## 7. Ordinary vehicle physics is reused directly

Browser CIRCUIT composition passes the finite window directly to the existing vehicle functions:

```text
updateM5Car(window.guide, window.height, window.surface, ...)
updateM5Bike(window.guide, window.height, window.surface, ...)
```

There is no:

```text
if CIRCUIT
wrap lap
increment winding in physics
reset s at seam
special seam snap
```

The world pose remains authoritative.

The local Guide search simply finds the next adjacent segment in the finite unfolded Guide.

This is the key M6.51 simplification.

---

## 8. Ordinary camera is reused directly

The existing M5 camera receives the same finite window Guide/Height:

```text
updateM5Camera(
  cameraRig,
  window.guide,
  window.height,
  vehicle,
  ...
)
```

Its frozen chainage relation remains:

```text
s_camera = s_player - D_cam
```

with the existing endpoint handling of an ordinary finite open path.

After an internal circuit seam, both player and camera remain on the second unfolded copy. No topology input is required.

---

## 9. Ordinary renderer is reused directly

The CIRCUIT composition calls the same renderer:

```text
renderM5Driving(...)
```

with:

```text
Guide = finite open circuit window Guide
Height = finite open window reader
Visual = finite open window reader
Surface = finite open window reader
```

Pseudo-depth remains exactly:

```text
d = s_render - s_camera
```

The renderer does not receive:

- lap number;
- winding;
- lap length;
- modulo helper;
- CIRCUIT mode flag.

There is no second road renderer for circuit mode.

---

## 10. Race authority remains M6.50

The browser composition supplies each simulation sample as:

```text
x
z
sWindow = vehicle.course.s
```

M6.50 then applies the existing finite ordered physical race rules.

Therefore:

```text
world motion + expected physical checkpoint crossing
    -> accepted checkpoint

required checkpoints + forward physical FINISH
    -> accepted lap

accepted final FINISH
    -> race FINISHED
```

Topological winding remains diagnostic only.

A player cannot earn a lap by merely reaching another repeated chainage copy.

---

## 11. Recovery

Recovery remains the existing gameplay/physics reset path.

After a recovery:

```text
recover vehicle
reset camera rig
resyncCircuitRaceProgress(...)
```

Resync only resets observation origin. It does not:

- award a checkpoint;
- award a lap;
- erase a validated checkpoint;
- alter accepted FINISH count.

No CIRCUIT-specific recovery physics is introduced.

---

## 12. Browser composition roots

M6.51 deliberately does not merge BRANCHING and CIRCUIT into one giant `main.ts` with repeated mode checks.

Instead there are two top-level compositions:

```text
src/main.ts          BRANCHING live fixture
src/main-circuit.ts  CIRCUIT live fixture
```

The shared engine beneath them remains unchanged.

`index.html` makes one explicit boot-time choice:

```text
default         -> main.js
?mode=circuit   -> main-circuit.js
```

This is a composition decision, not an engine mode flag.

The existing commit-versioned Pages boot applies to either entry point:

```text
./build/<exact SHA>/<entry>.js
```

so the cache-coherency guarantee remains intact.

---

## 13. Finish presentation

The simulation is intentionally not frozen when the race finishes.

That preserves the M6.50 `+1` runout rationale and keeps world simulation independent of result presentation.

The HUD therefore distinguishes:

```text
live elapsed simulation time
final physical FINISH result time
```

The displayed FINISH result is taken from the final recorded physical boundary timing and remains fixed even while the car continues into the runout copy.

---

## 14. Direct M6.51 regression coverage

M6.51 adds 8 direct regressions:

1. `lapCount + 1` runtime-copy derivation;
2. selectable DEV mode is true CIRCUIT with no branch authority;
3. explicit duplicated endpoint and finite open unfolding;
4. real 60 Hz ordinary M5 car physics crosses an internal lap seam and continues `course.s > L`;
5. existing open M5 camera follows the second finite copy after that real seam crossing;
6. unchanged M5 renderer draws a normal frame after that real seam crossing;
7. generic circuit live compiler has no browser/renderer/vehicle/RouteDag dependency;
8. circuit browser composition reuses open engine paths and imports no point-to-point route authority.

At the code-green checkpoint:

```text
exact head = 71f75b271a8be30d352557ffad59560f95899049
CI run = #486
428 tests
428 pass
0 fail
```

Version/docs changes after that checkpoint require their own exact-head CI before release validation.

---

## 15. Frozen invariants preserved

M6.51 does not change:

- world X/Y/Z vehicle authority;
- direct chainage pseudo-depth;
- one-chainage/one-scanline renderer structure;
- same-depth scale invariant;
- same-depth/same-height screen-Y invariant;
- Painter far-to-near;
- terrain/world-sprite shared Painter;
- camera roll 0;
- Raster interior turn <= 10 degrees;
- acyclic RouteDag;
- BRANCHING physical gate -> PENDING -> seam -> COMMIT semantics;
- first physical sibling crossing branch lock;
- fixed metric sprite authority `2.0 m = 80 px`;
- `D_cam = f / 40`;
- `DEV_UNCALIBRATED` vehicle handling status.

---

## 16. Result

The live CIRCUIT architecture is now:

```text
explicit closed-lap authoring
        |
        v
CircuitTopology                 M6.48
        |
        v
finite open N+1 runtime window  M6.49 / M6.51
        |
        +------> ordinary M5 car/bike physics
        |
        +------> ordinary M5 camera
        |
        +------> ordinary M5 renderer
        |
        v
ordered physical checkpoints
+ forward physical FINISH       M6.50
        |
        v
validated lap race result
```

The important architectural conclusion is not that CIRCUIT required another subsystem.

It is the opposite:

> **Once topology is unfolded into a finite open runtime domain, the ordinary open engine is already sufficient to drive it.**
