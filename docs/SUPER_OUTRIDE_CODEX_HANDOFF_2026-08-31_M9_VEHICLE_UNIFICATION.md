# SUPER OUTRIDE — M9 Vehicle Unification Implementation Handoff

Historical checkpoint notice: M9.0 was subsequently implemented on PR #100. The status and
procedure below record the takeover boundary before implementation and are not current task state.

Historical checkpoint status: product/design discussion complete; M9 normative design and
implementation have not started.

This document is takeover context and an implementation procedure. It records the user-approved
direction, the current dirty-worktree boundary, the architecture questions that must be resolved in
repository authority, and the required causal regressions. It is not itself the M9 normative vehicle
design authority. The first M9 design milestone must author that authority explicitly before deleting
or superseding M8.0/M8.1 mechanics.

Repository files, tests and Git/CI identity remain authoritative. A previous chat transcript is not
required for takeover.

## 0. Minimal instruction for the next thread

A fresh Codex thread should be able to begin with only:

```text
Read AGENTS.md and
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_M9_VEHICLE_UNIFICATION.md
completely. Preserve and validate the current M8.2-M8.7 work first, then perform the M9 vehicle
unification in the staged order in this handoff. Do not retain the old BIKE solver as a compatibility
authority.
```

Do not start by rewriting `car-physics.ts` or `motorcycle-physics.ts`. First establish the exact Git
and test state and author the explicit M9 supersession boundary.

## 1. Exact local checkpoint at handoff authoring

Repository working directory:

```text
/Users/harak/Documents/ChatGPT/super outride
```

Current branch at the time this handoff was authored:

```text
codex/m8-2-velocity-chase-camera
```

Current checked-out commit:

```text
f660f41b1dfe625671ca27abd955e916161b77f1
```

The worktree is intentionally dirty. It contains the accumulated M8.2-M8.7 implementation and
documentation changes. They are not represented by the commit above and must not be discarded,
reset, checked out over, or silently mixed with the M9 rewrite.

The last complete local regression result before this handoff was:

```text
526 tests
526 pass
0 fail
0 skipped
```

That result describes the dirty M8.2-M8.7 candidate before this handoff file was added. It is useful
checkpoint evidence, not exact-head release evidence. After adding this handoff and its README/index
links, the complete local `npm test` suite was run again and remained `526 / 526` green. Re-run it
again before preserving the work because the worktree still has no immutable exact-head identity.

Branch choice is delegated to the implementing agent. Follow `AGENTS.md` and choose the simplest
safe topology after inspecting current `main`, the current branch, remote PR state and the dirty
worktree. The required result is independent of the chosen branch name:

1. the M8.2-M8.7 work is preserved as an identifiable green checkpoint;
2. M9 begins from that preserved state, not from the old `f660...` commit alone;
3. M9 changes are reviewable separately from accidental M8 churn;
4. no implementation occurs directly on `main`;
5. no destructive Git command is used on the dirty worktree.

The preferred release-safe sequence is to finish and validate the M8.2-M8.7 candidate first, then
start M9 from the resulting exact state. A stacked M9 branch is acceptable only when repository/PR
state makes that explicitly safer; if used, document the dependency and do not confuse stacked CI
with a validated `main` release candidate.

## 2. What the current dirty M8 candidate already contains

The next thread must inspect the actual diff, but the intended accumulated behavior is:

### M8.2 input lifecycle and player camera

- touch, keyboard, pointer-capture, blur, visibility and page lifecycle no longer leave a stale
  steering/throttle/brake input latched;
- camera yaw follows authoritative horizontal movement direction;
- camera pitch follows physical vehicle-body pitch;
- the player is centered horizontally and presented at screen `Y=190`;
- a DEV overlay arrow shows body yaw relative to movement/camera yaw.

### M8.3 explicit browser course modes

```text
1 = LINEAR
2 = BRANCHING
3 = CIRCUIT
```

