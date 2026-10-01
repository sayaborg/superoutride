# Browser operation

This document owns display, scheduling, keyboard/touch/gamepad input, URL settings, race status, HUD and DEV controls.
[Content and gameplay](content-and-gameplay.md) owns Session rules and loading,
[Audio](audio.md) owns audio lifetime, and [Calibration](calibration.md) owns numeric settings.

## Display and scheduling

The logical canvas is 320×240 with image smoothing disabled. `LOGICAL_WIDTH` and `LOGICAL_HEIGHT` are
the frame size's only authority: every frame is made by `createLogicalFrame`, and the camera's
projection centre is the frame centre. The frame stores RGB555; each presented frame is expanded to the
canvas's RGBA through one 32,768-entry table. A shared driving scene supplies the game and headless
previews. All selected course, image, ground and Session inputs are ready before driving starts. A
failed load displays status and Retry; an incomplete Session stays inactive.

The browser accumulates nonnegative elapsed time capped at 0.25 s per animation callback. Simulation
uses fixed 1/60 s steps (`SIM_DT`): the frame loop runs one race `advance(input)` per whole step in the accumulated
time, passing no step length, and the fractional remainder carries forward. One render follows the completed
steps, including callbacks with no simulation step; it reads the race's competitor observations, which
hold the values of the latest completed step. There is one frame loop; each start begins a fresh clock, so
stopped real time never enters the simulation. Loading and setup leave the race clock stopped until START.
Every Session assembly, a DEV tuning rebuild included, picks a new Session seed from `crypto.getRandomValues`;
the composition root is the only place that draws randomness.

The run state is the one owner of whether the run is running. It holds three facts: `paused` (manual PAUSE),
`hidden` (the document is hidden or the page was hidden) and `finished` (the current Session reached GOAL or
GAME OVER). The run is running exactly while none holds. Only the run state watches document visibility and
page hiding, and a page restored from the back/forward cache reloads. The PAUSE button's label (PAUSE or
RESUME) and its visibility follow the facts.

When running changes, the shell runs one symmetric procedure. Starting clears input suspension, activates
audio, renders once and starts the frame loop. Stopping stops the frame loop, suspends input (which resets it),
deactivates audio and renders once; that frame shows neutral input in the DEV vehicle HUD, no touch
indicators and the `PAUSED`, `GOAL` or `GAME OVER` status.

After each simulation step, a race clock at GOAL or GAME OVER finishes the run: the field stops, PAUSE is
hidden and the results are displayed; rendering changes no run state. A Session rebuilt by DEV tuning restarts
the run, clearing `paused` and `finished`, so it drives at once. START resets driving input once. NEW
SESSION returns to setup.

## Selection and URL parameters

The DEV course buttons map `ribbon-coast` / RIBBON COAST / 1, `ribbon-ring` / RIBBON RING / 2,
`ribbon-fork` / RIBBON FORK / 3 and `ribbon-rough` / RIBBON ROUGH / 4. Missing or unknown `mode` selects the first entry, RIBBON COAST.
A series marked `dev: true` is shown only with DEV; until selection screens exist, these DEV course
buttons select courses directly. Selecting the active course does nothing. Selecting another performs full-page navigation, changes
`mode`, removes `session`, `vehicle`, `rivals`, `laps`, `pool` and `autostart`, and preserves other URL data.

Session parameters are case-sensitive:

| Parameter   | Meaning                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `mode`      | Lowercase registered course query; independent of Session mode                                           |
| `session`   | `ARCADE`, `FREE_PLAY` or `TIME_TRIAL`, default `ARCADE`; other values fail                               |
| `vehicle`   | Exact catalog vehicle ID for FREE PLAY and TIME TRIAL, such as `TESTAROSSA`; absent uses preset          |
| `rivals`    | FREE PLAY count parsed with `Number`; integer 0–15 within grid capacity; absent uses preset              |
| `laps`      | FREE PLAY and TIME TRIAL count parsed with `Number`; positive integer within course limit                |
| `pool`      | FREE PLAY rival pool: `ALL`, `CARS` or `BIKES`; absent uses the player vehicle's form; other values fail |
| `autostart` | Exactly `1` starts after loading; other values show setup                                                |

