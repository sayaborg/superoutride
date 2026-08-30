# M6.50 Circuit Race Progress

> Current authority note: this document records the M6.50 introduction. Its historical
> `src/gameplay/race-progress.ts` ownership statement no longer describes the current tree; explicit
> circuit race progress now lives in the ordinary circuit gameplay modules and executable tests.

## 0. Status

M6.50 connects the explicit M6.48 CircuitTopology and the finite open M6.49 runtime window to product-style lap race progress.

The governing design remains:

```text
geometry != topology
renderer != route
open = general runtime domain
circuit = upper-level topology choice
physical gate validation = race authority
```

M6.50 does **not** turn Core, renderer, camera or vehicle physics into cyclic systems.

---

## 1. Goal

A CIRCUIT race must be able to require an authored number of laps while preserving all existing physical race guarantees:

- checkpoints are physical transverse world-space gates;
- checkpoints must be crossed in authored order;
- FINISH is a physical transverse world-space gate;
- reverse crossing never awards progress;
- raw chainage alone never awards a checkpoint or lap;
- recovery/resync never awards progress;
- continuous ranking progress remains bounded by the last validated gate and the next required gate;
- renderer remains topology-blind.

The central M6.50 statement is:

> **A circuit lap is an accepted physical FINISH after the required ordered physical checkpoints. Topological winding and seam passage are not lap authority.**

---

## 2. Inputs inherited from M6.48 and M6.49

M6.48 provides one explicit topological lap:

```text
P0 -> P1 -> ... -> Pn
                    Pn.world == P0.world
```

There is no hidden Core `Pn -> P0` segment.

M6.49 compiles that topology into one finite ordinary open runtime window:

```text
0 <= s_window <= repeatCount * L
```

where `L` is the one-lap topology length.

The renderer, Guide sampling, Height, Visual, Surface and Ground readers consume only this finite open `s_window` ruler.

M6.50 uses the same ruler for race progress.

---

## 3. Authority split

M6.50 deliberately separates four concerns.

### 3.1 Physical gate geometry

Owned by:

```text
src/gameplay/physical-race-gate.ts
```

It knows only:

- Guide geometry;
- one gate chainage;
- gate center;
- local Guide tangent;
- local Guide normal;
- Guide envelope width;
- actual previous/current world positions.

It does not know:

- lap count;
- CircuitTopology;
- route graph;
- renderer;
- vehicle physics implementation;
- race mode.

### 3.2 Generic finite ordered race progress

Owned by:

```text
src/gameplay/ordered-race-progress.ts
```

It consumes one finite open Guide and a strictly increasing list of physical gates.

It has no modulo operation and no topology flag.

### 3.3 Circuit race compilation

Owned by:

```text
src/gameplay/circuit-race-progress.ts
```

It expands one-lap checkpoint authoring and a target lap count into the generic finite ordered gate sequence.

Only this thin layer knows that the repeated sections represent laps of one CircuitTopology.

### 3.4 Timing / ranking

`race-session.ts` consumes only already-validated progress and the shared physical gate result.

It no longer requires the legacy wrapped `RaceProgressState` concrete type.

---

## 4. Shared physical race gate primitive

M6.50 extracts the previously private M6.0 gate geometry into a single shared primitive.

Canonical gate:

```text
PhysicalRaceGate
  index
  kind = checkpoint | finish
  name
  s
  center
  tangent
  normal
  halfWidth
```

Compilation:

```text
compilePhysicalRaceGate(guide, index, kind, name, s)
```

The gate center comes from the Guide at `s`, and the transverse gate spans the authored Guide envelope.

No race-only width knob is introduced.

Physical crossing remains the same geometric test as the legacy M6 race implementation:

1. express previous/current world position relative to the gate center;
2. project both onto the gate tangent;
3. require a sign change through the transverse gate plane;
4. solve exact segment intersection fraction `u`;
5. test the intersection point against `halfWidth` on the gate normal;
6. classify forward or reverse crossing.

Therefore M6.50 does not invent a second gate formula.

---

## 5. Legacy M6 race remains behavior-compatible

