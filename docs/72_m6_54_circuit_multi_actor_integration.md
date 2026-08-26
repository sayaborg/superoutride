# M6.54 CIRCUIT Multi-Actor Integration

## 0. Status

M6.54 adds one ordinary physical rival to the public three-lap CIRCUIT DEV composition and
completes live multi-actor progress, timing, ranking and rendering across the finite unfolded
runtime window.

This supersedes the scoped statement in the migration handoff that the current public circuit is
solo. It does not establish final product rival count, grid placement, AI difficulty, collision
rules or final circuit content.

Vehicle handling remains `DEV_UNCALIBRATED`.

---

## 1. Architecture decision gate

The existing authorities are sufficient:

```text
CourseMode                    rival cardinality
finite CircuitRuntimeWindow  one ordinary open Guide/content domain
M5 car physics               independent world-space actor motion
CircuitRaceProgress          independent validated checkpoint/lap progress
RaceSession                  independent fixed-step gate/lap timing
rankRaceProgress             field standings
CourseSprite + Painter       rival presentation
```

M6.54 adds no circuit-specific path to physics, camera or renderer. It adds no RouteDag, shared
branch lock, modulo, winding-based lap counter or second coordinate authority.

The current DEV composition is:

```text
M6_54_DEV_COURSE_MODE
  routeKind  = CIRCUIT
  rivalCount = 1

player + roster actor
        |
        v
same finite open runtime window
        |
        +--> ordinary world physics
        +--> per-actor CircuitRaceProgress
        +--> per-actor RaceSession
        +--> existing CourseSprite/Painter
        |
        v
rankRaceProgress
```

---

## 2. Actor ownership

Every actor owns exactly one:

```text
world-space vehicle state
recovery state
CircuitRaceProgressState
RaceSessionState
```

The browser composition iterates the roster. Rival AI emits only ordinary `DrivingInput`; it does
not write world pose, window chainage, lap state or renderer state.

Recovery resynchronizes only the actor's physical observation origin. It cannot award or erase a
checkpoint, lap or finish timing.

---

## 3. Circuit standings

While competitors are running, the established ordering remains:

```text
continuous validated sProgress
-> validatedProgressFloor
```

After multiple competitors reach identical terminal progress, that pair alone requires one more
non-arbitrary key:

```text
already-validated terminal FINISH elapsed time, earlier first
```

`RaceSession` already records that time from the accepted physical final FINISH. Ranking consumes
the recorded value; it does not infer completion from geometry, topology winding or wall clock.

Callers without a validated terminal finish time retain the previous true-tie behavior. BRANCHING
ranking is therefore unchanged.

---

## 4. DEV product boundary

The current one-rival mode and its simple start offset are integration fixtures, not final game
authority. M6.54 intentionally does not decide:

- final circuit field size;
- starting-grid layout;
- vehicle-to-vehicle collision;
- AI difficulty or product race balance;
- final circuit course/art content;
- calibrated car or motorcycle feel.

Vehicle collision remains deferred until the vehicle-physics design and body dynamics are reviewed.

---

## 5. Regression contract

Automated coverage proves:

- current CIRCUIT mode compiles exactly one stable rival roster entry;
- both actors independently validate the complete ordered three-lap gate sequence;
- recovery/resync manufactures no progress or lap;
- each actor records three physical FINISH boundary timings;
- equal terminal progress is ordered by validated final FINISH time;
- unfinished saturated progress remains behind physically validated progress;
- the browser uses the existing rival driver, car physics, circuit progress, race session, dynamic
  sprite and Painter paths;
- the CIRCUIT composition contains no point-to-point route authority;
- BRANCHING exact ties remain ties when no validated terminal time is supplied;
- all M6.48-M6.53 topology, seam, recovery, ranking and browser regressions remain green.

Human Pages validation should confirm:

1. one rival is visible and physically drives the same circuit window;
2. player position changes continuously relative to the rival;
3. neither vehicle duplicates, wraps or jumps at an internal lap seam;
4. checkpoint/lap progress and ranking survive manual recovery;
5. three-lap finish order remains stable after both vehicles finish;
6. the extra ordinary open runout remains live;
7. car and motorcycle handling still carry the explicit `DEV_UNCALIBRATED` status.