- LINEAR is a finite open 8 km debug highway;
- BRANCHING no longer lets a leading rival lock the player's route choice;
- selection remains top-level browser composition, not a lower engine mode branch.

### M8.4-M8.7 camera, rendering and circuit work

- shared downward camera pitch is 12 degrees;
- matching flat-road camera height is 2.851878849 m;
- camera-relative far render depth is 200 m, or 195 m ahead of the player;
- flat geometric infinite horizon is approximately `Y=78.41766183644815`;
- CIRCUIT is approximately 12.076 km with mixed 190/320/380/520/680 m-radius corners;
- circuit relief is approximately 96 m;
- two authored straight crests naturally produce two ordinary airborne/recontact episodes under
  the unchanged CAR mechanics.

Relevant new milestone documents are `81` through `86`. Relevant source/test additions include
the three-mode boot, camera profile, LINEAR root, varied-elevation circuit, yaw overlay and M8.2-M8.7
regressions. Do not reconstruct these changes from this summary; preserve and inspect the worktree.

## 3. Product decision that M9 must formalize

SUPER OUTRIDE is an OutRun-style game in which cars and motorcycles must be able to traverse the
same authored roads, corners, elevation changes and jumps under one understandable arcade handling
architecture.

The separate high-detail BIKE rigid-body simulation has been judged to cost more architecture,
calibration and testing effort than its product-visible benefit. The target is therefore not:

```text
simulate a motorcycle as a literal four-wheel car
```

The target is:

```text
one reduced Two-Station Arcade Vehicle Dynamics solver
+ vehicle profiles
+ input/control adapters
+ vehicle-specific presentation
```

The common solver must retain the physically meaningful phenomena visible in this game:

- authoritative world position and velocity;
- body yaw and pitch;
- front and rear contact stations;
- unilateral suspension/load transfer;
- front and rear wheel angular velocity;
- wheel-torque drive and braking;
- combined longitudinal/lateral tire saturation;
- power oversteer/drift through rear combined-slip utilization;
- crest flight, recontact, nose dive and pitch response;
- wheelie/stoppie only if they emerge from the same pitch/load-transfer mechanics and remain inside
  the supported model envelope.

CAR and BIKE differences belong in profiles and presentation, including mass, wheelbase, CG height,
pitch/yaw inertia, tire stiffness/grip, suspension, wheel radii/inertias, engine, gearing, brakes,
steering response, drag, sprite choice and derived visual lean.

The new common solver must not contain scattered branches such as:

```text
if (vehicle.kind === 'BIKE') ...
if (vehicle.kind === 'CAR') ...
```

Composition selects a compiled vehicle profile and presentation adapter once. Ordinary mechanics
then consume the same profile shape.

## 4. Explicit M8 authority that must be superseded

M8.0 and M8.1 are currently frozen authority. M9 is an intentional normative architecture change,
not a behavior-preserving refactor. The new M9 authority must state the exact supersession scope.

Retain from M8.0 unless falsified explicitly:

- world-space pose/velocity authority;
- derived Guide/contact observations;
- two physical contact stations;
- state-free unilateral suspension observation;
- one-k radial combined-slip tire force;
- implicit wheel-Omega solve;
- wheel torque as the only drive/brake route to body force;
- finite/open runtime composition;
- no stored contact phase, tire-force memory or direct body drive/brake force;
- fixed 60 Hz outer update and current substep baseline until separately validated.

Supersede and delete from the BIKE authority:

- quaternion orientation as a separate BIKE mechanics requirement;
- BIKE roll angular momentum and independent roll authority;
- crown-radius contact migration;
- wheel-axis gyroscopic mechanics that exist only for the former full BIKE solver;
- the old Rider lean/roll controller as a force-producing mechanics authority;
- separate CAR and BIKE rigid-body solvers.

Supersede the following scoped M8.1 control decision:

