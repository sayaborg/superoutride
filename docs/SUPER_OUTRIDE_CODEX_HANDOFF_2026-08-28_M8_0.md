# SUPER OUTRIDE — M8.0 Phase 9 Active Codex Handoff

Status: active development handoff. This file is navigation/current-work context, not a second physics design authority.

Repository is the only project authority. Previous ChatGPT/Codex conversations are not authority.

## 0. Minimal takeover instruction

A fresh Codex session should be able to start with only:

```text
Read AGENTS.md and docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md, then continue PR #88 from repository authority to completion.
```

Do not ask for prior chat transcripts unless repository evidence is genuinely insufficient.

## 1. Exact development identity

Repository:

```text
sayaborg/superoutride
```

Audited `main` baseline from which this work started:

```text
dd2b35c6e2187770ba71d0a8a29a5ae65a9298b1
```

Active branch:

```text
feature/phase9-vehicle-physics-freeze
```

Active PR:

```text
#88 — M8.0 Phase 9 vehicle physics architecture freeze
```

PR remains DRAFT until migration, new regressions, full validation-inclusive CI, and release checks are complete.

Last implementation head that received a complete compile + test run before this handoff documentation was added:

```text
3adccfc94f2ab05ceaf07f233abe61f00114c3c9
```

GitHub Actions run:

```text
33160399210
```

That run checked out the exact SHA above. TypeScript/build compilation completed successfully. Full regression then completed with:

```text
449 tests
417 pass
32 fail
0 skipped
```

The handoff/index commits that follow that implementation head are documentation-only descendants unless repository history says otherwise. On takeover always run `git rev-parse HEAD` and inspect PR #88 rather than treating an embedded SHA in this document as self-referential branch-head authority.

## 2. Required reading order

Read in this order before changing implementation:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/00_core_design_freeze.md`
4. `docs/00a_core_design_freeze_addendum_m5_2.md`
5. `docs/00b_core_design_freeze_addendum_m6_44.md`
6. `docs/00c_core_design_freeze_addendum_m6_45.md`
7. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md`
8. current source/types/compilers/tests relevant to the failing area
9. PR #88 and its latest exact-head CI

Historical M7.0/M7.3/M7.4 documents remain historical milestone records. Where their vehicle-physics decisions conflict with M8.0, `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` explicitly supersedes them within its scope. Do not rewrite historical milestone prose merely to make terminology current.

## 3. What Phase 9 already closed

The Phase 9 design was repeatedly audited and falsified before implementation. The final hostile audit found one real mechanics defect and several freeze-completeness gaps. Those were corrected before/while implementing M8.0.

Do not casually reopen these architectural choices merely because a legacy test fails:

```text
CAR:
- 5DOF reduced rigid body: heave + pitch + planar XZ + yaw
- no CAR roll state
- FRONT/REAR axle stations, not four independent tires

BIKE:
- quaternion orientation + body angular velocity
- no bankAngle/lean Euler authority
- two physical wheel stations
- minimal tire crown geometry

common mechanics:
- world pose/velocity are authoritative
- Guide coordinate is derived observation only
- no stored CONTACT/AIRBORNE phase authority
- unilateral suspension/load derived each substep
- one-k normalized radial tire law
- no tire-force memory
- combined longitudinal/lateral saturation from the same tire law
- scalar implicit wheel-Omega solve
- powertrain output authority is wheel torque, not direct body force
- brake input becomes wheel brake torque, not direct body brake force
- rear drive is the current minimal CAR/BIKE drive topology
- no hidden ABS/TC physics authority
- no speed/yaw/fall/contact-load clamps that manufacture admissible state
- q >= qTravel is OUTSIDE MODEL, not a position/load clamp
- uniform 60 Hz / Nsub=12 runtime baseline; Nref=80 offline reference class
```

### Final hostile-audit mechanics correction

Wheel spin angular momentum reaction is not only the reorientation gyro term. With

```text
H = Iw Omega bWheel
```

body reaction must include both:

```text
-Iw OmegaDot bWheel
-omegaAxis x H
```

The first term is the final-audit correction. It requires no new persistent state or tuning parameter. Do not remove it as "double-counted gyro" without a new conservation derivation and falsification.

### BIKE Rider capacity correction

Do not restore the optimistic

```text
ayUseful = (FyUsefulFront + FyUsefulRear) / m
```

relation. M8.0 uses the same front/rear yaw-moment-feasible logic as CAR: the useful lateral capacity is limited by the first axle that cannot satisfy steady force/moment balance after current longitudinal utilization.

## 4. Compiler/profile invariants already decided

The M8.0 implementation/validation must preserve or make executable at least:

