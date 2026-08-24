# M6.43 — Course Mode / Rival Roster Foundation

## Purpose

M6.42 made one simulation tick route-cardinality agnostic: the route layer accepts a variable actor list after every actor has finished world physics.

M6.43 moves two product decisions above that generic runtime:

1. a course may eventually be one of three route structures;
2. a game mode chooses the number of rivals, currently allowed from 0 through 16.

The renderer, vehicle physics and generic route tick must not acquire special branches for either decision.

## Three course route structures

`src/gameplay/course-mode.ts` defines:

```text
LINEAR
BRANCHING
CIRCUIT
```

### LINEAR

A long single point-to-point route.

```text
START ─────────────────────────→ FINISH
```

Current authority family:

```text
routeAuthorityKind = POINT_TO_POINT_GRAPH
finishKind         = POINT_TO_POINT
shared choice      = INDEPENDENT
```

The point-to-point graph can trivially represent a chain with no forks.

### BRANCHING

An Out Run-style point-to-point route containing physical forks.

```text
             ┌────────→ ...
START ───────┤
             └────────→ ...
```

Current authority family:

```text
routeAuthorityKind = POINT_TO_POINT_GRAPH
finishKind         = POINT_TO_POINT
shared choice      = FIRST_PHYSICAL_CROSSING_LOCKS
```

This uses the existing acyclic RouteDag / gate / handoff infrastructure.

### CIRCUIT

A future lap-based closed route.

```text
       ┌─────────────────┐
START ─┘                 └─↺
```

M6.43 reserves a distinct authority identity:

```text
routeAuthorityKind = CIRCUIT_LOOP
finishKind         = LAPS
```

This is deliberately **not** implemented by weakening RouteDag's acyclic invariant.

The existing point-to-point RouteDag remains a DAG. A future circuit runtime may reuse common physical gate / progress / package primitives where appropriate, but lap topology will be owned by a circuit-specific authority rather than by inserting cycles into a structure whose semantics are intentionally terminal and acyclic.

## Branching product rule is now fixed

For `BRANCHING`, the route-field rule is no longer merely optional:

> At each real fork, the first vehicle to physically cross one sibling branch gate determines the branch for the race field.

The already-existing M6.41/M6.42 mechanism supplies the authority:

```text
all vehicle physics for tick
→ observe all physical branch-gate crossings
→ compare sub-tick crossingFraction u
→ earliest physical crossing wins
→ store shared branch lock
→ each accepted vehicle still performs its own PENDING → seam → COMMIT
```

JavaScript update order, steering direction, screen X, sprite overlap and AI route intent cannot decide the branch.

If several vehicles physically cross the same winning gate during the deciding tick, all of those crossings are accepted. A sibling crossing during that tick is rejected by shared route authority.

## What happens on the forbidden sibling road remains undecided

Branch selection authority and wrong-branch physical response are separate concerns.

M6.43 records:

```text
branchViolationPolicy = UNDECIDED
```

Possible future behaviors include, but are not limited to:

```text
invisible / physical barrier
WRONG COURSE warning + forced recovery
other authored redirection
```

M6.43 intentionally implements none of them. The losing sibling road therefore must not be deleted from renderer/terrain authoring merely because the route choice is locked.

This keeps the product decision reversible without changing how the winning route is determined.

## Rival cardinality authority

`CourseModeAuthoring.rivalCount` owns opponent count.

Current validated product envelope:

```text
0 <= rivalCount <= 16
integer only
```

The literal 16 belongs only to the mode-authoring validation boundary:

```text
MAX_RIVAL_COUNT = 16
```

It does **not** belong in:

- `advanceLiveRouteMultiActorTick()`;
- vehicle physics;
- route traveler state;
- renderer Core;
- Painter ordering.

Those layers consume variable-length collections.

## Rival roster

`src/runtime/rival-roster.ts` compiles stable actor identities from the selected mode:

```text
rivalCount = 0
→ []

rivalCount = 3
→ RIVAL_01, RIVAL_02, RIVAL_03

rivalCount = 16
→ RIVAL_01 ... RIVAL_16
```

There is no `null rival` special case.

The roster owns only identity/cardinality. It does not own:

- physics model;
- spawn geometry;
- AI route plan;
- recovery;
- camera;
- renderer state.

## Browser migration from one rival to `rivals[]`

The current DEV mode remains visually equivalent to the previous fixture:

```text
routeKind  = BRANCHING
rivalCount = 1
```

However, `main.ts` no longer treats that vehicle as a singular architectural `rival`.

It now builds a roster and iterates the resulting `rivals[]` through:

```text
ordinary M5 car physics
AI input
recovery
race progress/session
LiveRouteTravelerState
M6.42 multi-actor arbitration
per-actor handoff COMMIT
package-compatible dynamic CourseSprite generation
standings
```

With zero rivals, those loops are empty. With sixteen rivals, the same paths execute sixteen times.

The current one-rival DEV count is therefore content/configuration, not an engine limit.

## Current browser branch behavior

Because the current DEV course mode is `BRANCHING`, `main.ts` now constructs:

```text
createSharedRouteChoiceState(
  M6_43_DEV_COURSE_MODE.sharedRouteChoiceMode
)
```

and the derived mode is:

```text
FIRST_PHYSICAL_CROSSING_LOCKS
```

This changes the M6.41/M6.42 browser fixture from independent branch choice to the now-selected product rule while reusing the exact same shared-route authority implementation.

## Preserved invariants

M6.43 changes none of the frozen renderer mathematics:

- world X/Y/Z remains physics authority;
- pseudo-depth remains signed chainage difference only;
- no Euclidean/camera-Z/lateral depth correction;
- same depth means same scale;
- one chainage maps to one horizontal scanline;
- Raster vertex turn limit remains 10°;
- Guide remains coordinate/camera support;
- Terrain + World Sprite use one far-to-near Painter;
- no z-buffer / polygon road / perspective-correct texture;
- no arbitrary runtime sprite rotation;
- no alpha blending;
- camera roll remains zero.

Route/handoff authority also remains unchanged:

```text
physical gate
→ validated transition
→ PENDING
→ physical seam
→ COMMIT chart/package
```

COMMIT does not transform world pose, yaw or velocity.

## Validation targets

M6.43 adds six dedicated regressions:

1. `LINEAR / BRANCHING / CIRCUIT` remain distinct route structures;
2. BRANCHING derives first-physical-crossing field locking while wrong-branch response stays `UNDECIDED`;
3. rival count validates the full integer 0..16 envelope;
4. roster produces stable variable-length actor identities with no null special case;
5. current browser consumes a one-rival roster and enables field-wide branch locking from mode authority;
6. CIRCUIT extensibility does not weaken acyclic RouteDag or enter renderer Core.

Together with the existing M6.42 0-rival/16-rival batching regression, these tests separate product cardinality from generic engine cardinality.