```text
released steering request clears steeringOffsetCommand immediately
```

It becomes a finite-rate actuator return. Preserve the M8.1 travel-direction/yaw-preview
self-steering concept unless M9 tests demonstrate that a simpler common control law can retain the
same drift recovery and ordinary driving behavior.

Do not keep the old motorcycle solver behind an adapter, alias, feature flag or compatibility
re-export. After migration and regression replacement, delete the retired authority and its dead
quaternion/crown/gyro-only helpers when no remaining general consumer needs them.

## 5. Unified three-channel input/actuator contract

The canonical input remains device-independent and digital for the browser controls:

```ts
interface DrivingInput {
  steering: number;   // normalized [-1,+1]; browser emits -1, 0 or +1
  throttle: boolean;  // digital request
  brake: boolean;     // digital request
}
```

Analog steering traces remain legal over `[-1,+1]`. Do not move response state into keyboard or
touch adapters. Those adapters own only current user request and lifecycle reset.

All three channels must use the same conceptual pipeline:

```text
canonical request
-> normalized authoritative actuator state
-> physical target/output
-> wheel/contact/tire mechanics
```

The common state shape should be equivalent to:

```ts
interface DrivingActuatorState {
  steering: number; // [-1,+1]
  throttle: number; // [0,1]
  brake: number;    // [0,1]
}
```

There must be exactly one persistent actuator state per channel. Input request is an observation,
not a second latched authority. HUD telemetry is derived output, not a second actuator authority.

Use one bounded asymmetric rate primitive for all three channels:

```text
target = normalized canonical request
rate   = releaseRate when target is neutral
         applyRate otherwise
next   = move_toward(current, target, rate * h)
```

Direction reversal for steering remains bounded and continuous. Validation must define whether an
opposite nonzero request uses the apply rate for the entire crossing or applies release-to-neutral
then engage-away-from-neutral; choose one rule explicitly and test it. The simpler initial rule is
one apply rate toward any nonzero target.

### Steering channel

The normalized steering actuator represents the driver's requested offset from predicted body
travel direction. It is not the physical front road-wheel angle.

```text
steering actuator
-> driver offset = actuator * steeringOffsetMax
-> target road-wheel angle = body travel direction
                             - yawRate * previewTime
                             + driver offset
-> fast physical rack response
-> front tire slip and force
```

Initial `DEV_UNCALIBRATED` seeds:

```text
steeringOffsetMax:       15 degrees
apply rate:              24 degrees/second (unchanged from M8.1)
release rate:            60 degrees/second
maximum full release:    0.25 second from 15 degrees
physical rack tau:       0.01 second (unchanged initially)
yaw preview:             0.12 second (unchanged initially)
mechanical road-wheel:   +/-31 degrees (unchanged initially)
```

The user explicitly rejected instantaneous return to zero. The current implementation's immediate
assignment is a zero-time return, not a zero response speed. M9 must make the return finite and
monotone. Release should be faster than application so the control does not feel latched.

### Throttle channel

```text
digital request
-> normalized throttle actuator
-> automatic powertrain torque request
-> driven-wheel output torque
-> wheel slip/tire force
```

Initial seeds:

```text
0 -> 1: approximately 0.25 second
1 -> 0: approximately 0.125 second
```

This makes a short digital press produce intermediate torque and lets repeated taps behave like a
controllable low-frequency duty cycle during drift. Do not add an analog browser requirement and do
not create a drift mode.

The persistent actuator value is the throttle-opening/driver-demand equivalent. Engine RPM,
sampled engine torque, gear state and delivered wheel torque remain powertrain/mechanical state or
derived output. Rename misleading telemetry such as `requestedDriveTorque` when it actually reports
delivered/output wheel torque.

### Brake channel

```text
digital request
-> normalized brake actuator
-> front/rear profile maxima scaled by that actuator
-> wheel brake torque
-> lock/slip/tire force
```

Initial seeds:

```text
0 -> 1: approximately 0.15 second
1 -> 0: approximately 0.10 second
```

A tap must produce partial braking; a long hold may still reach full brake torque and lock a wheel.
Do not translate brake actuator state into a direct body deceleration.

Throttle and brake remain independent requests. Preserve the current legal simultaneous-input
behavior unless a later explicit product rule chooses priority or interlock. The wheel/powertrain
solve, not the input adapter, resolves simultaneous drive and brake torque.

### Recovery and lifecycle

- pointer/touch/keyboard/page lifecycle resets canonical input request only;
- vehicle recovery resets all three persistent actuator states to neutral;
- recovery must not award route/race progress or manufacture contact state;
- switching vehicle profile reconstructs a valid vehicle and neutral actuator state rather than
  copying incompatible running mechanics.

## 6. ABS and TCS decision under the current tire law

M9 baseline has neither ABS nor TCS.

The current tire law does not model separate static and kinetic friction coefficients. It has a
linear low-slip region, one C1 transition, and a constant radial force plateau at `mu*N`. There is no
post-peak force drop. Therefore, in ideal straight-line single-axis saturation:

- a locked wheel and a near-limit rolling wheel can produce essentially the same maximum braking
  force magnitude;
- uncontrolled wheelspin and controlled near-limit drive can produce essentially the same maximum
  traction magnitude;
- ABS/TCS do not provide the ordinary real-world benefit of recovering from a lower post-peak
  kinetic-friction region, because that lower region does not exist.

They are not mathematically meaningless in combined slip. Excess longitudinal slip changes the
direction/allocation of the saturated force vector and leaves less useful lateral force. ABS could
therefore preserve steering/yaw control while braking in a corner. TCS could preserve rear lateral
capacity, but it would also suppress the intended power-oversteer/drift interaction.

Product decision:

```text
TCS: omit
ABS: omit initially
```

First evaluate the finite throttle/brake actuators. Only if braking while steering remains unusably
binary may a later milestone consider weak lock suppression. If added, it belongs above the wheel
solve as a brake-actuator modulator. It must not alter `mu`, inject body force, create a second tire
law or silently become baseline physics.

Do not add a post-peak friction drop merely to justify ABS/TCS. That would be a separate tire-model
decision requiring new design authority and handling calibration.

## 7. Mandatory architecture decision gate for M9

Before implementation, the next thread must record answers equivalent to the following.

1. **Owner of canonical request:** keyboard/touch/AI input publishers.
2. **Owner of response:** one vehicle-neutral actuator primitive and one three-channel actuator
   state per vehicle.
3. **Owner of steering mechanics:** common Driver/control law plus the single physical front steer
   angle.
4. **Owner of drive/brake mechanics:** powertrain and wheel-torque solve.
5. **Owner of force:** contact/tire law only.
6. **Owner of CAR/BIKE difference:** compiled vehicle profile and presentation adapter selected at
   composition.
7. **Duplicate-state check:** canonical request, actuator state, mechanical output and telemetry
   must not duplicate one another as writable authorities.
8. **Lower-layer branch check:** common mechanics must not branch on route kind, course mode,
   camera, stage, CAR or BIKE product identity.
9. **Frozen-invariant check:** renderer depth, metric presentation, open topology, RouteDag/circuit
   composition and world-space continuity remain unchanged.
10. **Executable boundary:** architecture/source tests must reject compatibility shims, duplicate
    solvers and vehicle-kind branches in the common solver.

If implementation requires a product-specific lower-layer exception, stop and reconsider the
profile or composition boundary before adding it.

## 8. Required staged implementation procedure

### Stage A — preserve the M8.2-M8.7 candidate

1. Read `AGENTS.md`, `README.md`, `docs/README.md`, Core Freeze/addenda, M8.0, M8.1 and documents
   `81` through `86` completely.