```text
CAR positive-understeer family:
kFront < kRear
(or an explicitly equivalent positive-understeer-gradient gate)

BIKE crown:
qStatic < crownRadius < rollingRadius

BIKE rigid-body inertia:
positive principal inertias
Iroll + Ipitch >= Iyaw
Ipitch + Iyaw >= Iroll
Iyaw + Iroll >= Ipitch

Guide lateral offset validity on normal drivable domain:
A = 1 - kappa*l > 0

suspension:
0 < qStatic < qBump < qTravel
```

Do not turn these into hidden runtime corrective branches when they can be rejected by profile/course compilation.

## 5. Implemented source migration already present on PR #88

Inspect current branch rather than trusting this prose, but the intended implemented boundary is:

- `src/physics/automatic-powertrain.ts`
  - wheel-torque boundary based on wheel rotational state instead of direct body drive force.
- `src/physics/surface-map.ts`
  - `gripFactor` authority; old absolute friction/`driveScale` split is retired in M8.0 mechanics.
- `src/visual/height-profile.ts`
  - analytic differential of the same smooth height source via `samplePhysicsDifferential`.
- `src/runtime/circuit-runtime-window.ts`
  - propagates the same HeightProfile differential through finite open circuit windows.
- `src/physics/vehicle-math3.ts`
  - minimal 3D/quaternion/vector math required by M8.0.
- `src/physics/tire-wheel.ts`
  - one-k radial tire and implicit wheel solve primitives.
- `src/physics/vehicle-dynamics.ts`
  - common state-free contact/suspension/surface geometry observations.
- `src/physics/car-physics.ts`
  - M8.0 CAR 5DOF/two-station solver.
- `src/physics/motorcycle-physics.ts`
  - M8.0 quaternion BIKE/crown/gyro/Rider solver.
- `src/gameplay/recovery.ts`
  - reconstructs valid M8.0 authoritative state; does not reset retired contact/tire-memory authorities.
- `src/camera/m5-camera.ts`, renderer/read contracts
  - consume derived presentation anchors/state without becoming physics authority.
- `src/main.ts`, `src/main-circuit.ts`
  - running CAR<->BIKE state adoption is retired; DEV switching reconstructs from a safe canonical spawn instead.

Normative M8.0 design authority is already in:

```text
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
```

## 6. Current CI failure classification

The latest full run on implementation head `3adccfc...` is useful because compilation is green and the remaining 32 failures are now exposed at test/runtime level.

### A. Expected legacy-authority test failures

These tests encode M7 concepts that M8.0 explicitly supersedes. Rewrite them against M8.0 authority; do NOT recreate compatibility state/functions to satisfy them.

Known examples:

```text
tests/m5-driving.test.mjs
tests/m7-0-vehicle-dynamics-architecture.test.mjs
```

They import retired running-state conversion functions such as:

```text
adoptM5BikeKinematics
adoptM5CarKinematics
```

Those functions should remain retired.

```text
tests/m7-3-grip-and-instrument-hud.test.mjs
```

It expects old absolute `friction` and old steering/slip-utilization authority. M8.0 SurfaceMap/tire/profile authority supersedes that contract.

```text
tests/m7-4-transient-tire-response.test.mjs
```

It expects stored lateral tire-force memory, stored contact phase, and recovery clearing tire-memory state. M8.0 explicitly removes tire-force memory and stored contact phase; rewrite the regression to prove the new causal mechanics rather than preserving M7.4 internals.

### B. Legacy tests writing derived/getter-only observations

Several tests mutate fields that are no longer writable physics authorities, e.g.:

```text
supported
bankAngle
speed
longitudinalSpeed
```

Known examples include:

```text
tests/m5-1-recovery.test.mjs
tests/m5-8-performance-budget.test.mjs
tests/m5-9-tunnel-portal.test.mjs
tests/m6-19-stage-runtime-content.test.mjs
tests/m6-39-deep-browser-order-integration.test.mjs
tests/m7-1-highway-calibration-course.test.mjs
```

Migrate these tests to author world pose/velocity, use constructors/recovery primitives, or otherwise manipulate the actual M8.0 authority. Do not add setters merely for old tests.

### C. Real implementation/profile issue: qTravel exceedance

This is the main real physics issue currently exposed and should be investigated before mechanically rewriting every failing integration test.

Multiple otherwise-valid integration probes reach slightly above current CAR `qTravel = 0.26 m`, commonly around:

```text
~0.2604 .. 0.2617 m
```

and correctly throw `VehicleOutsideModelError`.

Examples observed in the failing run include:

```text
live-fork-driving-regression.test.mjs
m5-1-recovery.test.mjs
m6-3-rival-sim.test.mjs
m6-5-physics-telemetry.test.mjs
m6-6-input-trace.test.mjs
m6-51-circuit-live-runtime.test.mjs
m6-51-pages-branch-continuation.test.mjs
m7-3-grip-and-instrument-hud.test.mjs
m7-4-transient-tire-response.test.mjs
```

Do NOT "fix" this by clamping q or N. M8.0 intentionally defines `q >= qTravel` as outside model.

