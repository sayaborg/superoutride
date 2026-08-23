# M6.8 — Gameplay-only Validated Route DAG

## Purpose

Core Design Freeze §0.1 explicitly excludes `branch / route DAG` from renderer Core and permits it in gameplay / race-rule specifications. M6.8 therefore adds route progression without changing the single closed-course renderer model.

## Authority split

```text
world-space physical route gates (future)
            ↓ validated boundary event
        Route DAG
            ↓
active stage / chosen route / terminal outcome
```

The Route DAG does **not** inspect:

- steering input
- screen X
- sprite position
- raw `s_car`
- renderer pseudo-depth

Those values cannot choose a route.

## Topology

`compileRouteDag()` validates an authored directed acyclic graph.

Hard validation:

- unique non-empty stage IDs
- unique non-empty choice IDs
- all choice endpoints exist
- no self-loop
- terminal stage has no outgoing choices
- non-terminal stage has at least one outgoing choice
- no cycle
- every authored stage/choice is reachable from the start stage

The current DEV graph is intentionally small:

```text
                 ┌─ STAGE_2_L ─┬─ GOAL_LL
STAGE_1 ─────────┤              └─ GOAL_LR
                 └─ STAGE_2_R ─┬─ GOAL_RL
                                └─ GOAL_RR
```

This proves route-selection semantics only. It does not assert that the current renderer course already contains these physical branches.

## Runtime state

```text
RouteDagState {
    activeStageId
    status
    visitedStageIds[]
    selectedChoiceIds[]
    acceptedTransitionCount
    rejectedBoundaryCount
    finishStageId
}
```

A `TRANSITION` is accepted only when its authored edge leaves the current active stage. Stale events or attempts to skip directly to a later stage are rejected.

Entering a terminal stage is not itself completion. A separate validated `FINISH` boundary for that terminal stage is required.

This preserves the same design principle already used by M6.0–M6.7: topology and raw coordinates never manufacture gameplay progress; physical validation must happen first.

## Relationship to renderer

No renderer change was made.

The Core renderer remains:

```text
single forward-only closed course
chainage pseudo-depth
one chainage → one scanline
```

Future OutRun-style stage routing is a gameplay layer above individually renderable course/stage content, not a reason to turn the renderer into a general 3D road graph.

## Validation

PR #18, Actions run 32615446209:

```text
159 tests
159 pass
0 fail
```

See `M6_8_VALIDATION.txt`.

## Next

M6.9 should provide the missing producer for `ValidatedRouteBoundary`: a minimal world-space route-boundary gate validator. It must detect actual physical crossing of authored branch/finish gates and must remain independent from sprite pixels, screen position and final vehicle handling parameters.
