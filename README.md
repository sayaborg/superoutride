# SUPER OUTRIDE — M6.51

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core. Open is the general runtime model.**

`README.md` is an entry point and current-state index. It is not a second normative design document.

## Development entry point

Before modifying this repository, read in this order:

1. `AGENTS.md` — persistent coding-agent/development/release contract.
2. `README.md` — this current-state index.
3. `docs/README.md` — documentation authority, supersession and validation-evidence policy.
4. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer/metric/open-model authority.
5. Relevant numbered milestone documents under `docs/`; for current topology/runtime start with `docs/62_...` through `docs/69_...`.
6. Relevant source/types/compilers and regression tests — executable implementation contract.
7. `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md` — final concise Codex migration checkpoint and deferred-work map.

The repository, not a previous chat transcript, is the continuing project memory.

## Current validated repository baseline before PR-C

```text
main SHA:
72f63cd19c68522da52094d6eef29499865690fc

package:
super-outride-m6-51@0.6.51

tests:
433 / 433 pass / 0 fail / 0 skipped

latest completed cleanup PR:
#74 Normalize source module boundaries

Pages main-push workflow:
#580 / build success / deploy success
```

The final PR-C release SHA will be newer because PR-C is documentation/authority-freeze work. Exact released identity belongs to PR-C validation evidence and Git history rather than a self-referential README edit.

The last runtime-changing baseline remains:

```text
6e15c374ba6679eec16b589c68941154c67665fd
PR #70 M6.51 Pages branching continuation hotfix
431 / 431 tests
```

PRs #71–#74 changed takeover documentation, repository organization, documentation/evidence authority, and behavior-preserving source placement; they did not intentionally change gameplay/runtime algorithms or tuning.

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

Current topology/runtime design sequence:

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

The M6.51 public Pages branching incident/fix is historical evidence at:

```text
docs/validation/M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt
```

Historical validation evidence under `docs/validation/` is evidence, not current design authority.

## Run / test

```bash
npm install
npm run build
python3 -m http.server 8000
```

Default BRANCHING fixture:

```text
http://localhost:8000/
```

Three-lap CIRCUIT DEV fixture:

```text
http://localhost:8000/?mode=circuit
```

The query parameter selects only the top-level browser composition. Lower engine layers remain topology-neutral ordinary consumers.

Full regression:

```bash
npm test
```

Current package:

```text
super-outride-m6-51@0.6.51
```

Vehicle handling status remains:

```text
DEV_UNCALIBRATED
```

## Current composition and source-placement landmarks

```text
src/main.ts          BRANCHING composition root
src/main-circuit.ts  CIRCUIT composition root

src/camera/m5-camera.ts          production M5 camera authority
src/physics/vehicle-state.ts     shared vehicle kinematic contract
src/physics/surface-map.ts       general SurfaceMap authority

src/dev/debug-course.ts
src/dev/m3-debug-visual.ts
src/dev/m4-debug-world.ts
src/dev/m5-debug-surface-map.ts  DEV/debug fixture authorities
```

General source layers must not depend on `src/dev`. Retired authority paths must not be recreated as compatibility shims; regression coverage enforces both rules.

## Core orientation

The minimum orientation is:

```text
world X/Y/Z = vehicle physics authority

d = s_render - s_camera
  = renderer pseudo-depth authority

Open   = general data/runtime model
Cyclic = explicit upper-level topology choice
Renderer = topology-blind

player-depth presentation:
2.0 m = 80 px
1.0 m = 40 px
f = 200 px
D_cam = 5.0 m = f / 40
```

Do not use this summary to replace the Core Freeze/addenda or executable tests.

## Release discipline

The full release contract is in `AGENTS.md`:

```text
exact main
-> dedicated branch
-> PR exact-head full green CI
-> validation-inclusive exact-head full green CI
-> pure fast-forward check
-> force=false main update to validated SHA
-> verify main == PR head == PR merge SHA
-> verify main-push build/deploy
```

Do not release an unvalidated SHA or create an extra merge commit as the released `main` state.
