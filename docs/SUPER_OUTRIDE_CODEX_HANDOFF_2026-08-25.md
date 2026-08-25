# SUPER OUTRIDE — Codex Takeover Handoff — 2026-08-25

## 0. Purpose

This document transfers the active SUPER OUTRIDE development context from the preceding ChatGPT development thread into the repository itself so future Codex sessions can resume from source-controlled authority rather than chat memory.

This is a **snapshot** of the takeover state. It does not replace the Core Freeze, normative addenda, milestone documents, types or tests.

The persistent agent rules are in:

```text
AGENTS.md
```

Read that file first in every fresh coding-agent context.

---

## 1. Exact pre-handoff game baseline

The final game/runtime implementation baseline before adding Codex migration documentation is:

```text
repository:
  sayaborg/superoutride

branch:
  main

exact SHA:
  6e15c374ba6679eec16b589c68941154c67665fd

package:
  super-outride-m6-51@0.6.51

tests:
  431 / 431 pass / 0 fail

latest runtime PR:
  #70 M6.51 Pages branching continuation hotfix

Pages main-push workflow:
  #496
  run id 32833392245
  head SHA 6e15c374ba6679eec16b589c68941154c67665fd
  build success
  deploy success
```

PR #70 used exact-head validation before release. Its head SHA and merge SHA are the same as the pre-handoff game baseline above; `main` was fast-forwarded with `force=false`, not via an extra merge commit.

### Important distinction

The Codex handoff documentation itself is added **after** this game baseline, so the final post-handoff `main` SHA will be newer. Do not expect the final repository HEAD to equal `6e15c374...`.

`6e15c374...` means:

> **the exact game/runtime state that was already validated before the documentation-only Codex takeover package was added.**

The handoff PR/validation record must prove that the documentation-only release still reproduces the same complete test suite.

---

## 2. Product summary

SUPER OUTRIDE is a 320×240 browser pseudo-3D high-speed driving game inspired primarily by Out Run and Super Hang-On, with later Super Scaler-era density/visual goals.

Product intent:

- high-speed driving, generally 200 km/h+;
- cars and motorcycles selectable;
- world-space physical movement including diagonal travel relative to road direction;
- BGM selection planned/product-facing;
- LINEAR point-to-point courses;
- Out Run-style BRANCHING point-to-point courses;
- CIRCUIT support without weakening the open pseudo-3D Core;
- 0..16 rival product envelope;
- browser target at logical 320×240;
- keyboard on PC;
- touch steering/pedals on mobile/tablet;
- analog steering, binary accelerator/brake, no gyro requirement.

The renderer is intentionally not a conventional 3D engine. The pseudo-3D structure is treated as a computation-saving raster architecture, not merely a visual imitation.

---

## 3. Authority map

Do not reconstruct authority from this handoff alone.

### Frozen renderer/core authority

```text
docs/00_core_design_freeze.md
docs/00a_core_design_freeze_addendum_m5_2.md
docs/00b_core_design_freeze_addendum_m6_44.md
docs/00c_core_design_freeze_addendum_m6_45.md
```

### Important recent milestone authority

```text
docs/62_m6_44_open_path_core.md
docs/63_m6_45_open_source_profiles.md
docs/64_m6_46_branch_violation_recovery.md
docs/65_m6_47_open_parent_stage_integration.md
docs/66_m6_48_explicit_circuit_topology.md
docs/67_m6_49_circuit_runtime_window.md
docs/68_m6_50_circuit_race_progress.md
docs/69_m6_51_circuit_live_runtime.md
```

### Current incident validation authority

```text
M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt
```

That file records the actual deployed-artifact investigation and fix for the M6.51 BRANCHING freeze reported immediately before this handoff.

### Persistent agent working rules

```text
AGENTS.md
```

### Entry/index

```text
README.md
```

README is informative/indexing authority, not a replacement for the files above.

---

## 4. Frozen architectural invariants that matter most

A future agent must be able to restate these accurately before making structural changes.

### World / road separation

Physics authority is world space:

