# M6.52 Shared Field Route Progress

## 0. Status

M6.52 completes route-aware progress and ranking for the BRANCHING browser composition.

The governing product rule is:

```text
FIRST_PHYSICAL_CROSSING_LOCKS
-> every legal field vehicle follows the same selected route
-> ranking compares vehicles only on that shared route
```

M6.52 therefore does not define a metric between different sibling routes. A losing sibling
crossing remains illegal route progress and is handled by the existing
`RECOVER_TO_LOCKED_BRANCH` policy.

Vehicle handling remains `DEV_UNCALIBRATED`. This milestone changes neither handling architecture
nor product-feel tuning.

---

## 1. Problem

Before M6.52 the BRANCHING browser still ranked player and rivals with the historical closed parent
course `RaceProgress`. That diagnostic stopped updating after the first child-chart COMMIT.

Consequences included:

- standings freezing after the first fork;
- no meaningful numeric route finish progress;
- chart-local chainages being incomparable across PENDING/COMMIT boundaries;
- recovery and a later second fork having no single ranking contract.

The RouteDag already owned route identity and physical validation. The missing authority was one
continuous scalar for the selected field route.

---

## 2. Architecture decision

M6.52 adds one gameplay progress authority:

```text
RouteDag
+ physical route/FINISH gates
+ explicit StageContinuationLink seam coordinates
+ stage Guide charts
        |
        v
finite FieldRouteProgressRules
        |
        v
bounded per-actor FieldRouteProgressState
        |
        v
existing rankRaceProgress consumer
```

It does not add:

- route identity to the scalar;
- a second route-choice state;
- renderer, camera or vehicle-physics branches;
- course-length modulo or wrapping;
- comparison between different sibling routes;
- a BRANCHING special case below gameplay/runtime composition.

Sibling physical route gates leaving one stage must compile to the same progress boundary. This is
mechanically enforced because the shared field lock makes sibling identity irrelevant to ranking at
that decision plane.

---

## 3. Finite open ruler

Each stage chart owns ordinary open local chainage `s_stage`. Compilation assigns one translation:

```text
s_progress_geometric = stageOffset + s_stage
```

For a transition from source chart A to target chart B, the existing validated continuation link
defines:

```text
stageOffset_B + targetSeamS
=
stageOffset_A + sourceSeamS
```

The seam is therefore the sole chart-rebase authority. Route choice still belongs only to the
physical gate plus RouteDag.

All reachable stages are compiled into one finite set of ordinary rules. A merge is accepted only
if all incoming links derive the same target offset. No hidden wrap or route-specific lower-layer
logic is introduced.

---

## 4. Physical validation window

Each actor owns:

```text
validatedProgressFloor
sProgress
previousGeometricProgress
```

Raw chart motion contributes only a frame-to-frame interpolation delta. The continuous value is
always clamped to:

```text
[last physically validated route boundary, next required physical boundary]
```

Therefore raw chart chainage cannot manufacture a route transition or FINISH.

The transaction sequence is:

```text
before route gate
  current stage boundary is the ceiling

physical route gate crossing
  RouteDag accepts selected choice
  validated floor advances to that gate
  handoff becomes PENDING

PENDING overlap
  old chart/content remain authoritative
  progress continues on the same finite ruler

physical handoff seam crossing
  COMMIT maps the same world pose into the target chart
  stage offset preserves the progress value

recovery/resync
  geometric observation origin resets
  validated floor and sProgress are preserved

physical FINISH
  floor and progress advance to the terminal boundary
  numeric validated progress is supplied to RunObjective
```

---

## 5. Handoff ambiguity fix

While adding the progress regression, the current second-stage sequence exposed an existing chart
handoff defect: `handoffGuideChart` used an unconstrained global nearest projection at COMMIT. An
open Guide may pass near the same world point later in its runout, so a two-metre seam crossing could
select a distant target segment and jump local chainage by hundreds of metres.

M6.52 does not add a stage-specific correction. It preserves the already-compiled
`StageContinuationLink` coordinates through declarative authoring and the handoff manifest:

```text
sourceSeamS / sourceLocalL
targetSeamS / targetLocalL
```

COMMIT now initializes its local source search at the explicit source seam, then applies the
validated continuation translation to the target chart. World X/Y/Z, yaw and velocity remain
untouched.

This removes ambiguous global projection from chart COMMIT and makes the same primitive work for:

- the first fork;
- ordinary continuation stages;
- both second forks;
- player and rival travelers.

---

## 6. Regression contract

M6.52 coverage proves:

- every compiled handoff is progress-invariant at its explicit source/target seam;
- sibling gates share one field progress boundary;
- inconsistent sibling progress authoring is rejected;
- first-fork winner/loser arbitration advances only the legal route;
- wrong-branch recovery preserves progress without manufacturing a transition;
- PENDING and COMMIT introduce no chart-rebase ranking jump;
- the same sequence remains valid at the right-side second fork;
- the field route histories are identical before ranking;
- physical terminal FINISH produces final validated numeric progress;
- browser standings consume field-route progress rather than the frozen parent diagnostic;
- gameplay progress and handoff layers remain independent of renderer, camera, physics and DEV
  fixture modules.

Human Pages validation should confirm:

1. position and `YOU` progress keep changing after the first fork;
2. no large progress jump appears at a chart COMMIT;
3. a losing sibling recovers to the locked route without acquiring illegal route progress;
4. ranking continues through the second fork and terminal run;
5. both car and motorcycle remain drivable, with feel still explicitly uncalibrated.
