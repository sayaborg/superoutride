# M6.41 — Shared Route Choice Authority

## Purpose

M6.40 gave the player and rival independent `RouteDagState` / handoff state so each actor can physically traverse the same immutable live route assembly without renderer-side route logic.

A possible product rule, inspired by Cool Riders, is different from fully independent branching:

> At each real fork, the first vehicle to physically cross one branch gate determines the route for the race field. Every trailing vehicle must then take that same branch.

M6.41 adds the gameplay authority needed for that rule **without committing the browser product behavior to it yet**.

The current browser remains equivalent to M6.40 (`INDEPENDENT`). The new shared mode is a policy that can be enabled later after the multi-actor browser tick is arranged as an explicit observe → arbitrate → apply transaction.

## Architectural rule

Actor route transactions remain independent:

```text
actor world motion
→ physical route gate observation
→ accepted RouteDag transition
→ PENDING
→ physical handoff seam
→ COMMIT actor chart/package
```

M6.41 does not replace that mechanism with a session-wide teleport or direct route-state rewrite.

Instead, one race/session object may constrain which authored transition gate is legal after a fork has been decided:

```text
SharedRouteChoiceState
  stageId → locked choiceId + actorId that first crossed
```

The renderer, camera, input layer and vehicle physics do not participate in the choice authority.

## Policy modes

`src/gameplay/shared-route-choice-authority.ts` defines two modes:

```ts
'INDEPENDENT'
'FIRST_PHYSICAL_CROSSING_LOCKS'
```

### `INDEPENDENT`

This exactly preserves the M6.40 semantic: two actors may physically select sibling branches and no shared lock is stored.

### `FIRST_PHYSICAL_CROSSING_LOCKS`

Only a route stage with more than one outgoing choice consumes shared-choice state.

A deterministic one-successor continuation such as:

```text
STAGE_2_R → STAGE_3_R
```

remains an ordinary per-actor physical route transaction and does not create a meaningless lock.

## What determines the winning branch

The winner is not:

- the actor updated first by JavaScript;
- screen X;
- steering input;
- a preselected AI route intention;
- raw stage-local chainage;
- sprite overlap.

The winner is the actor whose **validated physical transition-gate intersection happens first within the authoritative physics tick**.

M6.41 exposes the already-computed segment/gate intersection parameter:

```text
crossingFraction = u ∈ [0,1]
```

from `observeRouteBoundaryCrossing()`.

For two different sibling choices observed in the same 60 Hz tick, the smaller `u` wins.

This means race result does not depend on whether the player or rival code happened to be called first that frame.

### Exact simultaneous crossing

If two candidates have the same `u` within the M6.41 epsilon, the supplied candidate order is used only as the final deterministic tie-break.

The intended browser caller can supply its already-established race order from the start of that tick. Thus a mathematically simultaneous crossing can follow the current leader without introducing an arbitrary actor-ID rule.

## Same winning gate in one tick

If several actors cross the **same winning physical branch gate** during that tick, they are all accepted.

Example:

```text
A crosses RIGHT at u=0.20
C crosses LEFT  at u=0.40
B crosses RIGHT at u=0.70
```

The race locks RIGHT. A and B have physically crossed the chosen gate and may advance. C's individually valid sibling crossing is rejected by session authority.

This avoids an artificial one-vehicle-only winner transaction.

## Later trailing vehicles

After a lock exists, authored gate geometry remains unchanged. The route boundary observer receives an optional allowed transition choice:

```ts
observeRouteBoundaryCrossing(
  route,
  actorRouteState,
  gateSet,
  previousWorldXZ,
  currentWorldXZ,
  lockedChoiceId,
)
```

Only that choice is considered a legal transition candidate for the branching stage.

The forbidden sibling road still exists visually and physically as authored terrain, but crossing its route-gate geometry no longer generates a route transition for this race session.

This is intentionally an observation-policy restriction, not a mutation of the compiled route/gate authoring.

It also avoids a large physics segment becoming `AMBIGUOUS_FORWARD_CROSSING` merely because it intersects both the chosen and now-forbidden sibling gate.

## Gate observation addition

`RouteBoundaryObservation` now includes:

```ts
readonly crossingFraction: number | null;
```

- unique forward transition: physical `u`;
- unique forward FINISH: physical `u`;
- reverse crossing: physical `u`;
- none / ambiguous forward crossing: `null`.

Existing callers need no change because the new allowed-choice argument is optional and defaults to `null`.

## Why this remains compatible with M6.40

M6.40's independent `LiveRouteTravelerState` remains useful even if shared route selection becomes the product rule.

The separation is:

```text
Race/session
  SharedRouteChoiceState
       ↓ constrains legal branch choice

Actor A LiveRouteTravelerState
Actor B LiveRouteTravelerState
Actor C LiveRouteTravelerState
       ↓ each still performs its own
physical gate → PENDING → seam → COMMIT
```

Therefore each vehicle retains independent physical position, timing of gate crossing, PENDING interval, seam crossing and chart rebase.

Only the permitted branch identity is shared.

## Renderer and pseudo-3D authority

M6.41 changes none of the frozen renderer rules:

- pseudo-depth remains signed chainage difference only;
- no lateral depth correction;
- one chainage maps to one scanline;
- Raster vertex turn limit remains 10°;
- no route identity enters renderer Core;
- no polygon road / z-buffer / perspective-correct texture;
- COMMIT still does not transform world pose or velocity.

## Validation

Structural validated head before documentation synchronization:

```text
ab53555f389e7f5456b935abfff10b1f28cdb105
```

GitHub Actions:

```text
run      32672424569
build    97275141305
343 tests
343 pass
0 fail
```

M6.41 adds eight regressions:

1. physical gate observation exposes exact sub-tick crossing fraction;
2. `INDEPENDENT` preserves divergent M6.40 actor choices;
3. earliest physical crossing wins instead of actor update order;
4. exact simultaneous crossing uses supplied race order only as final tie-break;
5. all same-winning-gate crossings in the tick are accepted while sibling choice is rejected;
6. an existing lock narrows later physical gate observation without mutating authored geometry;
7. deterministic single-successor stages consume no shared lock;
8. shared authority imports only the RouteDag gameplay layer and no renderer/camera/input/vehicle physics.

The first M6.41 PR run reached 342/343; the only failure was an over-broad static test regex matching the English word `input` in a comment. The dependency test was corrected to inspect actual import specifiers. No gameplay implementation or requirement was weakened.

## Browser status

M6.41 intentionally **does not enable shared locking in `main.ts`**.

Current browser semantics remain:

```text
player route traveler: independent
rival route traveler:  independent
```

This preserves current behavior while keeping the potential Cool Riders-style rule available as a clean session policy.

## Next

A useful next milestone is **M6.42 — Multi-Actor Route Tick Arbitration**.

It should restructure the browser route portion of one 60 Hz tick into:

```text
physics updates
→ collect each actor's physical route-boundary observation
→ arbitrate optional shared race policy once
→ apply accepted actor transitions
→ observe/apply handoff seams
→ camera / renderer
```

The browser can still run the policy in `INDEPENDENT` mode initially. This proves the correct two-phase multi-actor transaction before deciding whether `FIRST_PHYSICAL_CROSSING_LOCKS` becomes the actual game rule.
