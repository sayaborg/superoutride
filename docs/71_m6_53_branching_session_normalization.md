# M6.53 BRANCHING Session Authority Normalization

## 0. Status

M6.53 removes the historical closed-course progress tracker from the BRANCHING browser
composition after M6.52 made `FieldRouteProgress` the complete shared-route progress and ranking
authority.

Vehicle handling remains `DEV_UNCALIBRATED`. This milestone changes neither handling architecture
nor product-feel values.

---

## 1. Problem

Before M6.52, the browser used the original closed stadium `RaceProgress` for standings. M6.52
correctly replaced that with continuous finite `FieldRouteProgress`, but the old tracker remained
in `src/main.ts` for player and rival timing support.

That residual state was valid only while an actor occupied the parent stage. It stopped observing
progress after the first child-chart COMMIT and required special resync branches around recovery
and wrong-branch handling. It no longer owned any visible result.

Keeping it would leave two progress models in one composition:

```text
current RouteDag + FieldRouteProgress authority
+ historical parent-only closed-course diagnostic
```

The second model was redundant and could drift back into product behavior later.

---

## 2. Architecture decision gate

1. RouteDag owns route transitions and physical terminal FINISH validation.
2. `FieldRouteProgress` owns continuous shared-route progress and ranking.
3. `RunObjective` owns point-to-point completion and its accepted finish time.
4. `RaceSession` already provides a topology-neutral fixed-step elapsed clock.
5. No new abstraction, coordinate state, route branch or lower-layer special case is required.

The normalized composition is:

```text
fixed simulation dt --------------------------> RaceSession elapsed time
physical route gate + RouteDag ---------------> route/FINISH validation
RouteDag + explicit seams + Guide charts -----> FieldRouteProgress
validated RouteDag FINISH + elapsed time ------> RunObjective
FieldRouteProgress ----------------------------> ranking
```

`RaceSession` receives the already-valid `FieldRouteProgress` view and no gate event in the
BRANCHING composition. Its circuit checkpoint/lap timing capability remains unchanged for the
CIRCUIT composition.

---

## 3. Removed duplicate state

The BRANCHING composition no longer constructs or updates:

```text
M6 debug closed-course rules
GeometricCourseTracker
player RaceProgress
rival RaceProgress
rival RaceSession
parent-stage-only race update/resync branches
```

Parent-stage visual diagnostics such as background selection and junction phase remain ordinary
presentation observations. They are not race authority and are named accordingly.

---

## 4. Timing transaction

Each fixed physics tick now performs:

```text
advance ordinary world physics
-> validate/apply route transaction
-> update FieldRouteProgress
-> advance RaceSession by SIM_DT
-> if RouteDag emitted validated terminal FINISH,
   record RunObjective finish at RaceSession.elapsedSeconds
```

The finish timestamp therefore comes from one deterministic simulation clock. Continued DEV
simulation after FINISH cannot overwrite the point-to-point result.

---

## 5. Regression contract

Automated coverage proves:

- point-to-point elapsed time advances without a closed-course gate tracker;
- a validated RouteDag finish records the exact fixed-tick time and numeric validated progress;
- continued DEV simulation does not rewrite the accepted finish time;
- the BRANCHING composition imports no `race-progress` authority;
- only one `RaceSession` clock is created by that composition;
- browser timing consumes `FieldRouteProgress` and the RunObjective consumes that same clock;
- the M6.52 first fork, recovery, second fork, COMMIT continuity, ranking and terminal FINISH
  integration remains green.

Human Pages validation should confirm:

1. TIME remains continuous before and after both forks;
2. recovery and chart COMMIT do not reset or jump TIME, progress or position;
3. terminal FINISH displays one stable finish time;
4. ranking continues to use the shared selected route;
5. car and motorcycle remain drivable with handling explicitly uncalibrated.
