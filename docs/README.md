# SUPER OUTRIDE Documentation Authority

This directory contains both current normative design authority and chronological milestone records. They are intentionally different kinds of documents.

## 1. Normative frozen authority

The current frozen renderer/core authority is the Core Freeze plus its explicit addenda:

```text
00_core_design_freeze.md
00a_core_design_freeze_addendum_m5_2.md
00b_core_design_freeze_addendum_m6_44.md
00c_core_design_freeze_addendum_m6_45.md
```

Later addenda supersede only the assumptions they explicitly replace. In particular, M6.44/M6.45 replace the old implicit cyclic geometry/source assumptions with the current open general model.

## 2. Numbered milestone documents

`01_...` through `69_...` are chronological milestone records. They describe the authority and implementation boundary that existed at that milestone.

They are historical snapshots, not a flat set of simultaneously current specifications. A later milestone/addendum may supersede a scoped assumption in an earlier document without making the earlier document incorrect as history.

Do not rewrite historical milestone prose merely to make it use current terminology. Instead, resolve apparent conflicts by following the later explicit authority.

The most important current topology/runtime sequence is:

```text
62_m6_44_open_path_core.md
63_m6_45_open_source_profiles.md
64_m6_46_branch_violation_recovery.md
65_m6_47_open_parent_stage_integration.md
66_m6_48_explicit_circuit_topology.md
67_m6_49_circuit_runtime_window.md
68_m6_50_circuit_race_progress.md
69_m6_51_circuit_live_runtime.md
```

Current governing rule:

> Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer is neither.

## 3. Known historical-value supersession

M6.17 records the first DEV route gate at approximately `s=545 m`, which was correct for that milestone. The M6.51 Pages branching-continuation hotfix later moved the live first physical route gate to `570 m`; the handoff seam remains `600 m`.

The historical M6.17 value is intentionally retained in its original sequence and annotated there. Current incident authority is:

```text
validation/M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt
```

## 4. Validation evidence

Historical CI/release evidence lives under:

```text
validation/
```

Validation files are immutable historical evidence, not current design authority. See `validation/README.md` before interpreting them.

## 5. Handoff documents

`SUPER_OUTRIDE_CODEX_HANDOFF_*.md` files are takeover snapshots. They may describe the exact repository state at a particular handoff date, but do not override the Core Freeze/addenda, later milestone authority, types, or regression tests.

## 6. Repository-level documents

```text
../AGENTS.md  persistent agent/development contract
../README.md  repository entry point and current-state index
```

If documents appear inconsistent, do not silently choose one. Identify which document owns the topic and whether a later explicit authority superseded the older statement.
