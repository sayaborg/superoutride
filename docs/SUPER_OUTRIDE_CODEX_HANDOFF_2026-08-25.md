# SUPER OUTRIDE — Codex Migration Authority Freeze — 2026-08-25

## 0. Status

The Codex takeover audit requested by the original 2026-08-25 handoff has been completed. The repository was then normalized through cleanup PRs #72, #73 and #74.

This file is now the **final concise migration checkpoint**. It replaces the earlier long-form takeover snapshot at this path. Git history preserves that original snapshot; do not duplicate it into another giant handoff.

This file is not normative game-design authority. The repository authority chain below remains controlling.

---

## 1. Exact repository baseline entering this freeze

```text
repository:
  sayaborg/superoutride

main SHA before PR-C:
  72f63cd19c68522da52094d6eef29499865690fc

package:
  super-outride-m6-51@0.6.51

tests:
  433 / 433 pass / 0 fail / 0 skipped

latest completed cleanup PR:
  #74 Normalize source module boundaries

main-push Pages workflow:
  #580
  run id 32853385557
  head SHA 72f63cd19c68522da52094d6eef29499865690fc
  build success
  deploy success
```

The last runtime-changing baseline remains:

```text
6e15c374ba6679eec16b589c68941154c67665fd
PR #70 M6.51 Pages branching continuation hotfix
431 / 431 tests
```

Everything from PR #71 through PR-B/#74 is takeover, repository organization, documentation authority, or behavior-preserving source-boundary cleanup. The final PR-C release SHA will be newer than `72f63cd...`; establish that exact released identity from PR-C validation evidence and Git history rather than editing this file into a self-referential SHA loop.

---

## 2. Reading order and authority

For a fresh coding-agent context, read in this order:

1. `AGENTS.md` — persistent development/release contract and explicit prohibitions.
2. `README.md` — current repository entry point and status index.
3. `docs/README.md` — documentation authority/supersession and validation-evidence policy.
4. Core Freeze and addenda:
   - `docs/00_core_design_freeze.md`
   - `docs/00a_core_design_freeze_addendum_m5_2.md`
   - `docs/00b_core_design_freeze_addendum_m6_44.md`
   - `docs/00c_core_design_freeze_addendum_m6_45.md`
5. Relevant numbered milestone documents. For current topology/runtime work, start with `docs/62_...` through `docs/69_...`.
6. Relevant types, compilers and regression tests — executable implementation contract.
7. This handoff — migration baseline and deferred-work map only.

Authority classes are intentionally separate:

```text
AGENTS.md
  persistent agent/development/release contract

Core Freeze + explicit addenda
  normative frozen mathematics and architectural invariants

numbered milestone documents
  chronological/scoped later design decisions

types + compilers + regression tests
  executable implementation contract

docs/validation/
  immutable historical CI/release/incident evidence

README.md / this handoff
  navigation and current-state context; not replacement design authority
```

If two sources appear inconsistent, identify which source owns the topic and whether a later explicit authority superseded the older statement. Do not silently merge assumptions.

---

## 3. Cleanup completed before Codex migration freeze

### PR #72 — repository prune

- stopped tracking generated `dist/`;
- added generated/local artifacts to `.gitignore`;
- removed the obsolete pre-Codex handoff and unreferenced preview images;
- retained numbered design documents and validation evidence.

### PR #73 — documentation/evidence authority

- moved historical validation artifacts under `docs/validation/`;
- added `docs/README.md` as the authority/supersession index;
- added `docs/validation/README.md` as immutable evidence policy;
- preserved historical milestone statements while annotating explicit later supersession.

### PR #74 — source module boundaries

Current placement authority includes:

```text
production camera:
  src/camera/m5-camera.ts

shared vehicle kinematic contract:
  src/physics/vehicle-state.ts

general SurfaceMap:
  src/physics/surface-map.ts

DEV/debug authorities:
  src/dev/debug-course.ts
  src/dev/m3-debug-visual.ts
  src/dev/m4-debug-world.ts
  src/dev/m5-debug-surface-map.ts
```

Old authority paths have no compatibility re-export shims. `tests/source-boundary-normalization.test.mjs` mechanically prevents general `src/*` layers from importing `src/dev` and verifies the retired authority paths remain absent.

No renderer algorithm, physics tuning, route topology, camera behavior or Pages composition was intentionally changed by PR-B.