ARCADE uses the course's [series](content-and-gameplay.md#series-documents) settings: the series' first
vehicle, its entries and laps, with the checkpoint clock, ignoring their individual query overrides. FREE PLAY exposes
those settings and has no clock; there is no `clock` parameter, so an old `clock` value is other URL data and ignored. Invalid vehicle, numeric or course/Session combinations
produce an error. Setup locks preset fields in ARCADE and disables a single-lap course's lap control.
TIME TRIAL exposes the vehicle and laps, runs alone and has no clock; a `rivals` or `pool` parameter is an error
there, and setup disables the rival control. A course in no series is untimed: it offers FREE PLAY and TIME TRIAL;
`session=ARCADE` is an error there, and its defaults are the first vehicle in selection order, no
rivals and one lap. A timed course whose time budgets are missing from delivery fails to load.

```text
?mode=ribbon-coast&session=FREE_PLAY&vehicle=TESTAROSSA&rivals=15&laps=1&autostart=1
```

Submitting equal resolved settings starts in place. Changed settings reload with their query values
and `autostart=1`. NEW SESSION preserves settings and removes `autostart`.
Autostart affects gameplay; sound still requires an eligible browser gesture.

## Driving input

Left/right arrows steer, Up or X accelerates, and Down or Z brakes. These are the only keyboard
controls; DEV selections and manual recovery use DEV buttons. A standard-mapping gamepad steers with the
left stick X axis or the D-pad, accelerates with RT or A and brakes with LT or B; other gamepad mappings are
ignored.

`InputManager` is the one driving-input authority. It owns the steering and pedal arbiters, suspension,
the lifecycle resets and the final sample; the window and document it listens to are passed in. Adapters
publish through it and keep only their local held state.

Every publisher is an owner: an object whose identity is its reference and which carries its apply method.
Each driving key is one `RATE_LIMITED` owner; each touch role's pointer is a `DIRECT` owner created on press.
Each connected gamepad has one owner per control: the stick X axis, RT and LT are `DIRECT`; D-pad left,
D-pad right, A and B are `RATE_LIMITED`. Owners of one gamepad arbitrate like any others.
An owner publishes with `set` and ends its publication with `release`; an owner that sets zero remains held
as a neutral authority. Keys set on keydown and release on keyup. The pedal arbiter's winner is the most
recently activated held owner: a held owner keeps its activation order when it sets again, a new owner takes
the next order, and releasing the winner reveals the next-most-recent held owner. Steering follows the latest
owner to set; releasing it returns to neutral and never revives a superseded owner. Boolean pedal requests
and numeric requests in `[0,1]` have the same canonical meaning.

Each fixed step, `sample()` polls the window's gamepads once and then builds one `DrivingInput` from the
arbiters: each apply method is the winning owner's, or `RATE_LIMITED` without an owner. The latest final
sample is a published read-only observation (`lastSample`); the DEV vehicle HUD reads it. The run state
suspends input whenever the run stops; suspension resets the arbiters, the adapters' held state and the final
sample to neutral, and while suspended the manager accepts no publication. Window blur, which is not a
run-state fact, resets input the same way without suspending it. START resets input once.

Touch pointers starting inside the touch area, and outside UI elements marked `data-driving-input="ignore"`,
control driving. The shell supplies the touch area as a client rectangle; it is currently the whole
viewport. The area's left half selects steering; the midpoint and right half select pedals. Each pointer's
role and origin are fixed until release, with at most one steering and one pedal pointer at once.

Horizontal displacement maps steering to `[-1,1]`. Upward displacement supplies throttle and downward
displacement supplies brake. Full scale is 64 CSS pixels, with larger displacement saturated.
Touching the origin owns neutral input. Held touch supplies direct analog displacement; release uses
the ordinary actuator release behavior.

The touch adapter publishes each role's observation (origin in client CSS pixels, current request and
vector length), or null while the role is inactive. The shell draws the origin/vector indicators and their
labels from it every frame, and once more after a reset that stops the frame loop, so release,
cancellation, suspension, blur and page hiding clear them.

Stick X magnitude and RT/LT values at or below 0.15 are rest; above it they rescale linearly from 0.15..1
to 0..1, keeping the stick's sign. Gamepad owners publish only on change, since the latest steering owner
wins: a button sets when pressed and releases when released; an analog control sets when it leaves rest,
sets again only when its rescaled value differs from its last publication, and releases at rest. After a
manager reset or a new connection, each control publishes nothing until it has been seen at rest, as a held
key is ignored until pressed again. A disconnected gamepad, or one no longer returned by polling, releases
all its owners. Without the Gamepad API, polling does nothing.

