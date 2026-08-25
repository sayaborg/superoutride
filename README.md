# SUPER OUTRIDE — M6.51

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core. Open is the general runtime model.**

## Development entry point

Before modifying this repository, read in this order:

1. `AGENTS.md` — persistent coding-agent/development contract.
2. `docs/00_core_design_freeze.md` — frozen renderer/core mathematics.
3. `docs/00a_core_design_freeze_addendum_m5_2.md` — fixed metric sprite authority.
4. `docs/00b_core_design_freeze_addendum_m6_44.md` — open path authority.
5. `docs/00c_core_design_freeze_addendum_m6_45.md` — open source-profile authority.
6. Relevant numbered milestone documents under `docs/`.
7. `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md` — current Codex takeover snapshot and known-state map.

`README.md` is intentionally an entry/index, not a second normative design document.

The repository, not a previous chat transcript, is the continuing project memory.

## Current validated game baseline

The last runtime implementation before the Codex-handoff documentation package is:

```text
main game baseline SHA:
6e15c374ba6679eec16b589c68941154c67665fd

package:
super-outride-m6-51@0.6.51

tests:
431 / 431 pass / 0 fail

latest runtime PR:
#70 M6.51 Pages branching continuation hotfix

Pages main-push workflow:
#496 / build success / deploy success
```

The final repository SHA after merging the documentation-only Codex handoff will be newer than this game baseline. See the handoff/validation record and current `main` for the actual takeover release head.

## Current milestone state

```text
M0–M5     browser / geometry / visual / driving foundations      complete
M6.0–43   race progress / route / runtime / rival foundations    complete
M6.44      Open Path Core                                        complete
M6.45      Open Source Profiles                                  complete
M6.46      Branch Violation Recovery                             complete
M6.47      Open Parent Stage Integration                         complete
M6.48      Explicit Circuit Topology Foundation                  complete
M6.49      Circuit Runtime Window Integration                    complete
M6.50      Circuit Race Progress                                 complete
M6.51      Circuit Live Runtime Integration                      complete
M6.51      Pages branching continuation hotfix                   complete
```

Detailed authority for M6.44–M6.51:

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

The immediately preceding public Pages incident/fix is recorded in:

```text
M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt
```

## Run / test

```bash
npm install
npm run build
python3 -m http.server 8000
```

Default BRANCHING live fixture:

```text
http://localhost:8000/
```

Three-lap CIRCUIT live fixture:

```text
http://localhost:8000/?mode=circuit
```

The query parameter selects only the top-level browser composition. Lower engine layers do not receive a distributed CIRCUIT/route-kind renderer mode.

Full regression:

```bash
npm test
```

Regression history:

```text
M6.43  359 tests
M6.44  369 tests after post-merge hardening
M6.45  375 tests
M6.46  382 tests
M6.47  389 tests
M6.48  396 tests
M6.49  406 tests
M6.50  420 tests
M6.51  428 tests
M6.51 Pages branching hotfix 431 tests
```

## Core architecture in one page

### Renderer

```text
d = s_render - s_camera
```

World X/Y/Z is vehicle-physics authority. One chainage maps to one horizontal scanline. Same depth means same scale; same depth plus same height means same screen Y.

Road geometry remains Raster Segment geometry with an interior turn hard limit of `<= 10 degrees`. Guide geometry is coordinate/camera support only. Terrain and World Sprites share a single far-to-near Painter.

No z-buffer, polygon-road conversion, perspective-correct road mapping, arbitrary runtime sprite rotation or alpha blending is introduced.

### Fixed metric presentation

```text
player car physical width = 2.0 m
player car source width   = 80 px
player-depth scale        = 40 px/m
f                         = 200 px
D_cam                     = 5.0 m
D_cam                     = f / 40
```

There is no arbitrary sprite `visualScale` authority.

### General topology/source rule

```text
0 <= s <= L
```

General geometry/source forms are open. Core does not manufacture a last-to-first segment.

> **Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer is neither.**

### Point-to-point route rule

```text
physical route gate
-> validated RouteDag transition
-> PENDING
-> forward physical handoff seam
-> COMMIT target chart/content
```

World pose/yaw/velocity remain continuous through COMMIT. Terminal-stage entry is not FINISH; a physical FINISH gate is still required.

Current BRANCHING field rule:

```text
rivalCount              = 1
sharedRouteChoiceMode   = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy   = RECOVER_TO_LOCKED_BRANCH
```

### CIRCUIT rule

CIRCUIT is composed above open Core:

```text
explicit closed-lap authoring
-> CircuitTopology
-> finite ordinary open runtime window
-> ordinary car/bike physics + camera + renderer
-> ordered physical checkpoints + forward FINISH
-> validated lap race
```

Topological winding is not validated race-lap authority.

For `N` scored laps, runtime provides at least `N + 1` finite copies so the final scored FINISH is still an ordinary internal seam with runout/lookahead.

## Browser composition roots

```text
src/main.ts          BRANCHING
src/main-circuit.ts  CIRCUIT
```

Boot selection occurs only at the composition root:

```text
/              -> BRANCHING
/?mode=circuit -> CIRCUIT
```

## Current important files

```text
AGENTS.md
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md

src/core/course.ts
src/core/guide-curve.ts
src/core/guide-coordinate-frame.ts
src/core/projection.ts
src/road/terrain-line.ts
src/physics/surface-map.ts
src/render/m5-renderer.ts

src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-handoff.ts
src/gameplay/shared-route-choice-authority.ts
src/gameplay/branch-violation.ts
src/runtime/live-route-traveler.ts
src/runtime/live-route-multi-actor-tick.ts

src/gameplay/circuit-topology.ts
src/runtime/circuit-runtime-window.ts
src/runtime/circuit-live-runtime.ts
src/gameplay/physical-race-gate.ts
src/gameplay/ordered-race-progress.ts
src/gameplay/circuit-race-progress.ts

src/main.ts
src/main-circuit.ts
.github/workflows/pages.yml
```

## Release discipline

The release contract is defined in `AGENTS.md`. In short:

```text
feature branch
-> PR
-> exact-head full green CI
-> validation-inclusive exact-head full green CI
-> confirm current main is the original fast-forward base
-> force=false fast-forward main to that exact validated SHA
-> verify main == PR head == PR merge SHA
-> verify main-push Pages workflow
```

Do not merge an unvalidated SHA or create an extra merge commit as the released `main` state.