```text
X / Y / Z
world yaw
world velocity
```

Road/Guide coordinates are support, rendering-chainage and camera coordinate systems. They do not constrain the vehicle to the centerline.

### Renderer depth

```text
d = s_render - s_camera
```

No Euclidean-distance depth, camera-Z replacement, course modulo or topology-derived depth.

### Raster structure

- one chainage corresponds to one horizontal scanline;
- Raster road interior turn limit is `<= 10 degrees` per vertex;
- Guide is coordinate/camera support only;
- Terrain and World Sprites share one far-to-near Painter;
- no z-buffer;
- no normal polygon-road conversion;
- no perspective-correct texture mapping;
- no arbitrary runtime sprite rotation;
- 0/1 transparency only;
- camera roll = 0.

### Metric sprite authority

At player pseudo-depth:

```text
2.0 m = 80 px
1.0 m = 40 px
```

Current:

```text
f = 200 px
D_cam = 5 m
D_cam = f / 40
```

FOV changes must preserve the fixed 40 px/m player-depth reference by adjusting `D_cam`.

There is no arbitrary `visualScale` authority.

### Ground semantics

GroundMap is visual source data.

SurfaceMap is physical support/material data.

They are deliberately independent.

GroundBase `TRANSPARENT` does not imply SurfaceMap `VOID`, and vice versa.

Far Background is a full bitmap including below-horizon content.

---

## 5. Open geometry/source architecture

M6.44 and M6.45 established the current general rule:

> **Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer is neither.**

General finite domain:

```text
0 <= s <= L
```

General open forms:

```text
RasterPath
GuidePath
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

Core does not manufacture the final-to-first segment.

Out-of-range source chainage is not silently wrapped.

Explicit `Cyclic*` adapters remain available for a deliberate topology choice, but are not the ordinary LINEAR/BRANCHING model.

---

## 6. Point-to-point / BRANCHING architecture

The current default browser fixture is BRANCHING.

Current route structure:

```text
STAGE_1
  +-> STAGE_2_L -> STAGE_3_L -> STAGE_4_L_FORK
  |                              +-> GOAL_LA
  |                              `-> GOAL_LB
  `-> STAGE_2_R -> STAGE_3_R -> STAGE_4_R_FORK
                                 +-> GOAL_RA
                                 `-> GOAL_RB
```

The RouteDag remains acyclic.

A route transition is:

```text
physical route gate
-> validated RouteDag transition
-> PENDING
-> source chart/content remain active
-> forward physical handoff seam
-> COMMIT target chart/content
```

COMMIT does not alter world pose, yaw or velocity.

A terminal-stage entry is not automatically a finish. A physical FINISH gate still owns finish validation.

### Shared branch rule

Current BRANCHING DEV/product rule:

```text
routeKind               = BRANCHING
rivalCount              = 1
sharedRouteChoiceMode   = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy   = RECOVER_TO_LOCKED_BRANCH
```

The first actor to **physically** cross one sibling branch gate locks the field to that choice.

AI route intent may steer toward a branch but cannot select it.

A later losing-sibling physical crossing is surfaced as a branch violation; it does not advance RouteDag and recovers toward the locked legal branch.

---

## 7. M6.51 Pages branching hotfix — immediately preceding incident

This handoff follows PR #70, which fixed a real freeze in the public BRANCHING fixture.

Do not lose this context because it demonstrates how the runtime should be debugged.

### User-visible symptom

- displayed milestone appeared as M6.47 even though source/deployment was M6.51;
- following the leading rival through the visible branch allowed passage;
- after driving a short distance, the whole game appeared to stop.

### Actual deployed-artifact root cause

The deployed M6.51 artifact was downloaded and inspected directly. The problem was **not** dismissed as browser cache.

The causal chain was:

1. one DEV rival starts ahead of player at parent `s=95` and plans RIGHT-B;
2. the old first physical route gate was at `s=545`;
3. at the rival's crossing, its local lateral coordinate was approximately `+3.32 m`;
4. the RIGHT gate accepted approximately `+4.0..+11.0 m`;
5. the rival therefore looked committed to RIGHT but physically missed the route gate by about `0.68 m`;
6. RouteDag correctly stayed on STAGE_1;
7. the rival kept driving on the ordinary open parent Guide;
8. near parent `s≈656.4`, old 100 m AI lookahead sampled beyond parent Guide endpoint `L≈766.054`;
9. `RangeError` escaped the animation frame and the browser loop stopped.

The stale M6.47 label was a separate hardcoded HUD label in the deployed M6.51 bundle.

### Fix that is now part of the baseline

- first physical route gate moved `545 m -> 570 m`;
- handoff seam remains `600 m`;
- one-rival fixture remains; the bug was not hidden by removing the rival;
- `FIRST_PHYSICAL_CROSSING_LOCKS` remains;
- route selection remains physical-gate authority;
- AI lookahead is clipped to the finite open Guide endpoint instead of wrapping;
- HUD milestone updated to M6.51;
- milestone-label synchronization regression added.

At the new gate, the actual rival crosses physically inside the RIGHT road around `l≈+7.9 m`.

### Direct incident regressions

The baseline includes tests equivalent to:

```text
open Guide rival lookahead never samples beyond the endpoint
actual Pages rival physically takes RIGHT first fork, commits child runtime and keeps driving
visible Pages milestone labels match the package milestone
```

The continuous rival regression uses the real Pages rival start and ordinary 60 Hz M5 car physics, and requires RIGHT physical acceptance, commit to `CONTENT_STAGE_2_R`, then continued child-stage driving beyond the previous failure region.

---

## 8. CIRCUIT architecture now available in live browser runtime

M6.48–M6.51 deliberately add CIRCUIT **above** the open engine rather than converting Core back to cyclic geometry.

### M6.48 — explicit topology

One lap is an ordinary open Raster path whose final authored vertex explicitly returns to the first world point.

There is no hidden Core last-to-first segment.

`CircuitTopology` owns unwrapped/topological chainage concepts.

### M6.49 — finite runtime window

Circuit topology and one-lap sources are unfolded into a finite ordinary open runtime window.

Lower consumers see a long open course.

Height, visual, surface and GroundMap runtime views share that same finite ruler.

### M6.50 — physical race progress

Race lap authority is not winding.

A lap requires:

```text
ordered required physical checkpoints
+ forward physical FINISH
```

For `N` scored laps:

```text
runtime copies >= N + 1
```

The extra copy is unscored runout/lookahead, making the final scored FINISH an ordinary internal seam rather than a special open endpoint.

### M6.51 — live integration

No new live circuit-position tracker was needed.

The finite unfolded Guide is already the live ruler. Existing vehicle state:

```text
course.s
course.l
course.segmentIndex
```

and its local Guide search naturally move from one repeated copy to the next adjacent copy.

Therefore:

```text
vehicle.course.s == s_window
```

for live CIRCUIT driving.

Existing car/bike physics, M5 camera and M5 renderer are reused directly.

There is no:

```text
renderer circuit branch
camera circuit branch
physics modulo
physics winding counter
seam snap
separate circuit road renderer
```

### Current CIRCUIT DEV composition

Browser entry:

```text
/?mode=circuit
```

Current fixture:

```text
routeKind      = CIRCUIT
rivalCount     = 0
lapCount       = 3
checkpoints    = 1/4 L, 1/2 L, 3/4 L
runtime copies = 4
```

This is a DEV integration fixture, not final production content or calibrated handling.

---

## 9. Browser composition roots

Current top-level browser files:

```text
src/main.ts          BRANCHING
src/main-circuit.ts  CIRCUIT
```

Boot behavior:

```text
/              -> BRANCHING
/?mode=circuit -> CIRCUIT
```

The selection occurs once at the composition root.

Lower engine paths should remain ordinary topology-neutral consumers rather than receiving repeated `routeKind`/CIRCUIT branches.

---

## 10. Important current source files

### Frozen/general core

```text
src/core/course.ts
src/core/guide-curve.ts
src/core/guide-coordinate-frame.ts
src/core/projection.ts
src/core/presentation-scale.ts
```