`src/gameplay/race-progress.ts` still owns the historical closed DEV race semantics:

```text
lap-local s
wrapPositive
wrapSigned delta
CP1 -> CP2 -> CP3 -> FINISH at local s=0
```

The only M6.50 change is that it delegates gate compilation, motion direction and gate crossing math to `physical-race-gate.ts`.

Existing M6.0/M6.1 regressions therefore remain the compatibility proof.

M6.50 does not silently redefine the old DEV race model.

---

## 6. Generic finite ordered race progress

The new general primitive is:

```text
OrderedRaceCourseRules
  guide
  courseLength
  gates[]
```

with authored gates:

```text
0 < gate[0].s < gate[1].s < ... <= guide.length
```

The final gate must be `finish`.

The runtime state is monotonic in authority, not necessarily in raw vehicle motion:

```text
status
nextGateIndex
validatedProgressFloor
sProgress
direction
acceptedGateCount
acceptedFinishCount
reverseCrossingCount
shortcutViolationCount
previous world/sample state
```

There is no:

```text
lapLength
wrapPositive
wrapSigned
CircuitTopology
routeKind
```

inside this generic progress primitive.

This makes it reusable for any future finite open race whose physical gates are naturally ordered.

---

## 7. Role of `s_window`

Finite window chainage has exactly two race-progress roles.

### 7.1 Bounded continuous interpolation

Between validated gates:

```text
validatedProgressFloor <= sProgress <= nextRequiredGate.s
```

Raw `s_window` movement may move `sProgress` only inside that validated interval and only when its sign agrees with actual world-space travel direction.

Raw `s_window` can never cross the next physical gate ceiling by itself.

### 7.2 Logical gate-copy disambiguation

A circuit repeats the same world geometry every lap.

For example:

```text
L1_CP1.center == L2_CP1.center == L3_CP1.center
```

If every repeated gate were tested by world coordinates alone, one physical crossing could appear to intersect every repeated copy.

M6.50 therefore uses the finite open previous/current `s_window` interval to choose which logical gate instances are eligible for this physics step.

The candidate interval is expanded by actual planar world travel to tolerate a small Guide projection lag.

After candidate selection, **actual world-space physical crossing is still mandatory**.

Therefore:

```text
s_window candidate selection != gate validation
```

and:

```text
raw chainage alone cannot score
```

---

## 8. Circuit race authoring

A circuit race authoring record is intentionally small:

```text
CircuitRaceAuthoring
  id
  lapCount
  checkpointChainages[]
```

Checkpoint chainages are one-lap local authoring values:

```text
0 < CP1 < CP2 < ... < L
```

At least one physical checkpoint per lap is required.

This prevents a seam crossing alone from becoming sufficient lap authority.

For a three-lap race with three checkpoints per lap, the circuit compiler produces:

```text
L1_CP1
L1_CP2
L1_CP3
L1_FINISH
L2_CP1
L2_CP2
L2_CP3
L2_FINISH
L3_CP1
L3_CP2
L3_CP3
L3_FINISH
```

Their finite open gate chainages are strictly increasing.

The generic ordered progress runtime then has no need to understand laps or modulo.

---

## 9. The `lapCount + 1` runtime-window rule

This is a normative M6.50 rule:

> **A scored N-lap CIRCUIT race requires an M6.49 runtime window containing at least N+1 lap copies.**

For `lapCount = N`:

```text
raceDistance = N * L
window.length >= (N + 1) * L
raceDistance < window.length
```

### Why the extra unscored lap exists

Without it, the final scored FINISH would coincide with the finite open Guide endpoint.

That would force one of the following undesirable special cases:

- endpoint-specific FINISH tangent authority;
- synthetic seam geometry;
- renderer/lookahead clipping exactly at final FINISH;
- a special final-lap runtime path.

Instead M6.50 places **every scored FINISH at an ordinary internal seam**:

```text
L
2L
...
NL
```

while the finite endpoint is later:

```text
(N+1)L or beyond
```

Therefore all scored FINISH gates use the same ordinary seam geometry and renderer/camera still have normal forward content after the race ends.

