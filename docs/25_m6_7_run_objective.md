# M6.7 — Validated Run Objective / Point-to-Point Completion

## Purpose

The current stadium is a closed DEV validation course, but SUPER OUTRIDE is not required to be a lap-racing game. M6.7 separates the geometry/race-progress loop from product run-completion semantics.

The dependency is:

```text
world movement
  -> ordered physical race gates
  -> validated RaceProgressUpdate
  -> Run Objective
```

The objective layer does not inspect raw chainage, world distance, renderer output or vehicle physics internals.

## Objective kinds

```text
POINT_TO_POINT
REPEATABLE_DEV
```

`POINT_TO_POINT` changes from `RUNNING` to `FINISHED` exactly once when a validated update carries an accepted `finish` gate. It records deterministic elapsed simulation time and the validated progress floor at completion.

After terminal completion, later FINISH events are ignored.

`REPEATABLE_DEV` leaves the run in `RUNNING` state and records repeated accepted FINISH boundaries. This preserves the current closed stadium as a convenient regression environment without making repeated laps a product gameplay requirement.

## What cannot finish a point-to-point run

The following are insufficient:

- raw `sLocal` reaching or passing the seam;
- continuous `sProgress` alone;
- an ordinary checkpoint;
- reverse crossing;
- shortcut rejection;
- recovery/resync;
- screen position or visual overlap.

Only the already validated physical FINISH event has completion authority.

## Physics independence

M6.7 contains no handling assumptions. Future changes to car/bike tire model, steering, acceleration, braking, collision or AI do not change run-completion semantics as long as the physical race-gate layer continues to report validated events.

## Validation

```text
153 tests
153 pass
0 fail
```

Validated implementation head:

```text
059efe1a96fd3c77cf3b1fbcbc8827bc73b86834
```

This is the first gameplay layer that explicitly supports a terminal point-to-point run while retaining the closed DEV course only as a repeatable validation fixture.
