# M6.10 — Generic Validated Run Finish

> Current authority note: this document records the M6.10 historical design. The compatibility
> wrapper described below was subsequently removed; current callers consume the generic validated
> finish authority directly.

## Purpose

M6.7 introduced point-to-point completion but its public input was still the closed-course `RaceProgressUpdate` shape. M6.8/M6.9 then introduced a separate route authority chain. M6.10 removes the remaining product-completion dependency on closed-course lap semantics.

The objective now consumes one generic signal:

```text
ValidatedRunFinish {
    source
    id
    validatedProgress | null
}
```

The signal is already validated before it reaches the objective.

## Producers

### Existing closed DEV course

```text
accepted physical race FINISH
→ createValidatedRunFinishFromRace()
→ source = CLOSED_RACE
→ validatedProgress = validatedProgressFloor
```

`updateRunObjective()` remains as a compatibility wrapper, so the current DEV runtime and M6.7 tests do not need to change.

### Routed point-to-point

```text
physical route FINISH gate
→ ValidatedRouteBoundary
→ Route DAG FINISHED
→ createValidatedRunFinishFromRoute()
→ source = ROUTE_DAG
```

A routed finish carries:

```text
validatedProgress = null
```

because the old closed-course `s_progress` space is not meaningful across a future route DAG. M6.10 deliberately does not invent a global numeric metric.

## Objective authority

`updateRunObjectiveFromValidatedFinish()` is the generic consumer.

For `POINT_TO_POINT`:

- null finish: remain RUNNING
- first validated finish: FINISHED exactly once
- later validated finishes: ignored
- store deterministic elapsed time, source and finish ID

For `REPEATABLE_DEV`:

- each validated finish remains a repeatable boundary
- no product completion is created

## End-to-end routed proof

The M6.10 regression executes this full chain:

```text
world movement crosses S1 branch gate
→ Route DAG chooses STAGE_2_R
→ world movement crosses S2 branch gate
→ Route DAG enters GOAL_RL
→ entering terminal alone does not finish
→ world movement crosses GOAL_RL physical FINISH
→ Route DAG becomes FINISHED
→ generic ROUTE_DAG finish signal
→ POINT_TO_POINT becomes FINISHED
```

No `RaceProgressUpdate` and no lap counter participates in that completion path.

## Renderer / physics impact

None.

Vehicle physics remains `DEV_UNCALIBRATED`.
Renderer Core remains the same chainage-driven raster renderer.

## Validation

PR #20, Actions run 32615768243:

```text
171 tests
171 pass
0 fail
```

See `M6_10_VALIDATION.txt`.

## Next

The route gameplay path can now select and finish independently from the closed DEV race path. The next safe architectural step is to bind each Route DAG node to a stage/course-content descriptor, without changing the renderer's single-active-course assumption. Runtime stage switching should choose one complete renderer course/content package at a validated route transition rather than make the renderer itself understand a DAG.
