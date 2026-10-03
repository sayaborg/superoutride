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
failed run assembly shows LOAD FAILED in the frame without reloading the page; an incomplete Session stays inactive.

The page is laid out by CSS alone. The frame keeps 4:3 without interpolation: in landscape it fills the height of the
safe area and is centered; in portrait it spans the width at the top. The touch area is the whole viewport wherever
the frame is.

The browser accumulates nonnegative elapsed time capped at 0.25 s per animation callback. Simulation
uses fixed 1/60 s steps (`SIM_DT`): the frame loop runs one race `advance(input)` per whole step in the accumulated
time, passing no step length, and the fractional remainder carries forward. One render follows the completed
steps, including callbacks with no simulation step; it reads the race's competitor observations, which
hold the values of the latest completed step. There is one frame loop; it runs while the page is visible and
advances and draws the current screen. Each start begins a fresh clock, so stopped real time never enters the
simulation. Loading leaves the race clock stopped; an assembled run starts at once.
Every Session assembly, a DEV tuning rebuild included, picks a new Session seed from `crypto.getRandomValues`;
the composition root is the only place that draws randomness.

The driving composition root owns two lifetimes. The page lifetime is created once: delivered content and
catalogs (materials, surface sounds, vehicle and driving definitions, series, text tiles, audio settings), the
player record, display settings, the text layer, race sprites, the browser devices (canvas, framebuffer, input,
audio), the screen host with its frame loop and, with `dev=1`, the performance HUD and the page's DEV
controls (sound, ground display, camera, RESULT delay). The run lifetime holds the selected course, its Session
settings, the field's Session vehicles, envelopes, time budgets and pace schedule, the Session, scene and race,
the player's sprites, the camera rig and lifecycle and, with `dev=1`, the course's performance-HUD
values and the run's DEV controls (driving tuning, export, RECOVER). Page devices hold no run: each frame passes the
run's observations to them.

The page is loaded once. A URL that names a course, the selection screens and RETRY request a run, and every request
passes the one assembly, after which the run starts at once; a DEV tuning rebuild replaces the Session inside its run. Assembly is
asynchronous and one runs at a time: a request made during an assembly is ignored. The page holds one course: a
request first disposes of the current run, removing the listeners and DOM it added, then loads the next. A new run
starts from delivered content, so DEV driving tuning and its displayed values return to the delivered definition.
Sound, input, fullscreen, the DEV sound settings, the ground display method, the DEV camera adjustment and the
RESULT delay belong to the page and persist. A failed assembly leaves no run and shows LOAD FAILED; its reason goes to
the console and, with `dev=1`, outside the frame with Retry.

## Screens

