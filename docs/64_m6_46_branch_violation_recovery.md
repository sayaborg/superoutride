# M6.46 — Branch Violation Recovery

## 0. Status

**Complete candidate; release requires exact-head CI and validation-file-inclusive CI before main fast-forward.**

Package:

```text
super-outride-m6-46@0.6.46
```

Implementation-green checkpoint:

```text
feature head: 3673c0b629b7e2b437aaeca524fd69d735844423
GitHub Actions: #433
382 tests / 382 pass / 0 fail
```

M6.46 does not change renderer Core. It resolves a gameplay/session ambiguity exposed by the M6.45 Pages hotfix and removes one remaining hidden closed-course assumption from general recovery.

---

## 1. Why M6.46 exists

M6.41 established shared branch authority:

```text
FIRST_PHYSICAL_CROSSING_LOCKS
```

M6.42 generalized that arbitration to a variable-length actor field, and M6.43 made the current BRANCHING product rule explicit.

However, M6.43 intentionally left one question unresolved:

```text
What happens physically when a later actor crosses the sibling road
that the field lock has already made illegal?
```

The prior placeholder was:

```text
branchViolationPolicy = UNDECIDED
```

That ambiguity became a real browser failure when a DEV rival started ahead of the player, selected RIGHT, and the player subsequently entered LEFT. Route authority correctly refused LEFT, but the actor had no defined physical response and could become stranded in a road whose route transaction could never commit.

M6.45 temporarily removed the rival from the Pages fixture so the undefined policy could not occur.

M6.46 resolves the policy instead of preserving that workaround.

---

## 2. Product rule remains unchanged

The field route rule is still:

> **At a real branch, the first physical vehicle crossing one sibling transition gate locks that choice for the field.**

M6.46 does not grant priority to the player, to AI intent, to actor-array order, or to screen position.

The deciding sequence remains:

```text
all actor physics
→ observe physical crossings
→ compare physical sub-tick crossingFraction u
→ earliest crossing wins
→ create shared field lock
```

The new policy applies only after the legal branch has been determined.

---

## 3. Branch violation policy

BRANCHING now compiles to:

```text
sharedRouteChoiceMode = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy = RECOVER_TO_LOCKED_BRANCH
```

LINEAR and CIRCUIT do not use this policy:

```text
branchViolationPolicy = null
```

A forbidden sibling crossing means:

```text
physical crossing exists
BUT
RouteDag transition is not accepted
PENDING handoff is not queued
actor is recovered to an approach on the locked legal branch
```

The losing road remains ordinary authored visual/physical content. M6.46 does not create an invisible wall, renderer mask, or fake geometry branch.

---

## 4. Separate physical observation from legal route observation

The central M6.46 change in `advanceLiveRouteMultiActorTick()` is conceptual separation of two observations.

### 4.1 physicalObservation

```text
physicalObservation
```

asks only:

```text
Which authored route boundary did this world-motion segment physically cross?
```

It is not filtered by the current field lock.

### 4.2 legalObservation

```text
observation
```

remains the legal route-progress observation.

If no lock exists, it is the ordinary physical observation.

If a shared lock already exists, it remains narrowed to the locked choice using the existing M6.41 rule:

```text
sharedRouteAllowedTransitionChoiceId(...)
```

Only this legal observation may enter route arbitration and RouteDag mutation.

### 4.3 Why both are needed

If the engine kept only the filtered observation, a later forbidden sibling crossing would look like "nothing happened". That was sufficient to protect RouteDag but insufficient to define gameplay response.

M6.46 therefore observes the physical fact without weakening route legality.

```text
physical fact != legal route progress
```

This distinction is the whole solution. No renderer or physics special case is required.

---

## 5. Explicit violation event

The route tick now may return:

```ts
LiveRouteBranchViolation {
  actorId,
  stageId,
  attemptedChoiceId,
  lockedChoiceId,
  crossingFraction,
}
```

This can arise in two cases.

### 5.1 Same deciding tick

Two actors cross different sibling gates in one physics tick.

Example:

```text
RIVAL crosses RIGHT at u=0.25
PLAYER crosses LEFT  at u=0.75
```

RIGHT wins the shared lock.

The PLAYER route transition is rejected and the PLAYER result carries:

```text
attemptedChoiceId = LEFT
lockedChoiceId    = RIGHT
```

### 5.2 Later tick after lock already exists

RIGHT was locked previously.

A later actor physically crosses LEFT.

The legal observation remains narrowed to RIGHT, so no illegal route candidate enters arbitration. The unrestricted physical observation still detects LEFT and emits the same violation structure.

Thus the existing lock semantics remain strict while the physical response is now defined.

---

## 6. Recovery target authority

M6.46 does not choose a recovery point from screen X, vehicle steering, AI plan or guessed road center.

The already-authorized physical transition gate is the geographic authority.

`lockedBranchRecoveryApproach()` derives:

```text
approachWorldPoint
  = lockedGate.center
  - lockedGate.tangent * recoveryBacktrackDistance
```

The browser/session integration then converts that world point into the currently committed Guide frame:

```text
world approach point
→ locateWorldOnGuideCoordinateGlobal(current frame)
→ supported {s,l}
→ general recovery primitive
```