Investigate causally:

1. confirm initial free-reach/static-equilibrium geometry;
2. confirm suspension load/compression sign and qDot;
3. confirm nominal dynamic load transfer is physically represented once, not duplicated;
4. decide whether current profile travel/bump/static margin is simply too small for ordinary nominal behavior;
5. if profile reauthoring is needed, reauthor the minimal real parameter(s) and add a regression proving normal operating states remain inside the model while deliberate qTravel exceedance still throws.

Do not hide a geometry/integration defect by making qTravel arbitrarily huge.

### D. Non-physics legacy text/milestone assertions

Known examples:

```text
pages-versioned-boot.test.mjs
```

Visible M8.0 candidate labels and package milestone metadata are not yet fully synchronized. Do this deliberately once the migration is coherent; do not falsely declare M8.0 released before final validation.

```text
m6-20-post-finish-continuation.test.mjs
```

A failure was caused by an exact source-comment/string assertion rather than a demonstrated topology/physics defect. Preserve the real causal contract, not incidental prose.

## 7. What is already known to remain healthy

The full run showed many Core/renderer/topology/route/circuit tests still passing. In particular, the rewrite has not provided evidence that M6 open-path/topology authority must be reopened.

`tests/m7-2-default-branching-highway.test.mjs` passed and should remain PRESERVE-class unless later evidence shows otherwise.

Do not use M8.0 physics migration as an excuse to redesign renderer depth, RouteDag, circuit unfolding, GroundMap visual semantics, or fixed metric presentation.

## 8. Required next work

Recommended order:

1. Re-fetch/inspect current PR #88 head and exact latest CI.
2. Run/inspect the qTravel failure class first and determine whether it is profile margin or a mechanics defect.
3. Fix the real causal issue without q/N clamps.
4. Migrate legacy tests that freeze retired M7 physics authority. For every changed test, identify the M8.0 authority that supersedes it.
5. Add a dedicated M8.0 Phase 9 executable regression suite covering at minimum:
   - authority/state shape;
   - one-k tire and radial combined saturation;
   - finite zero-speed slip regularization;
   - unique implicit wheel root;
   - standing start and wheel lock through zero;
   - unilateral suspension/static/bump/rebound/crest/recontact/qTravel-outside-model;
   - CAR useful-steer family and positive-understeer compiler gate;
   - CAR drift equilibrium/recovery from rear combined utilization, without drift mode;
   - BIKE crown upright identity/contact migration/Reff consistency;
   - BIKE Rider lean pulse/steady lean/arrest;
   - BIKE wheel angular-momentum materiality including both axial OmegaDot reaction and axis gyro;
   - BIKE wheelie/stoppie emergence and crest airborne;
   - Nsub=12 vs offline reference classes;
   - course/profile compiler invariants including A>0 and speed/aero envelopes.
6. Synchronize package/visible milestone labels as an M8.0 candidate only when tests are updated coherently.
7. Run complete `npm test` until green.
8. Inspect final diff for accidental compatibility shims or duplicate authority.
9. Add final validation evidence only after the validation-inclusive exact head exists.
10. Run complete CI again on that validation-inclusive exact SHA.
11. Mark PR #88 ready only after that exact head is green.
12. Re-fetch `main`; verify candidate is a pure fast-forward (`behind_by=0`, merge base=current main).
13. Move `main` to the validated exact SHA with `force=false` only.
14. Verify `main SHA == validated PR head SHA` and required PR/release identity.
15. Verify the main-push build/Pages workflow on that same SHA before declaring M8.0 released.

## 9. Explicit takeover prohibitions

Until independent new falsification justifies reopening architecture, do not:

- restore stored `CONTACT/AIRBORNE` as physics authority;
- restore CAR lateral tire-force memory;
- restore `bankTarget` body physics;
- restore direct body drive/brake force from powertrain/input;
- restore hidden ABS/TC authority;
- restore running CAR<->BIKE state adoption;
- add a jump/drift/wheelie/stoppie mode;
- clamp suspension compression/load merely to avoid qTravel outside-model errors;
- add route/stage/product branches inside common vehicle mechanics;
- modify frozen renderer pseudo-depth or topology to solve a vehicle-physics test;
- add compatibility shims solely to make superseded M7 assertions pass.

## 10. Definition of done for this PR

PR #88 is complete only when all of the following are true:

```text
M8.0 normative authority is coherent
real qTravel/profile issue is resolved causally
legacy tests are migrated without compatibility authority
new M8.0 regressions are present
full suite is green
validation-inclusive exact head is green in CI
main has not diverged or candidate is reconstructed/revalidated
main moves by pure force=false fast-forward to validated SHA
main-push build/Pages verification succeeds on same SHA
repository docs reflect released state without self-reference ambiguity
```

Before those conditions, keep PR #88 draft and do not describe M8.0 as released.
