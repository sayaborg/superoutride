# M6.42 — Multi-Actor Route Tick Arbitration

## Purpose

M6.41 introduced an optional race/session route-choice authority above independent per-vehicle route transactions. That authority can only be physically correct if every vehicle's world physics for a simulation tick is completed before route choices are arbitrated.

M6.42 makes that order explicit and reusable.

The browser now performs one route transaction phase after all participating actor physics for the 60 Hz simulation tick:

```text
all actor physics
→ observe all actor route-boundary motion
→ arbitrate shared session policy once
→ apply accepted RouteDag transitions
→ queue per-actor PENDING handoffs
→ process per-actor physical handoff seams
→ camera / render
```

The browser still uses `INDEPENDENT` policy. M6.42 proves the transaction order without prematurely choosing `FIRST_PHYSICAL_CROSSING_LOCKS` as the final product rule.

## Generic runtime API

`src/runtime/live-route-multi-actor-tick.ts` owns the batching layer:

```ts
advanceLiveRouteMultiActorTick(
  live,
  sharedRouteChoices,
  actorSamples,
)
```

Each sample contains only:

```text
actor id
LiveRouteTravelerState
current world XZ
optional route-observation suppression bit
```

The module does not import vehicle physics, camera, renderer or input code.

## Two-phase route authority

The important rule is that observation is completed for the entire actor set before any actor `RouteDagState` is mutated.

For every eligible actor M6.42 first calls the existing physical boundary observer using:

```text
previous world XZ → current world XZ
```

The resulting transition candidates are then passed to M6.41 shared-route arbitration once.

Only after that arbitration does M6.42 call `updateRouteDag()` for individual actors.

Therefore a shared-choice result cannot depend on whether player physics or an AI vehicle happened to be evaluated first in JavaScript.

## PENDING and COMMIT remain per actor

M6.42 does not create a session-wide route teleport.

Each accepted actor still follows the existing transaction:

```text
physical transition gate
→ accepted RouteDag transition
→ PENDING
→ old committed package/chart remains active
→ physical handoff seam
→ COMMIT target package/chart
```

A different actor can cross the same seam earlier or later. World position, yaw and velocity remain owned by physics and are not transformed by COMMIT.

## Recovery / resynchronization

A recovery teleport must never manufacture a route transition.

`LiveRouteActorTickSample.observeRouteBoundary` therefore defaults to true but can be set false for a recovery/resync tick.

When false:

- route-boundary validation is suppressed;
- no transition candidate is submitted to M6.41 arbitration;
- existing handoff/chart coordinate synchronization still occurs;
- the actor's next observation origin is updated normally.

This preserves route safety without creating a special recovery path inside RouteDag or renderer code.

## Actor cardinality — no one-rival assumption

The M6.42 runtime API accepts an arbitrary-length actor array. It deliberately contains no `rivalCount`, no fixed two-actor tuple and no literal maximum of 16.

The intended game architecture is:

```text
PLAYER + rivals[0..N]
```

For the current product direction, a game mode may reasonably choose **0 through about 16 rivals**. That number belongs to the future game-mode / roster authoring layer, not to route arbitration.

Examples:

```text
solo / time-attack-like mode → 0 rivals
race mode                   → mode-defined rival count
large field                 → up to the chosen product cap (currently expected around 16)
```

The cap is therefore replaceable without changing route, physics or renderer Core.

M6.42 explicitly validates both current design extremes:

```text
PLAYER + 0 rivals  = 1 actor
PLAYER + 16 rivals = 17 actors
```

Both use the exact same `advanceLiveRouteMultiActorTick()` array path.

The current browser still instantiates one DEV rival only. That is a temporary fixture, not a runtime architectural limit.

## Rendering implication

M6.42 does not change Painter semantics.

Future multiple rivals should each be converted into the existing ordinary dynamic `CourseSprite` path only when their committed runtime package is compatible with the player's rendered package. The renderer itself does not need to know a rival count or race mode.

Conceptually:

```text
runtime/world opponents
→ filter by committed package visibility
→ ordinary CourseSprite[]
→ existing far→near Painter
```

No second opponent renderer and no `if (rivalCount === 16)` path is intended.

## Ranking implication

M6.42 does not define a new route-global ranking metric for competitors on different branches.

The previous closed-course diagnostic ranking remains separate from routed point-to-point authority. A later roster/race-mode milestone must not manufacture cross-route standings from raw local chainage.

## Browser wiring

The current browser now gives both the player and the DEV rival a `LiveRouteTravelerState` and performs both physics updates before one call to `advanceLiveRouteMultiActorTick()`.

The active policy remains:

```ts
createSharedRouteChoiceState('INDEPENDENT')
```

Thus M6.42 changes transaction ordering and generality, not the currently observed branch rule.

## Validation

Structural exact head before documentation synchronization:

```text
e87690d2ba72ce494e9e0fa7549173681eb2f3d5
```

GitHub Actions PR run:

```text
run   32688668066
build 97318267946
353 tests
353 pass
0 fail
```

Dedicated M6.42 coverage includes:

1. simultaneous independent actors can choose different physical branches;
2. shared mode observes all actors before mutation and uses earliest physical crossing;
3. several actors crossing the same winning gate can all advance in one arbitration;
4. batching works unchanged for player + 0 rivals and player + 16 rivals;
5. accepted transition remains PENDING until physical seam COMMIT;
6. COMMIT remains per actor and package/chart-only;
7. recovery-suppressed actor cannot manufacture route progress while another actor advances;
8. single-actor INDEPENDENT batching is state-equivalent to the legacy traveler API;
9. generic batching owns no vehicle-physics, camera or renderer dependency;
10. browser wiring performs both current actor physics updates before its one route arbitration call.

### Intermediate CI failures

The first browser-wired candidate exposed two old milestone static assertions that intentionally described the pre-M6.42 `main.ts` call structure. The underlying route/geometry tests were green.

A subsequent file-update mistake temporarily replaced larger portions of the M6.22/M6.40 fixture files. Those files were restored from current `main`, and only their obsolete browser-layering assertions were changed. No historical geometric, handoff or traveler behavior assertion was removed.

The restored candidate then passed 353/353.

## Frozen renderer / physics authority

M6.42 changes none of the frozen pseudo-3D rules. In particular:

- chainage-only pseudo-depth remains authoritative;
- lateral position never modifies depth;
- one chainage remains one horizontal scanline;
- Renderer Core owns no RouteDag/race-mode/opponent-count decision;
- world X/Y/Z remains physics authority;
- chart COMMIT never teleports world pose;
- fixed player-depth metric scale remains 2.0 m = 80 px.

## Next

**M6.43 — Mode-Aware Opponent Roster.**

Replace the browser's temporary singular DEV `rival` fixture with a deterministic variable-length roster.

The roster/game-mode layer should own the product cap and selected rival count (expected 0..16 for current modes), while each entry owns independent physics/recovery/route/session state. `main.ts` should iterate the roster for physics, M6.42 samples and visible dynamic sprites.

The route tick and renderer must remain cardinality-agnostic.