### Road / source / rendering

```text
src/road/terrain-line.ts
src/physics/surface-map.ts
src/visual/height-profile.ts
src/visual/visual-profile.ts
src/visual/baked-ground-map.ts
src/render/m5-renderer.ts
```

### Point-to-point route runtime

```text
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-handoff.ts
src/gameplay/shared-route-choice-authority.ts
src/gameplay/branch-violation.ts
src/runtime/live-route-traveler.ts
src/runtime/live-route-multi-actor-tick.ts
src/runtime/live-route-runtime.ts
src/dev/m6-27-live-route-runtime.ts
src/dev/m6-40-rival-live-route.ts
```

### CIRCUIT

```text
src/gameplay/circuit-topology.ts
src/runtime/circuit-runtime-window.ts
src/runtime/circuit-live-runtime.ts
src/gameplay/physical-race-gate.ts
src/gameplay/ordered-race-progress.ts
src/gameplay/circuit-race-progress.ts
src/gameplay/race-session.ts
src/dev/m6-51-circuit-live-runtime.ts
```

### Browser

```text
src/main.ts
src/main-circuit.ts
index.html
.github/workflows/pages.yml
```

### Most important recent regressions

```text
tests/m6-46-branch-violation-recovery.test.mjs
tests/m6-47-open-parent-stage-integration.test.mjs
tests/m6-48-explicit-circuit-topology.test.mjs
tests/m6-49-circuit-runtime-window.test.mjs
tests/m6-50-circuit-race-progress.test.mjs
tests/m6-50-circuit-race-session.test.mjs
tests/m6-51-circuit-live-runtime.test.mjs
```

The hotfix also added incident-focused BRANCHING/Pages regressions. Search by the exact test names recorded in `M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt` rather than guessing file ownership.

---

## 11. CI and release workflow

Workflow:

```text
.github/workflows/pages.yml
name: Test and Deploy GitHub Pages
```

It runs on PRs and main pushes.

Release discipline is strict:

```text
feature/hotfix branch
-> PR
-> complete green CI on exact feature head
-> validation artifact/document if required
-> complete green CI again on validation-inclusive exact head
-> re-fetch main
-> require pure fast-forward relation
-> update main with force=false to exactly validated SHA
-> verify main == validated SHA
-> verify PR merge SHA == validated SHA
-> verify main-push build/deploy
```

The workflow explicitly checks out:

```text
${{ github.event.pull_request.head.sha || github.sha }}
```

and verifies actual checkout SHA equals expected SHA before building.

Pages staging copies the complete compiled `dist` under:

```text
_site/build/<GITHUB_SHA>/
```

and writes:

```text
_site/version.txt
```

The commit-versioned ESM path is the browser cache-coherency authority.

A legacy `_site/dist` copy remains as fallback for already-cached older index files; do not mistake that compatibility path for the primary build authority.

Current recurring workflow warning:

- some GitHub actions currently target the deprecated Node20 action runtime and are forced by the runner onto Node24;
- project Node setup itself remains Node `20.20.2`, npm `10.8.2` in the last verified workflow;
- this warning is workflow maintenance, not a current game-correctness failure.

Do not silently change project runtime or workflow actions while working on unrelated gameplay without a scoped reason and full validation.

---

## 12. Test status at takeover

The pre-handoff game baseline has:

```text
431 tests
431 pass
0 fail
```

Recent history:

```text
M6.44  369
M6.45  375
M6.46  382
M6.47  389
M6.48  396
M6.49  406
M6.50  420
M6.51  428
M6.51 Pages branching hotfix 431
```

Do not infer health from test count alone. The exact SHA and exact-checkout CI evidence matter.

---

## 13. Known unresolved / deliberately deferred items

### 13.1 Vehicle handling calibration

Status remains:

```text
DEV_UNCALIBRATED
```

Do not freeze the current handling numbers as product truth merely because regression telemetry exists.

Vehicle-to-vehicle collision remains deferred until handling/body dynamics are more settled.