---

## 4. Current architecture in one rule set

Do not reconstruct the full design from this handoff. The minimum orientation is:

```text
world X/Y/Z
  = vehicle physics authority

d = s_render - s_camera
  = renderer pseudo-depth authority

Open
  = general geometry/source/runtime model

Cyclic
  = explicit upper-level topology choice

Renderer
  = topology-blind raster consumer
```

At player pseudo-depth:

```text
2.0 m = 80 px
1.0 m = 40 px
f = 200 px
D_cam = 5.0 m
D_cam = f / 40
```

Point-to-point route changes remain:

```text
physical route-gate crossing
-> validated RouteDag transition
-> PENDING
-> forward physical handoff seam
-> COMMIT chart/content
```

CIRCUIT remains explicit topology unfolded into a finite ordinary open runtime window. Validated race laps come from ordered physical checkpoints plus forward FINISH, not winding.

For details, use the authority documents and tests rather than expanding this handoff.

---

## 5. Unresolved / deliberately deferred work

### 5.1 Vehicle handling calibration

```text
DEV_UNCALIBRATED
```

Current handling numbers are scaffolding, not product truth. Vehicle-to-vehicle collision remains deferred until handling/body dynamics are sufficiently settled.

### 5.2 Second-fork / recovery investigation lead

During the PR #70 investigation, an over-scoped exploratory run suggested a possible later second-fork/recovery issue. Its status remains **investigation lead, not validated product bug**.

Before changing recovery, gates, or AI:

1. reproduce from current `main` with real runtime composition and deterministic physics;
2. identify exact actor/stage/choice/lock/recovery state;
3. classify whether the problem is product behavior, DEV AI limitation, or an invalid exploratory assumption;
4. only then define the smallest fix/milestone and regression.

Do not widen gates, remove the rival, disable recovery, or add route special cases without causal proof.

### 5.3 CIRCUIT content remains a DEV integration fixture

Architecture is live and validated, but current circuit content is still minimal: solo, three laps, reused stadium source, no final rival/race-product design, and uncalibrated handling.

### 5.4 Workflow maintenance warning

The project test runtime remains Node 20, while GitHub-hosted action internals emit a Node20-action-runtime deprecation warning and may be forced by the runner onto a newer action runtime. This is maintenance debt, not a current game-correctness failure. Do not change workflow/runtime versions incidentally inside unrelated gameplay work.

---

## 6. Prohibitions that must survive migration

`AGENTS.md` is the full authority. In particular, do not:

- make open Raster/Guide/source data implicitly cyclic;
- add topology/modulo/winding to renderer pseudo-depth;
- infer physical route choice from AI intent or steering;
- teleport/rewrite world state at stage handoff;
- collapse topological winding into validated race laps;
- introduce a separate CIRCUIT renderer/physics/camera path when finite open composition suffices;
- reintroduce general `src/* -> src/dev` dependencies;
- recreate retired authority paths as compatibility shims;
- hide runtime failures by deleting a rival/feature instead of proving the cause;
- merge or release a SHA that did not itself receive the required complete green CI;
- force-update `main` as normal release procedure.

---

## 7. Exact-head development and release workflow

For any future implementation or documentation release:

```text
inspect exact current main
-> create dedicated branch from that exact SHA
-> implement smallest coherent scope
-> full PR CI on exact feature head
-> add validation evidence when required
-> full CI again on validation-inclusive exact head
-> re-fetch main
-> require ahead_by > 0, behind_by = 0, merge base = current main
-> force=false fast-forward main to the validated exact SHA
-> verify main == PR head == PR merge SHA
-> verify main-push build/deploy on that same SHA
```

GitHub Actions exact checkout is release evidence. A green run for an earlier commit does not validate a later documentation or validation-artifact commit.

---

## 8. Migration completion state

The mandatory read-only Codex takeover audit from the original handoff has been completed and consumed by PR-C. A future session does **not** need to repeat that one-time migration ceremony merely because it reads this file.

A fresh session must still:

1. read the authority chain above;
2. confirm current `main` and package;
3. run the complete suite before modifying code;
4. inspect the relevant source/tests for the proposed task;
5. preserve the release discipline in `AGENTS.md`.

No next gameplay milestone is forced by this handoff. Select the smallest coherent next task from current repository evidence and explicit user direction.

The repository, not a previous chat transcript, is the continuing project memory.