2. Inspect `git status`, current branch, current `main`, remotes/PRs if available, and the complete
   dirty diff.
3. Verify that every untracked M8 file belongs to the intended candidate; do not use broad cleanup.
4. Run `git diff --check`.
5. Run the complete `npm test` suite.
6. Perform proportional browser smoke checks for LINEAR, BRANCHING and CIRCUIT, including input
   release, camera centering/yaw/pitch, 200 m presentation, vehicle yaw arrow and CIRCUIT jump
   continuity.
7. Preserve the exact M8 candidate in Git using the branch/commit/PR topology appropriate to the
   inspected repository state. Do not implement directly on `main`.
8. Follow the exact-head CI/release contract in `AGENTS.md` if releasing M8 before M9.

Do not begin M9 while the only copy of the M8 work is an uncommitted dirty worktree.

### Stage B — author M9.0 normative design and executable architecture boundary

Create a numbered M9.0 design document. It must:

- name the common Two-Station Arcade Vehicle Dynamics model;
- state the exact M8.0/M8.1 supersession scope from §4;
- freeze the three-channel actuator ownership from §5;
- state the no-ABS/no-TCS baseline and its tire-law reasoning;
- distinguish mechanics, control adapter, profile, presentation and telemetry;
- list authoritative versus derived state;
- prohibit old-BIKE compatibility authority and common-solver vehicle-kind branches;
- specify acceptance tests before implementation relies on the new authority.

Update `AGENTS.md`, `docs/README.md` and `README.md` only to point to the new current authority; do
not rewrite M8.0/M8.1 historical documents.

Add an architecture/source-boundary regression early so later implementation cannot drift toward
two solvers or compatibility aliases.

### Stage C — introduce the common actuator primitive without changing tire authority

1. Add one small vehicle-neutral actuator module/profile/state.
2. Validate finite positive apply/release rates and normalized bounds at compilation.
3. Apply it at the fixed physics substep so response is deterministic and trace-replayable.
4. Integrate the three actuator values with current CAR mechanics first.
5. Replace `steeringOffsetCommand` as a standalone radians authority with the normalized steering
   actuator; derive the angular offset from profile scale.
6. Scale throttle powertrain input and front/rear brake maxima from their normalized actuators.
7. Reset actuator state through ordinary creation/recovery paths.
8. Keep canonical `DrivingInput` unchanged.
9. Update HUD/telemetry naming so request, actuator value and delivered torque/angle are visibly
   distinct.

Do not change tire saturation, suspension, powertrain ratios or course geometry in this stage.

### Stage D — simplify the current CAR mechanics before generalizing it

Classify every current CAR field as one of:

```text
authoritative persistent mechanics
authoritative persistent actuator/powertrain state
derived observation/cache
presentation/HUD only
dead/duplicated
```

Likely persistent common mechanics are world pose/velocity, yaw/pitch and rates, physical front
steer angle, two wheel Omegas, three actuator values and legitimate powertrain state. Guide
coordinate, speed components, support flags, gaps, normal loads, handwheel angle, slip/utilization
and screen position remain derived observations/caches.

Remove dead duplicate locals/fields only when tests prove no consumer treats them as authority.
Do not optimize substeps, rewrite the tire law or recalibrate handling in the same change. A
simplification stage must be mechanically behavior-preserving except for the explicitly approved
actuator response.

### Stage E — generalize the simplified CAR solver

1. Rename/extract the reduced solver and state into vehicle-neutral authority.
2. Convert CAR constants into one compiled common vehicle profile.
3. Ensure the solver consumes only the common profile shape.
4. Keep CAR-specific input interpretation/presentation outside the mechanical integration.
5. Prove the CAR profile still reproduces the accepted CAR envelopes before migrating BIKE.

Do not add a common abstraction merely to wrap two still-independent solvers. There must be one
ordinary integration path.

### Stage F — migrate BIKE as a profile and delete the old solver