The page always has one current screen, owned by the screen host. A screen advances one fixed step, draws one
frame (the framebuffer and the [text layer](architecture.md#text-layer)) and says whether it is live: whether the
player's driving input and sound run on it. The host runs the frame loop while the page is visible and stops it
while the document is hidden or after `pagehide`; only the host watches document visibility and page hiding, and a
page restored from the back/forward cache reloads. Driving input and sound are live exactly while the page is
visible and the current screen is live, and the host runs one symmetric procedure when that changes: live clears
input suspension and activates audio; stopped suspends input (which resets it) and deactivates audio.

The loading screen shows `LOADING` on the plain background while a run is assembled. After a failed assembly the
LOAD FAILED screen shows `LOAD FAILED` in red with RETRY, which requests the same run again, and BACK, which returns to
the screen that requested it: the last selection screen, or TITLE for a run the URL or a DEV control requested. The
reason is not drawn, since it may hold characters without text tiles: it goes to the console and, with `dev=1`, to a
status element outside the frame, which also shows `Loading course…` while a run loads. Without `dev=1` nothing shows
outside the frame, except when the page itself cannot start (its content or text tiles cannot load, so the frame
cannot draw text): then its reason and a Retry that reloads the page show outside the frame. The run screen holds the run and its state: running, paused (manual PAUSE)
or finished (the Session reached RESULT). The run runs only while neither holds: paused and finished advance no race,
and driving input and sound stop, so the DEV vehicle HUD shows neutral input and no touch indicator is drawn. Every
frame still draws the scene. While paused, the PAUSE menu is drawn over the stopped frame, which is first halved to
half brightness while the text layer, the HUD included, stays at full brightness: the title `PAUSED` and
RESUME, RETRY and QUIT. RESUME, BACK and PAUSE resume; RETRY requests the same run again, which starts at once with a
new seed; QUIT ends the run and shows TITLE.

Every list screen uses one menu part: a title and items, the current item YELLOW, unselectable items DARK and the
rest WHITE, centred in the text grid without shortening. UP and DOWN move over the selectable items and wrap around;
each item carries what CONFIRM and LEFT/RIGHT do on it, so no action depends on its position; BACK leaves.

The selection screens follow one flow table ([product](product.md#6-flow-and-screens)). TITLE offers START and
SETTINGS; START leads to SELECT MODE. A CONFIRM on TITLE is the user gesture that enables
sound and requests fullscreen of the page where the browser allows them; a refusal is ignored, and a gamepad press is
not a gesture the browser accepts. After SELECT MODE each mode's screens follow in order: ARCADE: SELECT SERIES, SELECT
COURSE (only for a series with several courses), SELECT VEHICLE; FREE PLAY: SELECT COURSE, SELECT VEHICLE, OPTIONS;
TIME TRIAL: SELECT COURSE, SELECT VEHICLE, LAPS (only on a course with several laps). BACK returns to the previous
screen and does nothing on TITLE; the last CONFIRM requests the run, which shows LOADING and then starts at once.
Each screen starts from the current selection, else the player record's latest selection for that screen (SELECT
MODE, SELECT SERIES, SELECT COURSE and SELECT VEHICLE under the keys `mode`, `series`, `course` and `vehicle`), else
its first selectable item; each CONFIRM on those screens saves its choice as the latest.

SETTINGS lists MASTER, MUSIC and EFFECTS with their volumes, which LEFT and RIGHT change in steps of 5 within 0–100
(to the adjacent multiple of 5), and CONTROLS, which shows the keyboard, touch and gamepad controls; BACK leaves each.
The player record keeps every volume. MASTER applies at once through the same path as the DEV volume stepper, which
shows it; MUSIC and EFFECTS have no sound until their buses exist.

- SELECT MODE: a mode with no selectable course is DARK.
- SELECT SERIES lists the series with their titles; SELECT COURSE lists course display names from the course index.
  In FREE PLAY and TIME TRIAL its courses are grouped by series, each group headed by its series title (DARK); courses
  in no series follow last, after a blank line.
- SELECT VEHICLE offers the series' vehicles in ARCADE and every catalog vehicle otherwise. The vehicle turns through
  its yaw images on the plain background, one image every six fixed steps, drawn like a race vehicle at the
  player-depth scale, above its name (manufacturer and model). LEFT and RIGHT change the vehicle and UP and DOWN its
  color, both wrapping around; a series with fixed colors has no color choice. It starts from the player record's
  color for the vehicle, else the vehicle's default color, and CONFIRM saves the chosen color in the player record.
- OPTIONS: RIVALS (0 to the smaller of 15 and the rivals the course's grid holds, from the course index; a course
  change lowers a larger count), POOL (ALL, CARS or BIKES; set to the vehicle's form when the vehicle changes) and, on a
  course with several laps, LAPS (1 to the course's maximum); LEFT and RIGHT change the value, and START confirms.
- LAPS: LAPS (1 to the course's maximum) and START.

DEV series and courses in no series are offered only with `dev=1`, which the composition root reads once. Without it
every delivered course is a DEV one today, so every mode is DARK.

RESULT follows GOAL or GAME OVER after the RESULT delay, a DEV setting (default 3 s; 0, 1, 2, 3, 5 or 10 s; not
persisted), which the shell counts in fixed simulation steps after the step that ended the run. Until then the loop,
the field, rendering and sound continue and PAUSE stays available; a pause stops the count with the simulation.
At RESULT the run finishes: the race stops and the RESULT menu
is drawn over the stopped frame at half brightness and takes the menu commands. Its title is the outcome, GOAL in yellow or GAME OVER in
red; its lines are RANK n/m when the Session has rivals, TIME (race time) and, on a circuit, BEST LAP, all derived
from race facts, the rank by the race's standing. Its items are RETRY (the same run again, starting at once with
a new seed), CHANGE VEHICLE (SELECT VEHICLE with the run's selection), SELECT (the run mode's first selection screen
with the run's selection) and TITLE; leaving the run ends it. A Session rebuilt by DEV tuning restarts
the run, clearing `paused` and `finished`, so it drives at once. A run's start resets driving input once.

## Selection and URL parameters

The composition root reads the delivered [course index](content-and-gameplay.md#course-index) once and passes it to
the selection screens and the DEV HUD's course line, in its order and with its display names.

A run is requested as a typed run request: the course, the mode, the vehicle and the player's color, plus the
rival count, rival pool and laps in FREE PLAY and the laps in TIME TRIAL. ARCADE takes its laps and field from the
series. The run's assembly admits the request against the course and the catalogs and derives its Session settings;
it is the one admission of every request.

The URL is read once at startup, as a DEV and test entry point; selections inside the page never rewrite it. A URL
whose `course` names a delivered course builds that run's request and starts the run at once; otherwise the page starts
at TITLE. The player's color is the player record's color for the vehicle. A URL request that cannot be built fails
like an assembly.

Session parameters are case-sensitive:

| Parameter | Meaning                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `course`  | Lowercase registered course ID                                                                                       |
| `mode`    | `ARCADE`, `FREE_PLAY` or `TIME_TRIAL`; default `ARCADE` on a series course, `FREE_PLAY` otherwise; other values fail |
| `vehicle` | Exact catalog vehicle ID for FREE PLAY and TIME TRIAL, such as `TESTAROSSA`; absent uses preset                      |
| `rivals`  | FREE PLAY count parsed with `Number`; integer 0–15 within grid capacity; absent uses preset                          |
| `laps`    | FREE PLAY and TIME TRIAL count parsed with `Number`; positive integer within course limit                            |
| `pool`    | FREE PLAY rival pool: `ALL`, `CARS` or `BIKES`; absent uses the player vehicle's form; other values fail             |

ARCADE uses the course's [series](content-and-gameplay.md#series-documents) settings: the series' first
vehicle, its entries and laps, with the checkpoint clock, ignoring their individual query overrides. FREE PLAY exposes
those settings and has no clock; there is no `clock` parameter, so an old `clock` value is other URL data and ignored. Invalid vehicle, numeric or course/Session combinations
produce an error. TIME TRIAL exposes the vehicle and laps, runs alone and has no clock; a `rivals` or `pool`
parameter is an error there. A course in no series is untimed: it offers FREE PLAY and TIME TRIAL;
`mode=ARCADE` is an error there, and its defaults are the first vehicle in selection order, no
rivals and one lap. A timed course whose time budgets are missing from delivery fails to load.

```text
?course=ribbon-coast&mode=FREE_PLAY&vehicle=TESTAROSSA&rivals=15&laps=1
```

A run started from the URL drives without a gesture; sound still requires an eligible browser gesture.

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
sample is a published read-only observation (`lastSample`); the DEV vehicle HUD reads it. The screen host
suspends input whenever driving stops; suspension resets the arbiters, the adapters' held state and the final
sample to neutral, and while suspended the manager accepts no publication. Window blur, which stops no screen, resets input the same way without suspending it. A run's start resets input once.

The page reads each device once and shares the reading: one touch-pointer reader listens to the window's pointer
events and passes touch pointers to its consumers, and one function reads the connected standard-mapping gamepads.
A press on a UI element marked `data-driving-input="ignore"` starts no touch pointer. Touch pointers starting inside
the touch area control driving. The shell supplies the touch area as a client rectangle; it is currently the whole
viewport. The area's left half selects steering; the midpoint and right half select pedals. Each pointer's
role and origin are fixed until release, with at most one steering and one pedal pointer at once.

Horizontal displacement maps steering to `[-1,1]`. Upward displacement supplies throttle and downward
displacement supplies brake. Full scale is 64 CSS pixels, with larger displacement saturated.
Touching the origin owns neutral input. Held touch supplies direct analog displacement; release uses
the ordinary actuator release behavior.

The touch adapter publishes each role's observation (origin in client CSS pixels, current request and
vector length), or null while the role is inactive. The shell draws the origin/vector indicators and their
labels from it every presented frame, so release, cancellation, suspension and blur clear them at the next frame.

Stick X magnitude and RT/LT values at or below 0.15 are rest; above it they rescale linearly from 0.15..1
to 0..1, keeping the stick's sign. Gamepad owners publish only on change, since the latest steering owner
wins: a button sets when pressed and releases when released; an analog control sets when it leaves rest,
sets again only when its rescaled value differs from its last publication, and releases at rest. After a
manager reset or a new connection, each control publishes nothing until it has been seen at rest, as a held
key is ignored until pressed again. A disconnected gamepad, or one no longer returned by polling, releases
all its owners. Without the Gamepad API, polling does nothing.

## Menu input

Menu commands are UP, DOWN, LEFT, RIGHT, CONFIRM, BACK and PAUSE. They have one authority, separate from driving
input; it shares the page's touch-pointer reader and gamepad reading. The screen host sets the input route: while
driving, driving input takes the devices and only PAUSE reaches the current screen; in a menu (any screen that is not
live, a paused or finished run included) driving input is suspended and every command arrives; while the page is
hidden nothing does. Commands arrive at the current screen before each fixed step.

- **Keyboard:** the arrows give the directions and Enter CONFIRM; Escape is BACK in a menu and PAUSE while driving.
  Keys follow the operating system's repeat, except that a repeated Escape does not pause.
- **Gamepad** (standard mapping): the D-pad and the left stick beyond half deflection give the directions, A CONFIRM
  and B BACK; Start is PAUSE while driving and CONFIRM in a menu. A control commands once, on its press, and never
  repeats; one held while the route changes commands nothing until pressed again.
- **Touch:** in a menu, a touch in the left half of the touch area that moves at least `TOUCH_FLICK_DISTANCE_PX`
  (24 CSS px) is a flick in its larger axis's direction, and a touch in the right half that moves less is a tap,
  CONFIRM. Touches never repeat. Two small buttons sit in the screen's corners, inside the safe area: BACK top left in
  a menu and PAUSE top right while driving. They appear once touch has been used, and a press on them starts no
  driving or menu touch.

The same press never reaches both authorities. Suspension resets driving input, and a gamepad control needs rest and
a key needs a new press before driving input accepts it, so the Enter, A or touch that resumes a run drives nothing.
While a run screen runs, PAUSE pauses; while it is paused, PAUSE or BACK resumes.

## HUD

The run screen writes the product HUD into the text layer after the scene is drawn and before the text layer is
drawn ([product](product.md#9-hud)). The HUD reads only race facts ([race time and
events](content-and-gameplay.md#race-time-and-events)) and the player's competitor observation. It is one table of
independent elements, each with its condition and what it writes; the table alone decides which show, from the
Session's rules (the clock, the course type) and race facts (others present, the next gate's rank limit, the stage
rival ahead). Another table holds every element's place in the 40×30 grid, so moving one changes only its numbers.

| Rows  | Elements                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| 1–2   | TIME and the remaining seconds (rounded up), race time, POS n/m, STAGE n                                           |
| 4–5   | LAP x/y and the lap's time, BEST and the best lap (`-'--"---` before one), PASS n until the ending, TARGET nM      |
| 7     | `EXTEND +12"0` (seconds and tenths), yellow, while TIME is yellow after an extension                               |
| 10–11 | Before GO: the course's display name and the mode                                                                  |
| 13–14 | Three 2×2-tile signal lamps: before GO the race's lamps lit are red and the rest unlit; all green for 1 s after GO |
| 16–17 | From the ending until RESULT: GOAL (yellow), or GAME OVER (red) with TIME UP or RANK OUT                           |
| 27–28 | The gear and the speed in km/h with `KM/H`                                                                         |
| 26–29 | Bars of 10 cells (1-pixel steps) between end caps: STEER, GAS, BRAKE and RPM                                       |

Steering, throttle and brake are bars whose fill is the vehicle's actual value from the player's observation (the
delivered steering offset as a fraction of its maximum, from the centre; the throttle and brake actuators) and whose
yellow 1-pixel mark is the player's input from the final input sample; a dark mark shows the steering centre. The
tachometer bar runs from 0 to the fuel-cut speed (`fuelCutRpm`: the player vehicle's redline plus the driving
definition's margin): cells from the redline on are red, with a red mark at the redline, and the whole bar is red while
the limiter cuts fuel. One bar part draws all four, its marks on the text layer's overlay tiles.

Rows 8 to 24, the road and the player's vehicle, hold only these passing notices. While the PAUSE menu or RESULT is
over the frame, the notices in rows 7 to 17 are not drawn; the upper and lower rows stay.

Durations come from race facts, never from wall-clock time or HUD timers, so a pause stops them: TIME is yellow
while race time is at most 2 s after an extension's race time, and red otherwise under 10 s remaining; a finished
lap's time holds in yellow for 2 s of race time after the lap; the gear is yellow for 0.3 s of the race's
simulation time (every advanced step, READY and after the ending included) after the shift the race stamped.
The signal lamps are green for 1 s of race time after GO. Other text is white. These lengths sit in one constant.

## Performance HUD

The DEV performance HUD (with `dev=1`) displays FPS, maximum CPU frame time, maximum fixed-step time and maximum frame interval.
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
reading or writing it throws, the record lives in memory for the page and the game continues. SETTINGS and the
DEV volume stepper ([Sound controls](#sound-controls)) save volumes, SELECT VEHICLE saves colors, and the selection
screens save their latest selections. A Session reads the player's vehicle color from
`vehicleColors`, falling back to the vehicle's default color when the record has none or names a color its sprite
set lacks. DEV tuning and DEV sound settings are not stored.

## DEV controls

Only a URL with `dev=1` builds DEV: the composition root reads it once and then builds the DEV panel from its
template in the page, its controls (sound, ground display, camera, RESULT delay and each run's
driving tuning, export and RECOVER), the performance HUD and the DEV vehicle HUDs drawn over the frame. Without it
none of these exist, in the DOM or as listeners, and DEV series and courses in no series are not offered. The status
line, the touch indicators and the corner buttons are not DEV. The DEV toggle sits left of the PAUSE corner button.

DEV is an initially closed disclosure overlay. Its body scrolls within the safe viewport without
resizing the game. UI pointer starts stay outside driving input. Keydown is isolated, so keys typed
in DEV controls never reach driving input, while keyup can release an already-held driving key.
Escape closes the panel and returns focus to its summary. DEV has no keyboard shortcuts.
The vehicle is chosen on SELECT VEHICLE; there is no vehicle selection during a Session. Driving tuning, camera, sound and recovery controls remain available. The camera controls choose the
camera definition's height frequency, damping ratio, minimum clearance, yaw limit and yaw response for the session,
unsaved
([Calibration](calibration.md#camera-settings)). RECOVER requests the race's manual recovery of the player vehicle when the active composition
permits it: in a course session, only while the run is running and the race clock is RUNNING. The shell supplies
the player's input only; it reads the Session vehicle for HUD and export and each competitor's vehicle for sound, and the race owns all mechanics.

Driving tuning is grouped as STEERING, PEDALS, TIRES F/R, POWERTRAIN, RIVAL PACE and ASSISTS. Each value uses a
minus/value/plus control in the driving definition's units, wrapping at range endpoints; ASSISTS
toggles wheel slip protection. The DEV HUD shows one line per group (STEER with the derived automatic
budget A, PEDAL, TIRE, ENGINE with ASSIST), read from the tuned definition; RIVAL PACE has no HUD line, since a
tuned Session has no rivals: its values take effect once the exported definition is adopted as content. An admitted adjustment rebuilds the
Session through the same assembly as startup: a new Session vehicle with the same vehicle definition and materials
drives the tuned definition, in a FREE PLAY Session with no rivals, the current lap count, no time limit, start speed 0
and no envelope or time budgets, on a new Route runtime from the grid. It enters READY → GO at once, and the DEV vehicle HUD's
first line starts with `TUNED · `; the product HUD never shows it. The shell, its input, audio, camera device and DEV controls persist, and the shell keeps the
tuned definition for further adjustments and export. Reloading the page restores the product Session. EXPORT saves the tuned
driving definition (`default.json`) and the Session vehicle's definition (`<vehicle id>.json`) as browser downloads in the saved layout;
its `audio/default.json` button (音の設定を書き出す) saves the DEV sound panels' current values as the
[audio document](audio.md#audio-document) (`default.json`);
[Calibration](calibration.md#vehicle-settings) describes adopting them as content. There is one camera, with no
DEV selection; the DEV overlay above the player shows its travel direction relative to the camera yaw.
[Calibration](calibration.md#vehicle-settings) lists values, units and ranges.

### Ground display setting

`src/view/display-settings.ts` owns the typed product display setting and its LEVEL-POINT default.
The driving composition root creates one settings object; the shared scene reads it when rendering.
The browser control is only an adapter and does not own the value or its lifetime.

DEV's **Ground display** group exposes every method defined in
[Architecture](architecture.md#strip-rendering), marking the selected button pressed. A click updates
the single setting and redraws immediately, including while paused. Camera, vehicle,
Session and occurrence history are preserved, with no restart or course recompilation. The setting
lasts for the loaded page and every run; a page reload restores the default. The controls use DEV input isolation.

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
DEV sound settings come in groups, each with its own reset to the audio document's values; a page reload
restores those values and new runs preserve them:

- **ENGINE** (`engine-sound-settings`): fifteen minus/plus controls for the exhaust settings; buttons stop at limits.
- **MIX** (`mix-sound-settings`): the master compressor.
- **TIMING** (`timing-sound-settings`): the control time constants.
- **RIVAL** (`rival-sound-settings`): rival audible distance, reference distance, pan floor and reassignment time.
- **UNIFIED** (`tire-sound-settings`): the friction-model settings.
- **ROLLING** (`rolling-sound-settings`): the rolling-model settings.

MIX, TIMING, RIVAL, UNIFIED and ROLLING use sliders with the acoustic ranges. Engine sound rows show cycle, cylinder count, idle/redline, firing phases,
collector grouping and path lengths. [Calibration](calibration.md) lists the numeric settings.
