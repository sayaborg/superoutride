# M9.1 Mobile Touch Selectors

Status: current browser touch-selection authority above unchanged course composition, vehicle
physics, input, renderer and topology layers.

This document extends the M8.3/M9.1 browser presentation with tappable course and vehicle
selectors. It does not replace the canonical `1/2/3` course mapping or the
`Q/W/E/R/A/S -> FR/MR/RR/AWD/BIKE1/BIKE2` vehicle mapping.

## 1. Architecture decision gate

1. Touch selector presentation belongs to the browser composition layer.
2. `BROWSER_COURSE_MODES` and `BROWSER_VEHICLE_PROFILES` already own every selectable value;
   button labels and callbacks derive from those arrays.
3. The touch UI stores no second course, profile, vehicle or world-state authority. Its active
   class and `aria-pressed` value are presentation state only.
4. Course taps call the same top-level URL-composition transition as `1/2/3`. Vehicle taps call
   the same composition-owned safe-spawn reconstruction as `Q/W/E/R/A/S`.
5. No renderer, physics, route, topology, camera, gameplay or DEV-fixture branch is added.
6. World-state, open-Core, chainage-depth, metric presentation and race-progress invariants are
   unchanged.
7. Regression proves authority-derived buttons, exact tap publications, one active presentation
   state and shared use by all three composition roots.

## 2. Browser boundary

```text
BROWSER_COURSE_MODES
        -> generated 1 / 2 / 3 buttons with full accessible route names
        -> boot URL selection

BROWSER_VEHICLE_PROFILES
        -> generated FR / MR / RR / AWD / BIKE1 / BIKE2 buttons
        -> composition-owned safe-spawn reconstruction
```

The adapter does not synthesize keyboard events. Keyboard and taps converge at the existing
selection functions, so neither input path can drift into a separate mapping.

Course selection remains a normal top-level navigation. Vehicle selection preserves the current
safe-spawn rule: it reconstructs the chosen compiled profile after ordinary recovery and does not
convert live mechanics or manufacture route/race progress.

## 3. Touch layout

Touch layout is enabled by touch hardware, a coarse primary pointer, or a `<= 720 px` viewport
short-side fallback for embedded phone browsers that omit pointer metadata. The decision is shared
by LINEAR, BRANCHING and CIRCUIT and is independent of portrait/landscape orientation.

Every selector button has a minimum `44 x 44 px` hit area. Portrait places the two selector rows
above the 320x240 game view; landscape places course and vehicle groups in one top row above the
ordinary steering/game/pedal columns. The existing steering and exclusive throttle/brake touch
controls remain unchanged.

The selected button uses both visible active styling and `aria-pressed=true`. Course and vehicle
groups and every generated button have explicit accessible names.