This is simpler than teaching lower layers about a special final circuit endpoint.

---

## 10. FINISH geometry

Because the M6.49 Guide is an ordinary unfolded open Guide, the internal seam at each `kL` has normal interior continuation geometry.

For all scored laps:

```text
FINISH_1 center/tangent/normal
== FINISH_2 center/tangent/normal
== ...
== FINISH_N center/tangent/normal
```

up to numerical tolerance.

Only the finite gate chainage and gate identity differ.

This gives one physical finish line in world space with multiple ordered logical race-boundary instances.

---

## 11. Validated lap authority

The authoritative lap count is:

```text
acceptedFinishCount
```

A lap increments only when all of the following are true:

1. the next required gate is the FINISH for that lap;
2. the actual world segment crosses the physical FINISH plane;
3. the crossing is forward;
4. the crossing point lies inside the Guide race envelope;
5. all preceding checkpoints for that lap were physically accepted in order.

Therefore these do not increment lap count:

```text
CircuitTopology winding change
s_window passing kL without physical world crossing
physical FINISH crossing before required checkpoints
reverse FINISH crossing
recovery/resync
teleport/raw chainage mutation
```

---

## 12. `startWinding` is not race state

M6.49 may compile a runtime window beginning at any topological winding:

```text
startWinding = ... -2, -1, 0, 1, 137, ...
```

M6.50 records this only as topology/window identity.

Initial race state remains:

```text
acceptedFinishCount      = 0
validatedProgressFloor   = 0
```

regardless of `startWinding`.

Thus:

```text
topological winding != validated race lap
```

is executable, not merely documentary.

---

## 13. Reverse crossing

A reverse crossing of any physical race gate is observable but does not validate it.

For FINISH:

```text
reverse physical FINISH crossing
-> REVERSE_CROSSING
-> acceptedFinishCount unchanged
-> nextGateIndex unchanged
```

No special circuit exception exists.

---

## 14. Shortcut rejection

If a vehicle physically crosses a later gate before the currently required gate:

```text
crossing.gate.index != nextGateIndex
```

then:

```text
SHORTCUT_REJECTED
```

No validated floor, lap or race completion is awarded.

This includes physically crossing the circuit seam/FINISH before the required checkpoints.

---

## 15. Recovery / resync

Recovery changes only the observation origin used for future physical gate intersection tests.

```text
resyncCircuitRaceProgress(...)
```

preserves:

```text
validatedProgressFloor
sProgress
nextGateIndex
acceptedGateCount
acceptedFinishCount
```

and records:

```text
RESYNC
```

Thus recovery cannot manufacture or erase race progress.

---

## 16. Race completion

Intermediate physical FINISH boundaries produce:

```text
BOUNDARY
```

and increment `acceptedFinishCount`.

Only the final authored FINISH produces:

```text
status = FINISHED
event = FINISHED
justFinished = true
```

After that, further observations return:

```text
IGNORED_AFTER_FINISH
```

and validated progress remains frozen at `raceDistance`.

---

## 17. Race session timing

M6.50 generalizes `race-session.ts` to the minimum contract it actually needs:

```text
RaceSessionProgressView
  validatedProgressFloor

RaceSessionUpdateView
  acceptedGate
```

`acceptedGate` is the shared `PhysicalRaceGate`.

Therefore both:

```text
legacy RaceProgressState / RaceProgressUpdate
```

and:

```text
CircuitRaceProgressState / CircuitRaceProgressUpdate
```

can feed the same deterministic timing system.

No CIRCUIT-specific timer is created.

A physically accepted circuit FINISH is recorded as an ordinary course-boundary timing.

---

## 18. Ranking

The existing ranking principle remains unchanged:

```text
primary   = sProgress
secondary = validatedProgressFloor
exact equality = true tie
```

For CIRCUIT, both values are already expressed on the finite open race ruler:

```text
0 <= progress <= raceDistance
```

No modulo ranking is needed.

This is an important simplification: a vehicle on lap 3 naturally has larger validated/open progress than a vehicle at the same local source position on lap 2.

---

## 19. Renderer and physics isolation