1. Author a BIKE profile for the common solver.
2. Use the same three actuator channels and the same world/contact/wheel/tire path.
3. Tune mass, geometry, suspension, engine, brake and steering profile values so BIKE is visibly
   distinct but can traverse the same course family.
4. Derive visual lean/bank from physical lateral acceleration, yaw rate, steering actuator and/or
   body sideslip. It is presentation only and must not feed mechanics.
5. Keep body pitch physical so crests, landings, nose dive and possible wheelie/stoppie remain
   mechanically meaningful.
6. Replace old BIKE tests with common-solver/profile tests only after the new causal behavior is
   covered.
7. Delete the separate motorcycle rigid-body solver, Rider roll controller, crown/gyro-only state
   and dead quaternion helpers. Delete imports and tests rather than creating re-export shims.

Frozen renderer rules still prohibit arbitrary runtime sprite rotation. Visual lean must use
available authored sprite/presentation choices or a later explicit sprite-authoring milestone.

### Stage G — integration, calibration and exact-head validation

1. Run CAR and BIKE through LINEAR, both BRANCHING choices and complete CIRCUIT laps.
2. Exercise low/high-speed corners, drift entry/hold/release, braking while steering, wheel lock,
   wheelspin, both jump crests, airborne steering continuity and recontact.
3. Verify input lifecycle resets in every course root.
4. Verify route choice/race progress is unchanged and no recovery manufactures progress.
5. Check performance budgets and deterministic trace replay.
6. Inspect the final diff for old solver remnants, compatibility authority and vehicle/mode branches.
7. Run the complete `npm test` suite.
8. Record validation-inclusive exact-head evidence and follow the non-force release contract in
   `AGENTS.md`.

## 9. Required causal regression matrix

### Actuator primitive

- zero request keeps neutral exactly;
- each channel remains inside its normalized bounds;
- one-tick press is smaller than a held press;
- held press reaches full scale in the authored time;
- release is finite, monotone and reaches exact neutral without overshoot;
- steering release is not instantaneous and is faster than steering application;
- opposite steering request follows the explicitly selected reversal rule;
- fixed-tick results are deterministic;
- recovery resets all actuator channels;
- touch/pointer/blur/page lifecycle releases canonical request and actuator state subsequently
  decays according to mechanics rather than staying latched.

### Steering and drift

- current short-tap response remains controllable;
- neutral travel-direction steering still generates physical countersteer from body motion;
- held-request/release drift envelopes decay without rack lock;
- road-wheel mechanical stop remains authoritative;
- no Guide heading, route, camera or screen position enters the steering law;
- handwheel remains derived presentation.

### Throttle and brake

- a short throttle tap produces intermediate delivered wheel torque;
- throttle release produces a faster monotone torque reduction without a drift mode;
- repeated digital taps can sustain intermediate actuator demand deterministically;
- a short brake tap produces partial front/rear brake torque;
- a held brake can still produce physical wheel lock;
- release removes brake torque continuously;
- simultaneous throttle/brake remains finite and is resolved through wheel torque;
- neither input creates direct body force.

### Tire-law / ABS / TCS reasoning

- straight longitudinal force reaches the same plateau for sufficiently large positive or negative
  slip magnitude;
- no post-peak force drop appears;
- combined longitudinal demand reduces useful lateral allocation/direction as expected;
- lock and wheelspin are derived telemetry, not modes;
- source/architecture checks prove there is no ABS/TCS intervention authority.

### Common CAR/BIKE solver

- both profiles instantiate the same state/solver type;
- common mechanics contain no CAR/BIKE branch;
- both preserve world-space continuity and derived Guide observations;
- both use front/rear wheel torque and the same tire/contact primitives;
- profile compilation rejects invalid mass/inertia/geometry/suspension/actuator parameters;
- CAR and BIKE both complete applicable course-mode integration probes;
- both exhibit ordinary crest flight/recontact without an airborne mode;
- BIKE presentation lean cannot affect forces or world state;
- retired motorcycle solver/quaternion/crown/gyro authority cannot be imported.