### 13.2 Later second-fork recovery investigation lead

While debugging PR #70, an **over-scoped exploratory continuous route simulation** was temporarily extended far beyond the reported first-fork freeze.

That exploratory run exposed a possible later issue around the second physical fork / recovery path.

Important status:

- it was **not** the cause of the reported first-fork freeze;
- it was intentionally removed from PR #70 scope so the hotfix regression would test only the proven causal chain;
- it has not yet been reduced to a minimal accepted reproduction in the repository;
- therefore treat this as an **investigation lead**, not as permission to patch recovery speculatively.

Recommended future approach:

1. reproduce the later issue from current `main` using real runtime composition and deterministic physics;
2. identify exact actor/stage/choice/lock/recovery state at failure;
3. determine whether it is a genuine product bug, a DEV AI-plan limitation, or an invalid exploratory test assumption;
4. only then define the smallest milestone/hotfix.

Do not widen route gates, disable recovery, remove the rival or add a route special case without that causal proof.

### 13.3 CIRCUIT is live but still DEV content

The CIRCUIT architecture is validated through live browser integration, but current circuit content is deliberately minimal:

- solo;
- 3 laps;
- reused stadium source;
- no final rival/race-product design;
- handling still uncalibrated.

Do not mistake a working architecture fixture for final product content.

---

## 14. Things a future agent must not "simplify" away

The following apparent complexity is deliberate authority separation, not accidental boilerplate:

- world physics vs Guide/raster coordinates;
- physical gate vs AI route intent;
- PENDING vs COMMIT;
- route stage entry vs FINISH;
- topological winding vs validated race lap;
- open Core vs explicit circuit topology;
- GroundMap visual semantics vs SurfaceMap physical semantics;
- composition-root mode selection vs lower-engine topology blindness;
- exact-head CI vs merely green PR status;
- validation-inclusive head vs earlier code-green checkpoint.

If refactoring makes any pair above collapse into one implicit state, assume the refactor is wrong until proven otherwise.

---

## 15. First Codex task — mandatory read-only takeover audit

The first Codex session should **not implement a new milestone immediately**.

Use a prompt equivalent to:

```text
Read AGENTS.md completely.
Read README.md.
Read docs/00_core_design_freeze.md and addenda 00a/00b/00c.
Read docs/62 through docs/69 for M6.44-M6.51.
Read docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md.
Read M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt.

Confirm current main HEAD and compare it with the handoff/release validation state.
Run npm install and npm test.

Reconstruct the current architecture from the repository itself.
Audit the handoff against source, tests and current docs.
Identify any stale/contradictory documentation, hidden cyclic assumptions, duplicate authority, or untested live-runtime boundary.

Do not modify code or documentation in this first task.
Do not create a branch or PR.
Return only:
1. takeover verification,
2. architecture summary,
3. discrepancies/risks,
4. ranked next-milestone candidates.
```

The goal is to prove Codex can reconstruct the project from repository authority without relying on the previous ChatGPT conversation.

---

## 16. What happens after the audit

After the read-only takeover audit is reviewed and accepted, future Codex work should follow `AGENTS.md` exactly:

```text
inspect current main
-> define smallest coherent milestone
-> feature branch
-> implementation
-> regressions
-> PR
-> exact-head CI
-> validation-inclusive exact-head CI
-> re-check main fast-forward relation
-> force=false fast-forward
-> verify main / PR exact SHA identity
-> verify main-push Pages workflow
```

The previous ChatGPT thread is no longer required as project memory once this handoff package is merged and validated.

---

## 17. Final handoff principle

The intended long-term structure is:

```text
AGENTS.md
    = persistent agent/development contract

Core Freeze + addenda
    = normative frozen mathematics/architecture

numbered milestone docs
    = scoped later design decisions

types + tests
    = executable implementation contract

this handoff
    = takeover snapshot and known-state map

README
    = human/agent entry point
```

Avoid duplicating the full design in future handoffs.

A future handoff should record only what changed since the previous snapshot, the new exact baseline/release evidence, newly known issues, and the correct reading order.
