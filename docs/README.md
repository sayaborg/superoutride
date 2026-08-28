# SUPER OUTRIDE Documentation Authority

This directory contains current normative authority, chronological milestone records, takeover context, and historical validation evidence. Those are intentionally different document classes.

## 1. Normative frozen authority

The current frozen renderer/core authority is the Core Freeze plus its explicit addenda:

```text
00_core_design_freeze.md
00a_core_design_freeze_addendum_m5_2.md
00b_core_design_freeze_addendum_m6_44.md
00c_core_design_freeze_addendum_m6_45.md
```

The current vehicle-physics architecture authority is:

```text
78_m8_0_phase9_vehicle_physics_architecture_freeze.md
```

It explicitly supersedes conflicting vehicle-physics architecture decisions in M7.0/M7.3/M7.4 while leaving those earlier milestone documents intact as historical records.

## 2. Numbered milestone documents

`01_...` through `79_...` are chronological milestone records. They describe the authority and implementation boundary that existed at each milestone.

They are historical snapshots, not a flat set of simultaneously current specifications. A later milestone/addendum may supersede a scoped assumption in an earlier document without making the earlier document incorrect as history.

Do not rewrite historical milestone prose merely to use current terminology. Resolve apparent conflicts by following the later explicit authority.

The most important current topology/runtime/physics sequence is:

```text
62_m6_44_open_path_core.md
63_m6_45_open_source_profiles.md
64_m6_46_branch_violation_recovery.md
65_m6_47_open_parent_stage_integration.md
66_m6_48_explicit_circuit_topology.md
67_m6_49_circuit_runtime_window.md
68_m6_50_circuit_race_progress.md
69_m6_51_circuit_live_runtime.md
70_m6_52_field_route_progress.md
71_m6_53_branching_session_normalization.md
72_m6_54_circuit_multi_actor_integration.md
73_m7_0_vehicle_dynamics_architecture_freeze.md
74_m7_1_highway_calibration_course_authoring.md
75_m7_2_default_branching_highway_integration.md
76_m7_3_grip_and_instrument_hud.md
77_m7_4_transient_tire_response.md
78_m8_0_phase9_vehicle_physics_architecture_freeze.md
79_m8_0_circuit_low_speed_corner_authoring.md
```

The current public CIRCUIT course geometry follow-on is `79_m8_0_circuit_low_speed_corner_authoring.md`.
It supersedes only the scoped all-high-speed/minimum-radius description in M7.1; it does not change
M8.0 vehicle-physics or frozen renderer/topology authority.

Current governing topology rule:

> Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer is neither.

Current governing vehicle-physics rule:

> World state is authoritative; Guide/contact/tire observations are derived; CAR and BIKE produce handling through the minimum ordinary mechanical chain rather than modes, hidden assists or duplicate state.

## 3. Known historical-value supersession

M6.17 records the first DEV route gate at approximately `s=545 m`, which was correct for that milestone. The M6.51 Pages branching-continuation hotfix later moved the live first physical route gate to `570 m`; the handoff seam remains `600 m`.

The historical M6.17 value is intentionally retained in its original sequence and annotated there. Incident evidence is:

```text
validation/M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt
```

## 4. Validation evidence

Historical CI/release evidence lives under:

```text
validation/
```

Validation files are immutable historical evidence, not current design authority. See `validation/README.md` before interpreting them.

Repository-cleanup validation records follow the same rule: they prove exact-head CI/release facts but do not become design authority.

The final Codex migration has two dedicated evidence records:

```text
validation/REPOSITORY_FINAL_CLEAN_ROOM_AUDIT_MANIFEST.txt
validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt
```

The first records the Step 7 repository-only audit findings before correction. The second records the self-reference-safe Step 8 final candidate and release contract. Exact final SHA/run identity is completed by Git/PR/main-ref and workflow history without rewriting an already-validated artifact.

The Codex-transfer audit for the active M8.0 candidate is:

```text
validation/M8_0_CODEX_TRANSFER_AUDIT_2026_08_28.txt
```

It records repository-only authority/navigation, structure/dependency, workflow/CI and temporary-ref hygiene findings for takeover. It is transfer evidence only: it is not design authority, not M8.0 completion evidence, and not release validation.

M8.0 completion/release evidence is:

```text
validation/M8_0_PHASE9_VEHICLE_PHYSICS_VALIDATION.txt
```

It records the green pre-validation candidate, executable Phase 9 acceptance matrix and self-reference-safe exact-head release procedure. Final SHA/run identity is supplied by Git/PR/main-ref/workflow history.

## 5. M8.0 implementation/finalization handoff

The M8.0 / Phase 9 implementation and finalization checkpoint is:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md
```

It records the audited main baseline, active branch/PR, migration history, non-reopen decisions and exact-head release contract. After release it remains historical finalization context, not current design authority.

A fresh Codex session should start from `../AGENTS.md`, then use this finalization handoff only when PR #88 lineage is relevant. The handoff is not a second vehicle-physics authority; `78_m8_0_phase9_vehicle_physics_architecture_freeze.md` owns the M8.0 architecture.

### Temporary handoff-preparation branch refs

The final transfer audit independently verified that these three temporary refs are exactly identical to implementation checkpoint `3adccfc94f2ab05ceaf07f233abe61f00114c3c9` (`ahead_by=0`, `behind_by=0`, no unique commits/files):

```text
feature/phase9-vehicle-physics-freeze-copy
feature/phase9-vehicle-physics-freeze-handoff
feature/phase9-vehicle-physics-freeze-handoff-check
```

A fourth accidental connector ref was created during the final transfer audit:

```text
noop-do-not-create
```

It is only a snapshot of active-branch commit `84dd46bcb4ca764570ce852a3d9803b129d1499b` immediately after the AGENTS navigation correction and contains no independently intended work. The active implementation branch remains exclusively:

```text
feature/phase9-vehicle-physics-freeze
```

All four temporary refs were verified at their recorded identities/ancestry and deleted during PR #88 completion. Their historical SHAs remain recorded in the transfer audit. Do not recreate, merge or continue work from them.

## 6. Codex migration handoff

The historical repository-migration handoff is:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md
```

The original long-form takeover snapshot at this path requested a mandatory first read-only Codex audit. That original audit and cleanup PRs #72-#75 were completed before the final clean-room freeze, but they are not themselves proof that the later Step 7-9 finalization completed.

The released FINAL CODEX MIGRATION POINT is established only after the final clean-room manifest is resolved, the final validation-inclusive exact head receives complete green CI, that exact head fast-forwards `main` with `force=false`, SHA identity is verified, and the same `main` SHA receives successful Pages build/deploy. The dedicated final validation record and Git/PR/workflow history are the evidence for that transition.

This migration handoff remains historical migration context. It does not replace M8.0 architecture authority, the PR #88 finalization record, or current task evidence.

Handoff documents are context/navigation snapshots. They do not override the Core Freeze/addenda, later milestone authority, types, compilers, or regression tests.

## 7. Repository-level documents

```text
../AGENTS.md  persistent agent/development/release contract
../README.md  repository entry point and current-state index
```

For a fresh coding context, start with the working rules in `../AGENTS.md` and use the M8.0 handoff above only when its PR lineage is relevant.

At and after the validated FINAL CODEX MIGRATION POINT, repository contents/history—not previous ChatGPT threads—are the continuing project memory.

If documents appear inconsistent, do not silently choose one. Identify which authority owns the topic and whether a later explicit authority superseded the older statement.