## 10. Calibration seeds versus architecture

The following are architecture and should be stable after M9.0:

- one common mechanical solver;
- three normalized persistent actuator channels;
- digital canonical browser input;
- finite actuator response;
- wheel-torque-only drive and braking;
- no baseline ABS/TCS;
- profile-owned CAR/BIKE differences;
- presentation-only BIKE lean.

The following remain `DEV_UNCALIBRATED` and may change after human driving evaluation without
reopening architecture:

- exact steering release rate;
- throttle/brake rise and fall times;
- steering offset/rack/preview calibration;
- CAR/BIKE mass, geometry, suspension, tire and powertrain profile values within compiler bounds;
- derived BIKE visual-lean mapping;
- AI control calibration against the new actuator lag.

Do not make seed values constants hidden in input adapters. Put them in compiled vehicle/control
profiles so calibration has one explicit authority.

## 11. Likely source boundary

Names may be improved during M9.0 design, but the ownership should remain equivalent to:

```text
src/input/driving-input.ts             canonical request shape only
src/input/keyboard-input.ts            keyboard request + lifecycle
src/input/touch-input.ts               touch request + lifecycle
src/physics/driving-actuator.ts        common normalized rate primitive/state/profile
src/physics/vehicle-dynamics.ts        common state/contact/suspension observations
src/physics/tire-wheel.ts              unchanged tire/wheel force authority
src/physics/automatic-powertrain.ts    engine/gear -> driven-wheel torque
src/physics/arcade-vehicle-physics.ts  one common reduced mechanical solver
src/physics/vehicle-profiles.ts        compiled CAR/BIKE profile authority
src/gameplay/recovery.ts               valid reconstruction + neutral actuators
src/render/...                         derived CAR/BIKE presentation and HUD
src/main*.ts                           top-level profile/roster/presentation composition
```

Do not preserve old file paths through compatibility re-exports. Update consumers to the new
authority and remove retired modules once migration is complete.

## 12. Stop conditions and escalation

Stop and make the conflict explicit before continuing if:

- the M8 dirty worktree cannot be separated or preserved safely;
- current `main`/PR history conflicts with the checkpoint described here;
- one common solver cannot express a required CAR/BIKE behavior without a lower-layer kind branch;
- preserving BIKE wheelie/stoppie would require restoring quaternion/roll/crown authority;
- a test requires weakening frozen renderer, topology, metric or route invariants;
- the only way to make a test pass is a compatibility shim or direct body force;
- human-feel calibration is needed to choose between materially different product behaviors.

Ordinary tuning uncertainty is not a blocker. Use the stated seeds, keep them profile-owned, mark
handling `DEV_UNCALIBRATED`, and continue with causal tests.

## 13. Definition of done

M9 vehicle unification is complete only when:

```text
M8.2-M8.7 is safely preserved and independently green
M9 normative authority explicitly supersedes the scoped M8 BIKE/control decisions
all three inputs use one normalized actuator representation
steering release is finite rather than an immediate command clear
digital throttle supports intermediate torque through response dynamics
digital brake supports partial torque before possible physical lock
baseline contains no ABS or TCS intervention
CAR and BIKE use one ordinary reduced mechanical solver
vehicle differences are profile/presentation authority
old BIKE quaternion/roll/crown/gyro/Rider solver authority is deleted
no compatibility shim or common-solver vehicle-kind branch remains
LINEAR, BRANCHING and CIRCUIT integration is green for both profiles
input lifecycle, drift, lock/spin and jump/recontact regressions are green
the complete suite is green
validation-inclusive exact head is green in CI
release follows the force=false exact-head contract
```

Until all conditions are met, continue to describe the work as an M9 candidate and vehicle feel as
`DEV_UNCALIBRATED`.
