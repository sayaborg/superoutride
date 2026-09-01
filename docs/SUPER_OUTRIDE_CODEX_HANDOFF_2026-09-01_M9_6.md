# SUPER OUTRIDE — M9.6 Release Handoff

Status: current takeover checkpoint after the M9.6 FISCO release.

This file is navigation and continuation context only. It is not a second design authority, does
not supersede a numbered milestone, and must not be used instead of current source, compilers,
tests, Git/PR state or exact-head workflow evidence.

The repository—not a previous chat transcript—is the continuing project memory.

## 0. Minimal instruction for the next thread

A fresh thread can start with:

```text
Treat the current SUPER OUTRIDE repository as the only authority and continuation memory.

Read completely, in this order:
1. AGENTS.md
2. README.md
3. docs/README.md
4. docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md
5. the latest numbered authority documents relevant to the requested task
6. the related implementation, types, compilers and causal regression tests

Before changing anything, fetch and confirm local HEAD, origin/main, open PRs, exact latest CI and
public Pages version.txt. Do not implement on main. Do not repeat completed M9.2–M9.6 work or edit
historical validation evidence. Receive the next concrete product task from the user, apply the
AGENTS.md Architecture Decision Gate, then use a dedicated branch and the exact-head release
contract.
```

There is no partially implemented next feature hidden in this handoff. At handoff authoring, the
user has requested only preparation for continuation in a new thread. Do not infer or begin a new
vehicle, handling, course or renderer milestone until the new thread receives a concrete request.

## 1. Released exact checkpoint

Repository:

```text
/Users/harak/Documents/ChatGPT/super outride
```

Released M9.6 source checkpoint before this navigation-only handoff is added:

```text
7544d794c832bbe27c0df6492c5fc531533247d2
```

At the start of handoff authoring, all of these matched that SHA:

```text
local HEAD
origin/main
PR #110 head
PR #110 merge commit
GitHub Pages version.txt
```

The released checkpoint had a clean worktree and no open PR. This handoff was then authored on
`codex/m9-6-handoff`, created from that exact main SHA; the handoff's own release identity must be
resolved from current Git history after publication.

PR and release evidence:

```text
PR #110
https://github.com/sayaborg/superoutride/pull/110
state = MERGED

validation-inclusive PR workflow run = 33480490105
build job                         = 99768787724
expected/check-out head           = 7544d794c832bbe27c0df6492c5fc531533247d2
conclusion                        = success

main-push Pages workflow run      = 33480604342
build job                         = 99769145936
deploy job                        = 99769334770
head                              = 7544d794c832bbe27c0df6492c5fc531533247d2
build/deploy conclusion           = success/success
```

Public endpoints verified at that checkpoint:

```text
https://sayaborg.github.io/superoutride/version.txt
https://sayaborg.github.io/superoutride/?mode=fisco
```

The checked-in standalone release record is:

```text
docs/validation/M9_6_FISCO_CIRCUIT_VALIDATION.txt
```

That validation file is immutable evidence. Do not edit it to name this later handoff-document
commit or any future release. After this handoff is committed, resolve the current descendant SHA
from Git rather than expecting a self-reference in this file.

## 2. Current released product state

Package and visible milestone:

```text
super-outride-m9-6@0.9.6
SUPER OUTRIDE M9.6
vehicle handling status = DEV_UNCALIBRATED
```

Browser course selection is:

```text
1 / ?mode=linear    -> LINEAR
2 / ?mode=branching -> BRANCHING
3 / ?mode=circuit   -> CIRCUIT / TSUKUBA
4 / ?mode=fisco     -> CIRCUIT / FISCO
```

Course 4 is a functional simplified reconstruction of the current post-2005 Fuji Speedway main
racing course, not the historic banked layout. It retains the researched 4563 m lap, 1475 m home
straight, clockwise direction, 17-corner identity, published radius families, width envelope and
40 m elevation range. Exact unpublished centerline coordinates, minor radii, arc angles and
connectors are original simplified authoring and make no survey or homologation claim.

Course 3 remains the released M9.3 four-wheel Tsukuba Course 2000 reconstruction. M9.6 did not
replace or rewrite it.

Current vehicle debug choices remain:

```text
profiles: FR / MR / RR / AWD / BIKE1 / BIKE2
self-steer travel-direction gain: 0 / 0.2 / 0.4 / 0.6 / 0.8 / 1.0
yaw preview: 0 / 0.06 / 0.12 / 0.18 / 0.24 / 0.30 s
symmetric steering traversal: 0.25 / 0.375 / 0.5 / 0.625 s
tire presets: 1 / 2 / 3, default 1
camera yaw: BODY_FIXED default / MOVEMENT_FOLLOW alternate
```

Tire choices are debug calibration presets, not a final tire-product specification. FISCO is
course authoring only; it did not recalibrate handling, tires, steering, recovery or camera.

## 3. M9.6 architecture boundary

The decision owner is upper-level CIRCUIT DEV authoring and browser composition:

```text
src/browser/course-mode-selection.ts
        |
        v
src/main-circuit.ts selects one complete fixture once
        |
        +--> src/dev/m9-3-tsukuba-circuit.ts
        +--> src/dev/m9-6-fisco-circuit.ts
        |
        v
ordinary CircuitTopology + finite open runtime window
        |
        +--> ordinary common vehicle physics
        +--> ordinary camera
        +--> ordinary renderer
```

Both course 3 and course 4 remain route kind `CIRCUIT`. There is no FISCO route kind, no second
circuit composition root, and no per-frame course branch.

M9.6 added no FISCO/course-4 special case to Core, vehicle physics, tire/wheel mechanics, input,
camera, renderer, recovery, race progress, topology compilers, LINEAR or BRANCHING.

The three-lap FISCO runtime compiles four finite ordinary open copies. Lower consumers remain
topology-blind. World X/Y/Z remains physics authority and `d = s_render - s_camera` remains the
sole renderer-depth authority.

## 4. Files that own the current state

Read these rather than reconstructing behavior from this summary:

```text
AGENTS.md
README.md
docs/README.md

docs/96_m9_6_fisco_circuit.md
docs/95_m9_5_debug_tire_characteristic_presets.md
docs/93_m9_3_tsukuba_circuit.md
docs/92_m9_2_selectable_self_steer_gain.md
docs/88_m9_1_six_profile_debug_hud.md
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md

src/dev/m9-6-fisco-circuit.ts
src/dev/m9-3-tsukuba-circuit.ts
src/browser/course-mode-selection.ts
src/browser/mobile-selector-controls.ts
src/browser/vehicle-debug-hud.ts
src/main-circuit.ts

tests/m9-6-fisco-circuit.test.mjs
tests/m9-3-tsukuba-circuit.test.mjs
tests/m8-3-course-mode-debug.test.mjs
tests/m9-1-mobile-selector-controls.test.mjs
tests/source-boundary-normalization.test.mjs
tests/pages-versioned-boot.test.mjs
```

For a handling task, also read the complete current vehicle/tire/steering authority chain listed
in `AGENTS.md` and its executable tests before proposing a parameter or mechanics change.

## 5. Completed work that must not be repeated

The following is already released and verified:

- M9.2 selectable self-steer gain, yaw-preview and symmetric actuator traversal;
- the stale steering-source fix in the shared input layer;
- steering calibration responsibility and shared browser wiring cleanup;
- current-document/reference/repository-residue cleanup;
- GitHub Pages Actions Node 24 support;
- transparent debug HUD without a large opaque panel or alpha blending;
- M9.3 researched Tsukuba Course 2000 authoring as course 3;
- M9.4 selectable reference-friction work, subsequently superseded in exact browser choices by
  M9.5;
- M9.5 three numbered tire-characteristic debug presets, default 1;
- M9.6 researched current FISCO authoring as course 4;
- PR #110, main and same-SHA Pages publication verification.

Do not rewrite historical milestone documents merely to use current terminology. Do not edit
immutable validation files. Do not repeat the migration cleanup ceremony. Do not treat the older
M9 implementation handoffs as active instructions.

## 6. Last complete verification

The validation-inclusive M9.6 candidate completed:

```text
npm test
581 tests
581 pass
0 fail
0 skipped
```

Real-browser verification covered local/public FISCO rendering, exactly one active course-4
button, touch navigation `4 -> 3 -> 4`, 390x844 portrait, 844x390 landscape, no console warnings
or errors, the public M9.6 title and public `version.txt` exact SHA equality.

These facts describe the released M9.6 checkpoint. A new implementation must run its own complete
suite and real-browser validation; this evidence cannot validate a future SHA.

## 7. Required start procedure for new work

1. Read the files in section 0 completely.
2. Run `git status`, fetch `origin`, and compare local HEAD with `origin/main`.
3. Inspect open PRs, the latest exact-head CI and public Pages version.
4. Identify the newest numbered authority for the requested topic.
5. Read the owning implementation, types, compilers and causal tests.
6. Answer every Architecture Decision Gate question in `AGENTS.md` from current evidence.
7. Create a dedicated `codex/` branch from the exact current main SHA.
8. Implement the smallest coherent upper-level/general solution without duplicate authority.
9. Add causal regression coverage, run the complete suite and verify the real browser.
10. Follow the exact-head PR, validation-record decision, non-force fast-forward and same-SHA Pages
    contract.

If main has advanced beyond `7544d794c832bbe27c0df6492c5fc531533247d2`, the newer main is
authoritative. Do not reset it back to this checkpoint.

## 8. Frozen boundaries to keep visible

- world X/Y/Z is authoritative for vehicle physics;
- renderer depth is exactly `s_render - s_camera`;
- lateral displacement never changes renderer depth;
- Raster interior turns remain at or below 10 degrees;
- metric presentation remains 2.0 m = 80 px at player depth;
- transparency remains 0/1 with no alpha blending;
- camera roll remains zero;
- Open remains the general model and cyclic behavior stays explicit above Core;
- route/race progress comes only from physical gates;
- recovery manufactures no route, checkpoint or lap progress;
- general layers do not import `src/dev`;
- course selection stays at the top-level browser composition boundary;
- validated SHAs only reach main, and main is never force-updated as normal release procedure.