## Race status

The status line derives its text from race facts alone
([race time and events](content-and-gameplay.md#race-time-and-events)); the race holds no display state.
Manual pause shows `PAUSED`. A Session rebuilt by DEV tuning prefixes `TUNED · `. Otherwise:

- GOAL or GAME OVER shows `GOAL` or `GAME OVER`, the position and the race time; GAME OVER reads the same
  whatever its cause, as RESULT shows only the outcome ([product](product.md#6-flow-and-screens)).
- During READY it shows `READY n`, n the seconds until GO rounded up; while WAITING, before the Session starts,
  `READY`.
- While running it shows the state, the remaining time when there is a time limit, a current extension,
  the position and the race time, joined by `·`. The state is `LAP x/y` on a circuit (the player's accepted
  finish count plus one, capped at the lap count), or on another course `ROUTE` with the entry fork's choice,
  `OPEN` while it is undecided, or `GO` when the entry has no fork; a finished player's state is the run outcome status.
- `GO · ` prefixes the running line while the player's competitor clock is below 1 s.
- Remaining time is `TIME n`, n = ceil(max(0, deadline − race time)).
- A positive extension shows as `TIME EXTEND +x.x` (seconds, one decimal) while race time is at most 2 s after
  the race time of the checkpoint that earned it.
- Position is `Pr/n`: the player's rank among the n competitors present in the Session.
- Race time is `m:ss.mmm`, floored to whole milliseconds after adding a display-only tolerance of 1e-7 ms for
  accumulated fixed-step rounding.

## Performance HUD

The HUD displays FPS, maximum CPU frame time, maximum fixed-step time and maximum frame interval.
The first frame reports immediately, then approximately every half second.

The ground detail shows the selected method, the reporting window's maximum visible active Strip count,
the compiled course maximum and active limit, the latest frame's scene-render CPU milliseconds,
and the maximum over the most recent 120 rendered frames (`max120`). The renderer reads no clock: its
caller times the scene render. Changing method clears this render-timing history and reports immediately,
including while paused. The active count includes
hidden declarations in each contributing source slab; it is a maximum, not a sum over pixels or
Sections. These observations are measurements, not device-capacity verdicts.

CPU time adds fixed-step work since the preceding render to rendering/display work. Frame
interval is elapsed time between completed frames. FPS and frame/step/interval maxima reset each
reporting window.

## Player record

[`src/shell/player-record.ts`](../src/shell/player-record.ts) owns the browser's one player record: a
localStorage entry `super-outride-player` holding `{ "version": 1, "settings": { … } }`. The composition root
opens it once at page load; shell controls read the admitted settings and change them only through the record.

| Setting            | Shape and default                                                                     |
| ------------------ | ------------------------------------------------------------------------------------- |
| `vehicleColors`    | Selected color by vehicle ID, the player's Session color; default `{}`                |
| `volumes`          | `master`, `music` and `effects` as integer percentages 0–100; default 35, 100 and 100 |
| `latestSelections` | Latest selection by selection-screen key; default `{}`                                |

Loading admits only version 1 with exactly these keys and value types. An absent, unreadable, unparsable,
malformed or other-version record starts from the defaults and is replaced by the next save; there are no
migration readers. Each settings change saves the whole record at once. Where localStorage is missing or
reading or writing it throws, the record lives in memory for the page and the game continues. Today only the
MASTER volume has a control (the volume stepper in [Sound controls](#sound-controls)); colors, MUSIC, EFFECTS
and selections keep their defaults until their screens exist. A Session reads the player's vehicle color from
`vehicleColors`, falling back to the vehicle's default color when the record has none or names a color its sprite
set lacks. DEV tuning and DEV sound settings are not stored.

## DEV controls

DEV is an initially closed disclosure overlay. Its body scrolls within the safe viewport without
resizing the game. UI pointer starts stay outside driving input. Keydown is isolated, so keys typed
in DEV controls never reach driving input, while keyup can release an already-held driving key.
Escape closes the panel and returns focus to its summary. DEV has no keyboard shortcuts.
The vehicle is chosen in the Session setup, and choosing it starts a Session; there is no vehicle
selection during a Session. Driving tuning, camera, sound and recovery controls remain available. RECOVER requests the race's manual recovery of the player vehicle when the active composition
permits it: in a course session, only while the run is running and the race clock is RUNNING. The shell supplies
the player's input only; it reads the Session vehicle for HUD and export and each competitor's vehicle for sound, and the race owns all mechanics.

Driving tuning is grouped as STEERING, PEDALS, TIRES F/R, POWERTRAIN, RIVAL PACE and ASSISTS. Each value uses a
minus/value/plus control in the driving definition's units, wrapping at range endpoints; ASSISTS
toggles wheel slip protection. The DEV HUD shows one line per group (STEER with the derived automatic
budget A, PEDAL, TIRE, ENGINE with ASSIST), read from the tuned definition; RIVAL PACE has no HUD line, since a
tuned Session has no rivals: its values take effect once the exported definition is adopted as content. An admitted adjustment rebuilds the
Session through the same assembly as startup: a new Session vehicle with the same vehicle definition and materials
drives the tuned definition, in a FREE PLAY Session with no rivals, the current lap count, no time limit, start speed 0
and no envelope or time budgets, on a new Route runtime from the grid. It enters READY → GO at once, and the Session
status reads `TUNED`. The shell, its input, audio, camera device and DEV controls persist, and the shell keeps the
tuned definition for further adjustments and export. Reloading the page restores the product Session. EXPORT saves the tuned
driving definition (`default.json`) and the Session vehicle's definition (`<vehicle id>.json`) as browser downloads in the saved layout;
its `audio/default.json` button (音の設定を書き出す) saves the DEV sound panels' current values as the
[audio document](audio.md#audio-document) (`default.json`);
[Calibration](calibration.md#vehicle-settings) describes adopting them as content. The selectable
body-yaw and movement-yaw cameras use the same projection.
[Calibration](calibration.md#vehicle-settings) lists values, units and ranges.

### Ground display setting

`graphics/display-settings.ts` owns the typed product display setting and its LEVEL-POINT default.
The driving composition root creates one settings object; the shared scene reads it when rendering.
The browser control is only an adapter and does not own the value or its lifetime.

DEV's **Ground display** group exposes all three methods defined in
[Architecture](architecture.md#strip-rendering), marking the selected button pressed. A click updates
the single setting and redraws immediately, including before START and while paused. Camera, vehicle,
Session and occurrence history are preserved, with no restart or course recompilation. The setting
lasts for the loaded page; page/course reload restores the default. The controls use DEV input isolation.
A player-facing settings screen is future work in [NEXT](NEXT.md).

### Sound controls

A mouse press, touch/pen release, touchend or eligible keyboard gesture starts/resumes sound.
Touch pointerdown alone does not activate it. SOUND START starts or resumes; SOUND ON/OFF then mutes
or unmutes. SOUND RETRY offers a new initialization after failure. SOUND UNAVAILABLE indicates that
the browser lacks the required audio support while gameplay remains usable.

MASTER, ENG and TIRE independently control the complete output, engine output and tire output.
MASTER is the player record's MASTER volume; ENG and TIRE are DEV mix values.
A zero gain silences that output while DSP continues. R and Q buttons (`tire-component-rolling`, `tire-component-friction`) independently switch rolling
and friction output for both axles. Their labels and pressed states show ON/OFF, and unavailable audio
disables them. [Tire audio](tire-audio.md#settings-replacement) owns faded output and replacement semantics.

The shell's reusable DOM controls ([`src/shell/controls/`](../src/shell/controls/)) build these sound controls
(`mountSoundControls`); the audio lifecycle only syncs their values to the scene and owns the AudioContext.
DEV sound settings come in groups, each with its own reset to the audio document's values; page/course reload
restores those values and vehicle changes preserve them:

- **ENGINE** (`engine-sound-settings`): fifteen minus/plus controls for the exhaust settings; buttons stop at limits.
- **MIX** (`mix-sound-settings`): the master compressor.
- **TIMING** (`timing-sound-settings`): the control time constants.
- **RIVAL** (`rival-sound-settings`): rival audible distance, reference distance, pan floor and reassignment time.
- **UNIFIED** (`tire-sound-settings`): the friction-model settings.
- **ROLLING** (`rolling-sound-settings`): the rolling-model settings.

MIX, TIMING, RIVAL, UNIFIED and ROLLING use sliders with the acoustic ranges. Engine sound rows show cycle, cylinder count, idle/redline, firing phases,
collector grouping and path lengths. [Calibration](calibration.md) lists the numeric settings.
