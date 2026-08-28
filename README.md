# SUPER OUTRIDE — M8.0 Phase 9 candidate

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core. Open is the general runtime model.**

`README.md` is an entry point and current-state index. It is not a second normative design document.

## Active development status

M8.0 / Phase 9 vehicle-physics replacement is currently under implementation and validation on:

```text
branch: feature/phase9-vehicle-physics-freeze
PR:     #88 — M8.0 Phase 9 vehicle physics architecture freeze
status: DRAFT / NOT RELEASED
```

The current normative vehicle-physics architecture is:

```text
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
```

The current active takeover checkpoint is:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md
```

That handoff records the exact audited main baseline, PR/branch identity, last exact implementation head tested in CI, current failure classification and the remaining path to release. It is navigation/current-work context, not a second design authority.

M8.0 must not be described as released until PR #88 has a validation-inclusive exact green head, `main` is moved to that exact head by the repository release contract, and the same main SHA passes the required main-push build/Pages verification.

## Development entry point

For the current PR #88 work, read in this order:

1. `AGENTS.md` — persistent coding-agent/development/release contract.
2. `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md` — active M8.0 continuation checkpoint.
3. `docs/README.md` — documentation authority, supersession and validation-evidence policy.
4. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer/metric/open-model authority.
5. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` — current vehicle-physics architecture authority.
6. Relevant source/types/compilers and regression tests — executable implementation contract.
7. PR #88 and its latest exact-head CI.

Historical migration context remains in `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md`, but it does not supersede the active M8.0 handoff.

At and after the validated FINAL CODEX MIGRATION POINT, the repository—not a previous ChatGPT/Codex transcript—is the continuing project memory.

## Codex migration freeze lineage

PR-C completed at this exact baseline:

```text
main SHA after PR-C:
3956c23c7209ec271b42ee4a98e5c9510919f19d

package:
super-outride-m6-51@0.6.51

tests:
433 / 433 pass / 0 fail / 0 skipped

PR-C:
#75 Freeze Codex migration authority
```

That SHA is the **PR-C completion baseline**, not the FINAL CODEX MIGRATION POINT. The later final clean-room audit, final validation-inclusive CI, pure fast-forward release and main-push Pages verification establish the final migration point.

The exact released final migration SHA belongs to:

```text
docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt
Git / PR / main-ref identity
main-push Pages workflow identity
```

rather than a self-referential README edit.

The last pre-M7 runtime-changing baseline recorded by the migration sequence remains:

```text
6e15c374ba6679eec16b589c68941154c67665fd
PR #70 M6.51 Pages branching continuation hotfix
431 / 431 tests
```

PRs #71–#75 changed takeover documentation, repository organization, documentation/evidence authority, behavior-preserving source placement and migration authority. They did not intentionally change gameplay/runtime algorithms or tuning.

## Current milestone state

```text
M0–M5      browser / geometry / visual / driving foundations      complete
M6.0–43    race progress / route / runtime / rival foundations    complete
M6.44      Open Path Core                                          complete
M6.45      Open Source Profiles                                    complete
M6.46      Branch Violation Recovery                               complete
M6.47      Open Parent Stage Integration                           complete
M6.48      Explicit Circuit Topology Foundation                    complete
M6.49      Circuit Runtime Window Integration                      complete
M6.50      Circuit Race Progress                                   complete
M6.51      Circuit Live Runtime Integration                        complete
M6.51      Pages branching continuation hotfix                     complete
M6.52      Shared Field Route Progress                              complete
M6.53      BRANCHING Session Authority Normalization                complete
M6.54      CIRCUIT Multi-Actor Integration                          complete
M7.0       Vehicle Dynamics Architecture Freeze                     historical / superseded in scoped physics by M8.0
M7.1       Highway Calibration Course Authoring                     complete
M7.2       Default BRANCHING Highway Integration                    complete
M7.3       Grip Calibration Pass 1 + Instrument HUD                 historical / scoped physics superseded by M8.0
M7.4       Transient Tire Response                                  historical / scoped physics superseded by M8.0
M8.0       Phase 9 Ideal Vehicle Physics Architecture               candidate / PR #88 / NOT RELEASED
```

Current topology/runtime/physics design sequence:

```text
docs/62_m6_44_open_path_core.md
docs/63_m6_45_open_source_profiles.md
docs/64_m6_46_branch_violation_recovery.md
docs/65_m6_47_open_parent_stage_integration.md
docs/66_m6_48_explicit_circuit_topology.md
docs/67_m6_49_circuit_runtime_window.md
docs/68_m6_50_circuit_race_progress.md
docs/69_m6_51_circuit_live_runtime.md
docs/70_m6_52_field_route_progress.md
docs/71_m6_53_branching_session_normalization.md
docs/72_m6_54_circuit_multi_actor_integration.md
docs/73_m7_0_vehicle_dynamics_architecture_freeze.md
docs/74_m7_1_highway_calibration_course_authoring.md
docs/75_m7_2_default_branching_highway_integration.md
docs/76_m7_3_grip_and_instrument_hud.md
docs/77_m7_4_transient_tire_response.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
```

Historical validation evidence under `docs/validation/` is evidence, not current design authority.

## Current M8.0 validation checkpoint

The audited `main` baseline for PR #88 is:

```text
dd2b35c6e2187770ba71d0a8a29a5ae65a9298b1
```

The last implementation head that received a complete build + regression run before the active handoff documentation commits is:

```text
3adccfc94f2ab05ceaf07f233abe61f00114c3c9
GitHub Actions run 33160399210
```

That exact run reached successful TypeScript/build compilation, then completed the regression suite with:

```text
449 tests
417 pass
32 fail
0 skipped
```

This is **not** a release result. The active handoff classifies the remaining failures into obsolete M7-test authority, tests mutating derived/getter-only observations, milestone/text assertions, and a real CAR suspension `qTravel`/profile issue that must be resolved causally rather than clamped.

Always inspect the current PR head and latest CI on takeover; the embedded tested SHA above is evidence for the checkpoint, not a self-referential current-head declaration.

## Final migration state

The original one-time takeover audit and cleanup PR-A/PR-B/PR-C are historical predecessors to the final repository migration freeze. They must not be confused with current M8.0 development.

The clean-room manifest is:

```text
docs/validation/REPOSITORY_FINAL_CLEAN_ROOM_AUDIT_MANIFEST.txt
```

The final migration release evidence is:

```text
docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt
```

Normal development proceeds under `AGENTS.md`; previous ChatGPT threads are not authority.

## Run / test

```bash
npm install
npm run build
npm test
python3 -m http.server 8000
```

Default BRANCHING fixture:

```text
http://localhost:8000/
```

CIRCUIT DEV fixture:

```text
http://localhost:8000/?mode=circuit
```

The query parameter selects only the top-level browser composition. Lower engine layers remain topology-neutral ordinary consumers.

Package/visible milestone metadata is part of the current M8.0 migration and must be synchronized deliberately before release. Do not infer release status from a temporary branch label.

Vehicle handling remains:

```text
DEV_UNCALIBRATED
```

## Current composition and source-placement landmarks

```text
src/main.ts          BRANCHING composition root
src/main-circuit.ts  CIRCUIT composition root

src/camera/m5-camera.ts            camera/presentation consumer
src/physics/automatic-powertrain.ts wheel-torque powertrain boundary
src/physics/tire-wheel.ts           M8.0 tire/wheel primitives
src/physics/vehicle-math3.ts        minimal quaternion/3D math
src/physics/vehicle-dynamics.ts     common M8.0 contact/surface/suspension observations
src/physics/car-physics.ts          M8.0 CAR solver
src/physics/motorcycle-physics.ts   M8.0 BIKE solver
src/physics/vehicle-contract.ts     read-only consumer contracts
src/physics/surface-map.ts         general SurfaceMap authority
```

`src/dev` is not a general runtime authority. General layers must not import it. The only non-DEV TypeScript files allowed to assemble DEV fixtures are the explicit top-level browser composition roots:

```text
src/main.ts
src/main-circuit.ts
```

`src/dev/**` may depend on ordinary general layers; that dependency direction must not be reversed. `tests/source-boundary-normalization.test.mjs` enforces the boundary.

Retired authority paths must not be recreated as compatibility shims merely to satisfy superseded tests.

## Core orientation

The minimum renderer/topology orientation remains:

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
-> verify main == PR head == validated SHA as required by the repository contract
-> verify main-push build/deploy on the same SHA
```

Do not release an unvalidated SHA, do not force `main`, and do not create compatibility authority merely to make an obsolete regression green.
