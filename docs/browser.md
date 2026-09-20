# Browser

This document owns browser composition, scheduling, course selection, Session URL controls, HUD
presentation and device input adaptation. [Content and gameplay](content-and-gameplay.md) owns
Session rules, clocks, progress, loading admission and recovery. [Audio](audio.md) owns audio lifetime
and its DEV panels; [Calibration](calibration.md) owns calibration values and selectors. Those
contracts remain at their owners rather than being duplicated here.

## Boot and composition

The HTML entry resolves the build containing [boot](../src/boot.ts); [Development](development.md)
owns commit-versioned delivery and fallback. Boot selects the course, mounts its selector, isolates
DEV keyboard events and owns full-page course navigation. It imports the selected composition entry;
every current course uses `main-course.js`.

The [driving composition](../src/main-course.ts) loads saved course and image inputs, compiles the
graph, preflights the ground manifest before acquiring its payload, and resolves Session settings,
vehicle and required time budgets. It assembles the shared scene, race and browser shell only after
successful admission. Loading failure leaves a visible status and Retry action; no partial driving
Session starts. Course loading invariants belong to [Content and gameplay](content-and-gameplay.md#course-loading).

The [shell](../src/browser/driving-shell.ts) owns the canvas, reusable framebuffer, input adapters,
player/recovery instance, camera rig, audio lifecycle and presentation wiring. Route decisions, field
advancement and race state are supplied by the composition and Runtime, not another browser physics
loop. The logical canvas is 320x240 with smoothing disabled. Camera observation and recovery
resynchronization use the shared [driving lifecycle](../src/browser/driving-lifecycle.ts).

## Frame progress and lifecycle

The [frame loop](../src/browser/frame-loop.ts) accumulates nonnegative wall-clock elapsed time,
capped at 0.25 seconds per animation callback. Simulation always receives the fixed `1/60` second
step. Fractional remainder carries to the next callback; one render follows the completed steps,
including callbacks with no simulation step. Generation checks reject stale callbacks and stop
further catch-up or rendering when the loop stops during a tick.

Starting the shell retires its previous scheduler, resumes input/audio, renders immediately and starts
a fresh scheduler with zero accumulated time. Loading and Session setup do not advance the race clock
before START. Manual PAUSE and document hiding stop scheduling/audio and suspend input. Returning to a
visible document resumes only a READY or RUNNING Session that is not manually paused. RESUME starts a
fresh clock, without simulating the pause interval or restoring held input. Gameplay owns the meaning
of START, GOAL, GAME OVER and accepted event times.

Completion stops the field and input, hides PAUSE and retains the result. NEW SESSION reloads setup.
Page hiding stops the shell; a persisted page restored from browser history reloads rather than
reviving its previous graph. These lifecycle rules do not replace the separate audio gesture and
failure/retry contract in [Audio](audio.md).

## Selection and URL parameters

[Course selection](../src/browser/course-mode-selection.ts) owns the query/label/key mapping:
`linear` / LINEAR / 1, `seam` / SEAM / 2, `circuit` / CIRCUIT / 3 and `branch` / BRANCH / 4.
Both digit-row and numeric-keypad shortcuts work; repeated keydown is ignored. Missing or unknown
`mode` selects the first registered course, currently LINEAR. Selecting the active course is a no-op.
Selecting another course preserves the URL except that it changes `mode` and deletes `session`,
`vehicle`, `rivals`, `laps`, `clock` and `autostart`, then performs full-page navigation.

[Session controls](../src/browser/course-session-controls.ts) read these case-sensitive parameters:

- `mode`: a registered lowercase course query. This is course selection, not Session mode.
- `session`: `CLASSIC` or `CUSTOM`, default `CLASSIC`. Any other value is rejected.
- `vehicle`: an exact vehicle-catalog profile ID, such as `TESTAROSSA`, for CUSTOM; absence uses the saved preset.
- `rivals`: CUSTOM rival count, parsed with `Number`; absence uses the preset. Session admission requires an integer from 0 through 16 and sufficient authored grid slots.
- `laps`: CUSTOM lap count, parsed with `Number`; absence uses the preset. Session admission requires a positive integer within the authored course limit; non-circuits use one lap.
- `clock`: CUSTOM checkpoint clock. Exactly `off` disables it; absence or any other value enables it. The setup control emits `on` or `off`.
- `autostart`: exactly `1` begins the admitted Session after loading; other values leave setup visible. It does not grant browser audio permission.

CLASSIC always uses the course's saved vehicle, rivals and laps with the checkpoint clock enabled;
it ignores their individual query overrides. CUSTOM exposes the settings above. Invalid vehicle,
numeric or course/Session combinations fail admission rather than being clamped into another run.
The setup form locks preset fields in CLASSIC and disables laps when the course permits only one.

For example, this query selects a standing-start SEAM run with sixteen rivals and no checkpoint clock:

```text
?mode=seam&session=CUSTOM&vehicle=TESTAROSSA&rivals=16&laps=1&clock=off&autostart=1
```

Append it to the local or public game URL. Omitting `autostart` exposes setup for inspection. Submitting
unchanged resolved settings starts in place; changed settings reload with their query values and
`autostart=1`. NEW SESSION preserves the settings but removes `autostart`. Session controls isolate
keyboard events and carry `data-driving-input="ignore"` so form interaction is not driving input.

## Performance HUD

The [performance HUD](../src/browser/course-performance-hud.ts) reports the current browser instance:
FPS, maximum CPU frame time, maximum single fixed-step time, maximum frame interval, lifetime maximum
seam-commit time, admitted ground MiB, unique ground tiles and Section count, followed by `loaded once`.
The first frame updates immediately; subsequent reports summarize approximately half-second windows.

CPU frame time adds fixed-step work since the previous render to rendering/presentation work. Frame
interval measures time between completed frames, not just CPU work. FPS and frame/step/interval maxima
reset with each reporting window; seam maximum remains cumulative. Ground MiB means resident bytes
divided by 1,048,576, not transfer size. The HUD does not display allocation rate, a median or p95.
[Development](development.md) owns performance targets, diagnostics and named-device acceptance.

## Driving input and DEV controls

Left/right arrows steer; Up or X accelerates and Down or Z brakes. Backspace requests recovery only
when the active composition permits it. [InputManager](../src/input/input-manager.ts) composes keyboard
and touch through shared steering and pedal arbiters; it does not create a second physical input path.

[Touch input](../src/input/touch-input.ts) accepts touch pointers beginning outside an element path
marked `data-driving-input="ignore"`. A pointer beginning in the viewport's left half controls steering;
at the midpoint or in the right half it controls pedals. The initial role and origin remain fixed
until release, with at most one pointer for each role and both roles usable simultaneously.

Horizontal displacement maps steering to [-1, 1]. Upward displacement gives throttle and downward
displacement gives brake, never both. Full scale is 64 CSS pixels, independently of backing-store
resolution; displacement beyond it saturates. Touching the origin immediately owns a neutral request.
Held touch publishes direct analog requests; release removes that source and retains the ordinary
actuator release behavior. Pointer release/cancellation clears the corresponding role. Suspension,
blur, page hiding and a hidden document reset input ownership and indicators.

Origin/vector indicators use runtime-generated `touch-analog-steering` and `touch-analog-pedal` classes;
those selectors are live even though their complete names are absent from literal source strings.
The DEV disclosure overlays rather than resizes the game, isolates keyboard events and closes on Escape
with focus returned to its summary. Camera and sound controls remain available while Session-owned
vehicle and physics settings are locked. Audio controls remain specified in [Audio](audio.md), and
steering/tire selectors and their wrap behavior remain specified in [Calibration](calibration.md).