M6.50 adds no CIRCUIT branch to renderer Core.

Renderer still consumes:

```text
s_object
s_camera
pseudoDepth = s_object - s_camera
```

on the finite M6.49 open window.

It does not inspect:

```text
lapCount
acceptedFinishCount
nextGateIndex
CircuitRaceRules
CircuitTopology
```

Vehicle physics remains world X/Y/Z authoritative and does not receive lap logic.

The fixed metric authority remains unchanged:

```text
2.0 m = 80 px at player pseudo-depth
1 m = 40 px
D_cam = f / 40
```

---

## 20. RouteDag isolation

CIRCUIT does not enter the acyclic point-to-point RouteDag.

The product mode split remains:

```text
LINEAR     -> point-to-point route authority
BRANCHING  -> acyclic RouteDag + physical route gates/handoffs
CIRCUIT    -> CircuitTopology + finite ordered physical race progress
```

M6.50 therefore does not weaken the DAG cycle rejection introduced for branching/point-to-point gameplay.

---

## 21. M6.50 direct regression authority

M6.50 adds fourteen direct regressions.

They prove:

1. one-lap circuit authoring expands to one strictly ordered finite physical gate sequence;
2. an N-lap race requires at least N+1 runtime lap copies;
3. invalid/missing/unordered one-lap checkpoints are rejected;
4. topological `startWinding` does not seed validated race laps or progress;
5. raw `s_window` movement without world motion cannot score or advance validated progress;
6. crossing physical FINISH before required checkpoints is a shortcut and awards no lap;
7. a complete ordered physical lap increments validated lap only at FINISH;
8. repeated world-space checkpoint geometry is disambiguated by finite window chainage without duplicate acceptance;
9. every scored FINISH uses the same internal seam physical plane geometry;
10. reverse FINISH crossing awards no lap;
11. recovery resync cannot award, erase or move validated race progress;
12. the complete three-lap physical sequence finishes exactly at the third validated FINISH;
13. shared physical gate math is reused while generic ordered progress and renderer remain topology-blind;
14. generic race-session timing consumes circuit progress directly and records physical boundary timing.

The first code-only checkpoint before item 14 and version/docs integration was:

```text
feature head: 8ddbef9edb0b9c0f221b789db8577741cb6b6ef2
GitHub Actions: #474
run id: 32807659262
build job: 97680801851
exact checkout: 8ddbef9edb0b9c0f221b789db8577741cb6b6ef2
419 tests / 419 pass / 0 fail
```

After the race-session integration, the expected complete suite is:

```text
420 tests / 420 pass / 0 fail
```

The docs/version-inclusive head and final validation-file-inclusive head must each independently reproduce that result before `main` may fast-forward.

---

## 22. Intentionally out of scope

M6.50 establishes race authority but does not yet switch the current live Pages fixture from BRANCHING to CIRCUIT.

Deferred to a later milestone:

- product/DEV mode selection that boots an actual CIRCUIT race;
- continuous vehicle/world-to-window tracking in the live browser loop;
- circuit rival roster integration;
- circuit result/objective UI;
- circuit-specific recovery placement policy near finite window boundaries;
- choosing actual product lap counts/checkpoint locations for authored courses.

These remain above the renderer and must reuse the M6.49/M6.50 primitives rather than introducing cyclic lower-layer special cases.

---

## 23. Primary files

```text
src/gameplay/physical-race-gate.ts
src/gameplay/race-progress.ts
src/gameplay/ordered-race-progress.ts
src/gameplay/circuit-race-progress.ts
src/gameplay/race-session.ts
src/gameplay/circuit-topology.ts
src/runtime/circuit-runtime-window.ts
tests/m6-race-progress.test.mjs
tests/m6-50-circuit-race-progress.test.mjs
tests/m6-50-circuit-race-session.test.mjs
```

---

## 24. Final M6.50 rule

```text
CircuitTopology winding
        !=
validated race lap

finite s_window candidate identity
        !=
physical gate acceptance

required checkpoints
+ forward physical FINISH
        =
one validated circuit lap
```

This is the M6.50 authority boundary.