The traveler observation origin is then resynchronized to the recovered world position so recovery cannot manufacture a route crossing on the next tick.

---

## 7. General recovery is now topology-neutral

While implementing wrong-course recovery, M6.46 found that the pre-existing general recovery path still contained a closed-course assumption:

```text
wrapPositive(lastSafeS - backtrackDistance, guide.length)
```

and required:

```text
CyclicHeightProfile
```

That was inconsistent with the M6.44/M6.45 open-path architecture.

M6.46 removes both dependencies.

Ordinary recovery now uses:

```text
targetS = max(0, lastSafeS - backtrackDistance)
```

The real open start is a real endpoint, not a seam to the path end.

The recovery module accepts:

```text
HeightProfileReader
```

and has no topology operation.

---

## 8. Explicit Guide-coordinate recovery primitive

M6.46 introduces:

```text
recoverM5VehicleToGuideCoordinate(..., {s,l}, reason)
```

This is a general gameplay primitive.

It validates:

```text
s,l finite
0 <= s <= Guide.length
SurfaceMap target is supported
```

Then it applies the same recovery reset semantics:

```text
world position from Guide coordinate
y = HeightProfileReader.samplePhysics(s)
yaw = Guide heading
bounded retained forward speed
vertical/lateral/yaw rates reset
steering reset
support/surface state restored
bike bank state reset when present
```

The primitive knows nothing about branches. `wrong-course` is merely one recovery reason supplied by upper-level gameplay policy.

---

## 9. AI follows an existing lock, but does not create authority

The current DEV rival owns a RIGHT-B route plan as steering intent.

Before a shared lock exists:

```text
route plan
→ sampleLiveRouteChoicePlanTargetL()
→ steering target
```

After a field lock exists on the actor's committed stage:

```text
shared lock choice
→ sampleLiveRouteChoiceTargetL()
→ steering target
```

The purpose is to stop an AI actor from repeatedly steering toward a sibling road that the field has already made illegal.

This does **not** turn steering intent into route authority.

The actual transition remains:

```text
physical gate crossing
→ shared arbitration / legal filtering
→ RouteDag transition
```

---

## 10. Pages fixture

M6.45 temporarily changed the browser DEV fixture to:

```text
rivalCount = 0
```

because the losing-sibling physical policy was undefined.

M6.46 restores:

```text
routeKind            = BRANCHING
rivalCount            = 1
sharedRouteChoiceMode = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy = RECOVER_TO_LOCKED_BRANCH
```

The generic product envelope remains:

```text
0 <= rivalCount <= 16
```

No one-rival assumption is added to route batching, recovery, physics or renderer code.

---

## 11. Renderer/Core boundary

M6.46 does not change:

```text
RasterPath
GuidePath
pseudoDepth = s_render - s_camera
TerrainLine
Painter ordering
M5 renderer
metric sprite scale
camera roll
GroundMap rendering
```

Branch violation geography is gameplay-only.

`src/gameplay/branch-violation.ts` imports no:

```text
physics
render
camera
input
```

The renderer still receives only the selected runtime content and ordinary sprite list.

---

## 12. Direct regression coverage

`tests/m6-46-branch-violation-recovery.test.mjs` adds seven direct regressions:

1. ordinary recovery backtracks to the real open start instead of wrapping;
2. explicit supported Guide recovery can represent `wrong-course`;
3. a later same-tick sibling crossing produces an explicit violation;
4. an already-locked forbidden sibling crossing remains illegal for progress but is physically surfaced;
5. locked-branch approach derives exactly from legal gate center/tangent and lands on supported content;
6. explicit locked choice can replace AI plan steering intent without becoming route authority;
7. branch-violation geometry remains gameplay-only.

Existing regressions also continue to verify:

- deep LEFT and RIGHT route handoffs;
- M6.41 earliest physical crossing semantics;
- M6.42 actor cardinality at 0 and 16 rivals;
- open Raster/Guide/SurfaceMap source rules;
- fixed 2.0m = 80px player metric authority;
- unchanged renderer workload baselines.

Implementation checkpoint result:

```text
GitHub Actions run #433
exact checkout: 3673c0b629b7e2b437aaeca524fd69d735844423
382 tests
382 pass
0 fail
```

---

## 13. Release rule

The implementation-green checkpoint is not by itself the release SHA.

M6.46 release sequence is:

```text
implementation-green feature head
→ version/docs synchronization
→ full CI on exact docs-inclusive head
→ add M6_46_VALIDATION.txt
→ full CI on exact validation-file-inclusive head
→ confirm main has not diverged
→ force=false fast-forward main to that exact validated SHA
```

No merge commit or unvalidated feature SHA may become `main`.

---

## 14. Next architecture direction

M6.46 closes the branch-policy hole without adding closed geometry or renderer branching.

The next cleanup should continue the same direction:

```text
point-to-point integration consumes open primitives
closed/cyclic behavior remains explicitly named
CIRCUIT topology, when implemented, lives above Core
```

Remaining DEV cyclic fixtures should be migrated or isolated only when doing so preserves a simpler architecture; they must not cause cyclic semantics to re-enter the general Raster/Guide/recovery/source interfaces.