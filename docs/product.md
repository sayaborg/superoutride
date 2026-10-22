# Product specification

SUPER OUTRIDE is a browser driving game with a 320 by 240 raster pseudo-3D view, set in the late 1980s.
The player chooses a car or motorcycle and drives characteristic roads of that era's arcade driving
games, remastered into one shared world, on one shared set of vehicle mechanics.

This document is the product target. [NEXT](NEXT.md) schedules the parts that are not yet implemented;
the topic specifications describe the current implementation. Values that depend on a produced course
(rank limits, spawn distances, pace ratios, time margins, grid spacing) are set during course production
from playtests; [NEXT](NEXT.md#pending-product-decisions) lists every open decision.

## 1. Concept

The pleasure is driving the road: its turn order, elevation, surfaces, forks and scenery, with
distinctly different vehicles. Driving a familiar road with another vehicle is itself a goal, and
modest vehicles (Mini, Beetle, Vespa, Super Cub) are chosen for their character, not only their speed.

The game has no part purchases, tuning progression, upgrade choices during a run, arrests or goals of
stopping another vehicle. Ordinary contact, rivals, traffic, rank and route choice remain.
Every run is single-player; there is no split screen or online play.

A reference game's special controls are not adopted merely because it had them: there is no turbo
button, jump control or siren.

### Era

The world is the late 1980s. Vehicles existing by 1989 are eligible, including older cars; a vehicle's
model year, market, grade, engine, appearance and sound describe one consistent specification, without
later parts or outputs. Reference games released in the 1990s are eligible; their roads are remastered
into this world.

### Vehicle identity

A vehicle behaves identically in every session, series and course. A different specification of the same
model (road and rally-raid, road and Group A) is a different vehicle. Difficulty never changes vehicle
mechanics; it is expressed by run rules and rival driving (§3).

## 2. Structure

| Level   | Meaning                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| SERIES  | A reference game or original game: a named set of classes with its title, image, music and class order       |
| CLASS   | One complete race definition: course, laps, eligible vehicles, field, traffic, clock, time margin and colors |
| SESSION | How a class is driven: RACE or TIME ATTACK; every class offers both                                          |
| COURSE  | One road to drive; several classes and series may run a course, or none                                      |
| VEHICLE | The vehicle the player drives                                                                                |
| STAGE   | The route interval between consecutive race gates (checkpoints and the finish)                               |

A series holds no rule values: every rule belongs to its classes, and classes of one series may repeat the same values.
A series' only other setting is whether it appears without DEV, which is visibility, not a rule. Steering and camera
belong to the player's SETTINGS alone; a class does not prescribe them.

**FREE PLAY** is not a series. It is an assembly bench: any product course, any vehicle, rivals from a vehicle pool,
traffic and laps (§4). Every delivered product course is available in FREE PLAY; a course that no class runs is
available only there.

LINEAR means one route without forks or laps (not a straight road), BRANCH a course with forks and
several goals, and CIRCUIT a lapped course. Stages are rule intervals; they need not coincide with
course Sections. Series, courses and vehicles are all available from the start;
there is no unlocking, currency or progression.

## 3. Run rules

A run combines these rule components. Forks, recovery and timing mechanics are common to all
runs ([Content and gameplay](content-and-gameplay.md) owns their definitions).

| Component          | Values                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| Clock              | On or off. On: the checkpoint clock with per-checkpoint time extensions                 |
| Rank limits        | Per race gate: a limit N, or none                                                       |
| Competitor entries | Vehicle, color, pace ratio, stage interval and appearance (grid slot or ahead distance) |
| Player slot        | The player's own entry position, or the last grid slot                                  |
| Laps               | Circuits only                                                                           |
| Traffic            | Off, or a density in vehicles per kilometre, vehicle candidates and a speed             |

**Field.** A run has at most sixteen competitors, the player included. The entries of a class list
its whole field in grid order. The player occupies the rearmost entry of the selected vehicle in grid
order, in that entry's color when the class fixes colors and otherwise in the player's chosen color; the
remaining entries are the rivals. With the player slot "own entry position" the player starts where
that entry stands (Turbo OutRun); with "last" the player starts in the last slot and the rivals keep
their order in front. Rivals avoid repeating a vehicle/color pair where the entries allow.
Cars and motorcycles may share a field.

**Grid.** Cars start from a staggered grid of two columns. A course may also have a grid for motorcycles, three a row
in steps with the pole at the front on the left, as in the Tsukuba road racing championship; a field of motorcycles
alone starts from it, and a field with a car from the car grid, in every run. A grid may hold more slots than sixteen;
a field uses the front sixteen, and its last slot is the sixteenth.

**Stage interval and appearance.** An entry takes part in a stage interval. An entry starting at the
first stage stands in its grid slot. An entry joining later appears ahead of the player by its ahead
distance when the player enters its first stage, moving at its driver's planned speed there. After its
last stage ends for the player, the entry leaves as soon as it is out of view. Whole-race rivals, one
rival per stage and a final all-rival stage are all entries with different intervals.

**Rank limits.** A gate with rank limit N fails the player at the moment the N-th other competitor
crosses it before the player. An exact tie in event time goes to the player. Rank limits count the
competitors present in the run at that moment.

**Clock.** The clock starts at GO; each newly earned checkpoint extends it once, and expiry ends the
run in GAME OVER. The time allowance derives from the player's selected vehicle: the reference driver's time for
that vehicle on the class's course and route, multiplied by the class's time margin. Only a RACE has a clock.

**Rival pace.** In a RACE, rival driving is relative to the player's selected vehicle. Each entry has a pace ratio
p. The rival follows a pace schedule: the times at which the player's vehicle passes each station in its reference
run on that course, divided by p. A rival behind its schedule drives harder and one ahead of it drives easier,
within its own vehicle's limits. The schedule does not depend on the player's actual position, so there is no
catch-up. Thus the choice of vehicle does not change the difficulty, and no vehicle's mechanics change. The
difference is visible driving, not a hidden correction.

**Forks.** The first competitor to cross a fork's lock line selects the route for the whole field;
alone, that is the player. Unselected roads show warnings and closure signs; vehicles remaining there
at closure recover to the selected road. Recovery preserves earned progress.

**Traffic** vehicles are not competitors: they take no rank, never select a route and have no part in records.
Traffic appears only on roads of two or more lanes.
They are ordinary vehicles with ordinary drivers, travelling the player's way. Where each one appears along the
road, its vehicle, color and lane follow from the run's seed. A traffic vehicle appears ahead at the farthest
visible distance, keeps its lane at the traffic speed, the same for every traffic vehicle as on a public road, slowing for
corners as any driver does, and leaves once it
is out of view. A traffic vehicle never changes lanes to pass: behind a slower vehicle it matches that vehicle's speed. Where
its lane ends, it merges into the lane beside it once that lane is free. At most sixteen traffic vehicles are present at once.

## 4. Sessions and FREE PLAY

A class is driven in one of two sessions, chosen after the class.

**RACE** runs the class: its course, laps, vehicles, field and traffic, with its clock and its other rules. Its
settings are fixed; the player chooses the vehicle among the class's and the color, unless the class fixes colors.

**TIME ATTACK** runs the class's course with one of its vehicles alone: no rivals, no traffic, no clock. The player
starts from the last grid slot, where the reference run starts. What it competes on depends on the course:

- **CIRCUIT: the best single lap.** The run has no finish and no lap count: the player laps until ending the run, and
  the class's lap count is not used. The standing-start first lap counts like any other. The run's result is its
  fastest completed lap; its total time is neither a result nor recorded. The player ends the run from PAUSE, whose
  QUIT leads to RESULT, showing the completed laps and the best; a run ended before completing a lap has no result.
- **LINEAR and BRANCH: the completion time** to the goal reached, as a run with a finish. On forks the player selects
  the route by driving.

**FREE PLAY** runs any product course with any vehicle. There is no clock. OPTIONS choose the rival
count (0–15), the rival vehicle pool (ALL, CARS or BIKES; default: the player's vehicle form), traffic (OFF, LOW or HIGH; default OFF) and laps on circuits. Rival vehicles and colors are drawn from
the pool by the run's seed. FREE PLAY rivals drive at their own vehicles' pace, so the choice of
vehicles shapes the race; FREE PLAY needs no reference runs. The player starts from the last grid slot.
FREE PLAY traffic is the same on every course: LOW is 5 and HIGH 30 vehicles per kilometre, drawn from every
vehicle, at 80 km/h. FREE PLAY records nothing.

## 5. Series

Series display names are the reference titles. Class, course and vehicle choices follow; rule values marked
in §3 are set during course production. The table's rule columns (vehicles, clock, rank limits, field, player slot and
traffic) are class values, written once where every class of the series has the same; a series with one class names
its course. Each class also has its time margin and whether it fixes colors.

| Series          | Classes and courses                                                                                                 | Vehicles                                                                                                | Clock | Rank limits          | Field                                   | Player slot | Traffic |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- | -------------------- | --------------------------------------- | ----------- | ------- |
| TSUKUBA CLUBMAN | PRODUCTION 750, GTI CUP, 911 CUP: each TSUKUBA (CIRCUIT)                                                            | PRODUCTION 750: VFR750R (RC30), GSX-R750; GTI CUP: GOLF GTI 16V; 911 CUP: 911 TURBO (930)               | on    | none                 | 16, whole race                          | last        | off     |
| SUPER HANG-ON   | AFRICA, ASIA, AMERICA, EUROPE: one LINEAR course each                                                               | VFR750R (RC30), GSX-R750, 851                                                                           | on    | none                 | 16, whole race                          | last        | off     |
| OUTRUN          | 7 LINEAR: 6 roads (LLLL→A, LRLL→B, LLRR→C, RRLL→C, RLRR→D, RRRR→E) and one running the 15 stages in the map's order | TESTAROSSA, COUNTACH                                                                                    | on    | none                 | player only                             | —           | on      |
| TURBO OUTRUN    | 1 LINEAR: 16 stages, New York → Los Angeles                                                                         | F40 (red, right), 959 (silver, left)                                                                    | on    | none                 | 2, whole race                           | own entry   | on      |
| CHASE H.Q.      | 1 LINEAR: 5 stages                                                                                                  | 928, ESPRIT TURBO, COUNTACH, 911 TURBO (930), 288 GTO                                                   | off   | 1 at every stage end | one rival per stage, appearing ahead    | —           | on      |
| CISCO HEAT      | 1 course: 5 stages                                                                                                  | BROUGHAM TUNED, 300ZX (Z32)                                                                             | on    | none                 | 8 (4 of each), whole race               | last        | on      |
| OUTRUNNERS      | WEST ROUND, EAST ROUND (BRANCH)                                                                                     | 911 SPEEDSTER, RX-7 (FC3S), COBRA 427, ELDORADO, MINI, QUATTRO, COUNTACH, TESTAROSSA                    | off   | N per gate           | 8 (one of each vehicle), whole race     | last        | on      |
| COOL RIDERS     | 1 BRANCH: prestage, four three-way stages, final NEW YORK                                                           | VFR750R (RC30), VMAX 1200, RG500 Γ, FXRT SPORT GLIDE, R80 G/S PARIS-DAKAR, PX200E, GL1500, SUPER CUB 90 | on    | none                 | one rival per stage; seven in the final | —           | pending |
| FINAL LAP       | SUZUKA (CIRCUIT)                                                                                                    | 1987 Formula One cars (pending)                                                                         | on    | none                 | grid, whole race                        | last        | off     |
| WEC LE MANS 24  | LE MANS (CIRCUIT)                                                                                                   | 962C, C9                                                                                                | on    | none                 | grid, whole race                        | last        | off     |
| BIG RUN         | 1 LINEAR: 6 stages, rally raid                                                                                      | pending (959 rally-raid, 205 T16, PAJERO candidates)                                                    | off   | N at every stage end | whole race                              | last        | on      |
| RALLY STAGE     | 4 LINEAR mixed-surface stages (working set)                                                                         | DELTA HF INTEGRALE GROUP A, CELICA GT-FOUR (ST165) GROUP A, GALANT VR-4 GROUP A                         | on    | —                    | player only                             | —           | off     |

- **TSUKUBA CLUBMAN** is an original series in the manner of a late-1980s club race meeting at Tsukuba. Each class
  is one race of 5 laps on TSUKUBA (CIRCUIT): PRODUCTION 750 for 750 cc production superbikes (the VFR750R alone until
  the GSX-R750 is in the catalog), GTI CUP for the Golf GTI 16V and 911 CUP for the 911 Turbo. Each class is one-make:
  sixteen of its vehicle, in their four colors, with the player last on the grid. The rivals' pace falls from the
  pole to the back of the grid, as a qualifying order would set it. The clock extends at each of the three sector
  lines; colors are not fixed.
- **SUPER HANG-ON** drives period road superbikes, not Grand Prix racers. The field mixes the three
  vehicles in several colors. Its four courses are the original's, raised from the ROMs of its export sitdown/upright
  cabinet (MAME's `shangon`; [Original road data](original-road-data.md#super-hang-on)).
- **OUTRUN** adds the Countach as a second choice. The player avoids traffic and aims for a goal within time. Each
  of six classes drives one of the original's routes to its goal, taking each fork's side its route names; the seventh
  drives all 15 stages in the map's order, row by row from the left, its forks alternately left and right and each
  goal but the last joining the next stage.
- **TURBO OUTRUN** races the vehicle the player did not choose. Colors and grid sides are fixed by
  vehicle: the silver 959 starts left, the red F40 right. Its course is the original's 16 stages as one LINEAR course,
  raised from the ROMs of MAME's `toutrun` ([Original road data](original-road-data.md#turbo-outrun)); where the
  original stops at a leg's end and starts the next leg afresh, a join the original does not have carries the road on.
- **CHASE H.Q.** chases one rival per stage, each ahead of the player at the stage start: white Esprit
  Turbo, yellow Countach, silver 911 Turbo, blue 288 GTO, red 928. The player must pass each stage end
  first; there is no clock and no arrest.
- **CISCO HEAT** uses ordinary road appearances, without police livery or lights. BROUGHAM TUNED is one
  explicit finished specification, used unchanged on every course.
- **COOL RIDERS** pairs the player with one rival per stage; whoever reaches a fork first chooses the
  next stage. All routes merge into the final NEW YORK stage against seven rivals. The course holds
  fifty stage nodes; one run drives six stages.
- **WEC LE MANS 24** is about driving Le Mans in a Group C car. There is no real-time 24-hour play, fuel
  strategy, pit work, repair or tire choice.
- **RALLY STAGE** is an original game in the manner of a 1989 arcade release. Its core is surface
  changes between tarmac, gravel and snow within one run.
  There are no tire changes or service parks.
- **ENDURO RACER** is a series of a later stage; its bikes, rivals, colors and pace are decided then. Until then its
  reference course, the original's five stages as one LINEAR course of 12.14 km raised from the ROMs of MAME's
  `enduror` and `endurobl` ([Original road data](original-road-data.md#enduro-racer)), is a FREE PLAY course in no
  series.
- **SUPER MONACO GP** is a series of a later stage; its cars, rivals, laps, rank limits and time are decided then. Until
  then its reference courses, the original's race and qualifying courses as CIRCUIT courses of 5.27 km and 2.28 km
  raised from the ROMs of MAME's `smgp` ([Original road data](original-road-data.md#super-monaco-gp)), are FREE PLAY
  courses in no series.

## 6. Flow and screens

```text
TITLE: attract demo behind the logo; PRESS START, then the line SERIES / FREE PLAY / SETTINGS on the same screen
  SERIES:    SELECT SERIES → SELECT CLASS (only when several) → SELECT SESSION (RACE / TIME ATTACK)
             → SELECT VEHICLE + COLOR → SELECT MUSIC (series with tracks)
  FREE PLAY: SELECT COURSE (grouped by series, each course once) → SELECT VEHICLE + COLOR → OPTIONS → SELECT MUSIC
→ PRE-RACE card (doubles as loading) → READY → RACE → RESULT
RESULT: RETRY / CHANGE VEHICLE / back to the selection / TITLE
PAUSE:  RESUME / RETRY / QUIT
SETTINGS: MASTER, MUSIC and EFFECTS volume; CAR and BIKE camera; CAR and BIKE steering and its use; SLOW DOWN; controls
```

All screens are in one page and are drawn inside the 320×240 frame: text is a 40×30 grid of 8×8 font
tiles over the frame, and every choice is made inside the frame: every character, arrow and band edge sits on that
8×8 grid, never offset by pixels, while pictures (the logo, series images and the sky) are 16×16 tiles. All text is
English. TITLE shows the title logo over the attract demo. SELECT VEHICLE + COLOR is a catalog page per vehicle: its name, its image turning
through its yaw frames in its color, its torque and power curves and its physical values; left and right change the
vehicle, up and down change the color. Every vehicle comes
in four colors, each shown by its period paint name; the first is its default. PRESS START is the first user gesture,
which enables sound and requests fullscreen where the browser allows it, and TITLE then shows the line SERIES / FREE
PLAY / SETTINGS on the same screen. There is no continue. Behind TITLE the attract demo runs the RACE sessions of the
product classes in series and class order,
looping, 30 seconds a turn with no HUD and no sound, its series, class, vehicle and color written at the right. A turn
shows a real RACE of its class and field, its first vehicle in its first color driven by the player's run driver. The
demo holds only the shown class's race and the next class's, and every turn starts its race from READY: a class shown
again starts a new race. A race that ends is shown to the end of its RESULT delay, and its turn ends early. RESULT shows the outcome (GOAL or GAME
OVER), rank when two or more competitors are ranked, race time, best lap on circuits and new records; a TIME ATTACK on
a CIRCUIT shows its completed laps and its best lap, with no outcome line and no total time. DEV controls, DEV displays
and development series appear only when the URL has `dev=1`.

Menu screens are text on a plain background or a series image. A series' screens stand over the series image: SELECT
SERIES slides between the series images, and its title track plays through the series' screens. Menus show one item at a time, which left and right change like steering an
arcade wheel, wrapping at both ends; SETTINGS keeps a vertical list whose values left and right change. Once the
player has entered a series its screens are one place: from SELECT SERIES through SELECT SESSION to the PRE-RACE card,
in either direction, the series image stays on screen and only what is drawn over it changes, at once. Every other
change of screen, entering or leaving the series and the PRE-RACE card's change to READY included, goes through black.
TIME ATTACK shows the class's record (its time, the vehicle it was set with and, on a circuit, its lap) on SELECT
SESSION and at READY; there is no records menu, and a class's record is shown only inside that class. A series,
class or course that offers nothing to select is shown dimmed and cannot be chosen: CONFIRM on it is denied. While a
run loads, the frame shows the PRE-RACE card (class, session, course map, laps, field, start slot and, in TIME ATTACK,
the record); a failed load shows LOAD FAILED with RETRY and BACK. RESULT and the PAUSE menu are drawn over the stopped
frame, dimmed to half brightness. A URL that names a class or a course starts that run directly, for development and
tests: `series` and `class`, with `session=race` or `session=attack` (RACE when absent), name a class's run, and `course`
names a FREE PLAY run.

## 7. Start and finish

Every run uses a standing start. All vehicles are held for 3 seconds of READY while signal lamps
count down to GO; engines rev freely with the throttle. There are no rolling starts and no jump starts.

When the player finishes, the driver takes over the player's vehicle and brakes it to a stop on the
runout while the rest of the field keeps driving; RESULT follows after 3 seconds. The player's rank is
fixed at the finish: competitors unfinished at that moment rank behind. After GAME OVER the player's
throttle is released and the vehicle coasts, still answering the player's steering and
brake; RESULT follows after the same delay. A TIME ATTACK on a CIRCUIT has no finish and no takeover: it ends only
when the player quits it from PAUSE.

## 8. Camera

The product has one camera, shared by cars and motorcycles: the pseudo projection behind the player at constant
depth. Its pitch is the body's pitch, whatever the body's yaw, so vehicle images need no pitch variants. Its yaw
follows what the player chooses in SETTINGS for each form, CAR CAMERA and BIKE CAMERA: FACING, the way the body points
(a car's default), or MOVING, the way the vehicle travels (a bike's default). Within 45° of the road direction the
camera takes that yaw at once; beyond it the camera stays at the limit and the vehicle is shown turned. It stands 6 m behind the player's base point and 2 m above it with a level body, and holds
that point on one screen row whatever the pitch: only the base point's height is sprung, so on a steady grade the
player keeps its row, while jumps and suspension motion move the vehicle on screen and leave the view calm. The camera
may pass below the road.

## 9. HUD

The product HUD is drawn inside the 320×240 frame. It reads only published observations: race facts,
the player vehicle's observations and the camera's. It is a set of independent
elements, each reading one observation; the active run rules determine which appear.

| Condition                      | Elements                                                                    |
| ------------------------------ | --------------------------------------------------------------------------- |
| Always                         | SPEED (km/h), GEAR, race time, tachometer, steering, throttle, brake, tires |
| READY                          | Signal lamps, course name and session                                       |
| Clock on                       | TIME remaining, EXTEND                                                      |
| Two or more competitors ranked | POS n/m                                                                     |
| Next gate has a rank limit     | PASS n                                                                      |
| LINEAR or BRANCH               | STAGE n                                                                     |
| CIRCUIT                        | LAP x/y (LAP x without a lap count), lap time, BEST lap                     |
| One rival per stage            | TARGET distance while that rival is ahead                                   |
| Ended                          | GOAL, or GAME OVER with TIME UP or RANK OUT, until RESULT                   |
| Camera held at its yaw limit   | An arrow at the screen's edge pointing the way the road goes                |
| TIME ATTACK record exists      | RECORD at READY; the difference at each gate and lap                        |
| Slowing needed (SETTINGS)      | SLOW DOWN                                                                   |

Race rules sit in the upper rows, the vehicle's state in the lower rows, and passing notices in the
middle; the road stays clear, and the steering picture may lie over the player's vehicle. Times read `1'23"456`. TIME
turns red under ten seconds and yellow for two seconds after an extension, shown as EXTEND with its seconds. A finished
lap's time holds for two seconds. SLOW DOWN shows while the player drives faster than the vehicle could slow for
the road just ahead, unless SETTINGS turns it off: yellow, then orange, then blinking red as the excess grows. Three signal lamps light red one per second and turn green at GO. The upper rows'
race rules and the passing notices are drawn in ornate fonts, a light-topped ramp of color down each glyph: the
upper row and GOAL or GAME OVER large, the rest small; menus and screens keep the plain font.

The lower row, from the left:

- **Tires:** above the speed, the vehicle's axles seen from above, a car's an H and a bike's two tires in a line, each
  axle's tires colored by how much of their grip they use: green, yellow at the tire's knee (where its grip begins to level
  off) and red at its limit, changing smoothly between, and grey in the air.
- **Speed:** three italic seven-segment digits in km/h, right-aligned, in the blue-green of a vacuum fluorescent display;
  an unused leading digit shows all its segments unlit, and unlit segments are a dark trace of the lit color.
- **Steering:** a picture of the vehicle's steering wheel (a bike's top bridge), 48 pixels square, turned as the front
  wheel actually is: its listing names the picture (montecarlo for TESTAROSSA and CORVETTE C4, prototipo for 911
  TURBO 3.3 and DELTA HF INTEGRALE, mod02 for GOLF GTI 16V and the DRIFT TUNED cars, top-bridge for the bikes). Under it a white bar grows from
  its centre toward the side of the steering actuator, so a key's input grows to full and an analog one follows it.
- **Tachometer:** 26 italic bars, 2 pixels wide, rising in a quadratic curve from 4 to 24 pixels, from 0 to 110 % of
  the redline; a bar lights once the engine reaches its speed and stays dark otherwise. Bars are green, yellow for the 4
  just before the redline and red from it, and all red while the limiter cuts fuel; each is shaded from a dark base to
  a light top.
- **Gear:** one italic seven-segment digit in the same blue-green, yellow briefly at a shift.
- **Throttle and brake:** green and yellow bars of the actuators; the part the vehicle's protections take away (beyond
  the effective throttle opening, and of the brake at the axle they reduce most) shows red at the bar's end.

There are no labels and no shift light. Text and HUD parts use one original font of 8×8 tiles (uppercase and lowercase
letters, digits and symbols) in the same indexed format as sprites and backgrounds: 15 colors and transparency per
palette, one palette per tile. Fork guidance is course appearance (signs), not HUD. DEV UI stays separate from the
HUD.

## 10. Records and settings

The browser keeps one versioned record of settings and records:

- **Settings:** each vehicle's selected color, the three volumes, the car and bike cameras, the car and bike steering
  and the latest selections, FREE PLAY's options included.
- **TIME ATTACK records:** one table per class, keyed by the class and the goal reached (a circuit has one). The value
  is the best lap on a CIRCUIT and the completion time otherwise, with the record run's gate times (within the record
  lap on a CIRCUIT) and the vehicle it was set with.

Records are TIME ATTACK's alone; RACE and FREE PLAY record nothing. A record keeps the identities of its course and
of its vehicle's definitions and is discarded when either changes. On a LINEAR or BRANCH course only a run that
reaches GOAL records. On a CIRCUIT a lap that beats the record is recorded when it is completed, and NEW RECORD
sounds then, so ending the run, or leaving it any other way, never loses it. READY shows the record and RESULT judges
the run against the reached goal's record, or on a CIRCUIT shows the run's best lap against the record, with NEW
RECORD when it is beaten. While a run is driven, each gate shows the difference from the record run for two seconds,
green when faster and red when slower; on a CIRCUIT each lap is compared with the record lap, and on a course with
several goals the record is compared only once the run can reach one goal. SETTINGS can clear all records.

Steering is a rule of the driver, an aid and not a mechanism of the vehicle: the player and the AI drivers share the
same physics (tires, suspension, and the steering rack's limit and speed). The player chooses the rule on SETTINGS for
cars and for bikes: the reference (FRONT, the front wheel, or CENTER, the centre of mass) and the front tire's use at
full steering (100%, 95% or 90%), CENTER and 95% until chosen. It applies only while the player drives. Every AI
driver (rivals, traffic, reference driving, the attract demo and the driver who takes over after GOAL) steers by one
rule, CENTER and 100%, whatever the player chose and whatever pace it drives at.

An equal time keeps the earlier record. Color, music, camera and steering are not record conditions. Runs rebuilt by
DEV tuning record nothing. There is no name entry, ghost or online ranking.

## 11. Input and display

- **Keyboard:** Left/Right steer, Up or Z accelerates, Down or X brakes; menus use the arrows, Enter and
  Escape; Escape pauses.
- **Touch:** the touch area is the whole screen in both orientations, the frame and the margins around
  it included. While driving, its left half is analog steering and its right half the pedals. In menus,
  a flick in the left half moves the selection, a tap in the right half confirms, and the top-left
  corner goes back. A pause button sits in a corner.
- **Gamepad:** standard mapping: left stick or D-pad steers, RT or A accelerates, LT or B brakes, Start
  pauses.
- There is no key remapping, gyro control, manual transmission, driving assist or manual recovery.
  Recovery is automatic.

In landscape the 4:3 frame fills the screen's height and is centered; in portrait it spans the width at
the top. The touch area does not depend on where the frame is.

## 12. Interaction

Competitors and traffic have physical extent and contact each other, cars and motorcycles included.
Vehicles that touch push each other apart, ahead-behind or side to side, with equal and opposite forces
that act through the ordinary vehicle mechanics. Each vehicle occupies a box as wide and long as the vehicle is wide,
and as high as it is high, laid along the road whatever way it faces; cones and barricades occupy the square of their
width. Vehicles moving fast never pass through each other or an object between frames. A
vehicle in the air passes over one below it. Contact
never turns a vehicle, never topples a motorcycle, never ends a run by itself and causes no damage.

A road is made of lanes. Every course has at least one lane, and the course's centre line is the centre of one of
them. Lanes begin and end by widening from nothing or narrowing to nothing, and a median may separate them; a road
may have lanes and no painted lines.

Traffic drives as on a public road: each vehicle keeps its lane and the traffic speed, leaves its lane
only where the lane ends or a solid object stands in it, and does not yield to faster vehicles. Rivals
race: they are bound neither to lanes nor to the traffic speed, drive the racing line and thread between other
vehicles to pass them. Neither hits another vehicle or a solid object on purpose.
Drivers read the surface ahead: on a surface with less grip they corner and brake within what it gives.

Walls — guardrails, walls and cliff faces — run along the road. A visible wall stands on its line, rising
above the road, dropping below it, or both, in strips of color that may repeat along the road. A solid
wall cannot be crossed at any height: a vehicle touching it is pushed back across the road, and sliding
along it slows the vehicle. A wall may be invisible, and a wall may be for looks only. The edge of the
course's ground is an invisible solid wall, except where the course opens it: there a vehicle can drive
off, falls, and returns to the road.

A roadside object such as a tree, a sign or a building can be solid; grass, bushes and other scenery are
not. A solid object is solid across a width no wider than its picture and has no depth along the road. A
vehicle that meets one is stopped or pushed aside, and a vehicle held against one returns to the road by
itself. Solid objects are never damaged.

A movable object such as a cone or a barricade has a mass. A vehicle that hits one knocks it away and
loses speed in proportion to that mass: a cone costs almost nothing, a heavy barricade is felt. A knocked
object shows one picture while it flies and another once it has landed, lies where it fell for the rest of
the run and is no longer solid.

## 13. Music and sound effects

Engine, tire and contact sound follow physical observations. A hit on a vehicle, a wall or an object sounds
once, at the instant it begins, louder the harder the hit; sliding along a wall or another vehicle makes no
sound of its own. Only contacts of the player's own vehicle sound.

Music is original. Each series has a title track, which plays from SELECT SERIES through the series' screens and
fades out into READY, and zero or more race tracks. SELECT MUSIC offers the race tracks of the series (every
track in FREE PLAY) and MUSIC OFF, a race without music; it appears only when there is a track to
choose, and choosing plays nothing. The selected
track starts from its beginning at READY and loops; it stops while the run is paused and continues from
the same place. At GOAL and at GAME OVER an effect plays once while the track fades out beneath it. Menus
outside a series and RESULT have no music. RETRY keeps the track; CHANGE VEHICLE passes SELECT MUSIC again.

Sound effects cover the signal lamps and GO, checkpoint and lap crossings, time extensions, menu commands,
GOAL and GAME OVER, the last lap of a circuit and a new record. One crossing gives one sound: GOAL's effect, else the
time extension, else the final lap when the lap just begun is the last, else the crossing itself.

Music and effects have separate volumes; engine, tire and contact sound follow the master volume alone.
In SETTINGS the latest selected track plays while the cursor is on MUSIC, so its volume is set by ear.
Sound starts at PRESS START and runs while the page is visible. While no run is being driven, the vehicle
sounds and the run's track are silent, and only menu sounds, a series' title track and the SETTINGS audition play.

## 14. References and remaster

A course preserves its reference's topology, characteristic turn order, elevation sequence and visual
identity within the pseudo projection and mechanics, and records deliberate departures. Provenance
(editions, layouts, sources, departures) lives in authoring project data, not in runtime documents.

## 15. Rendering and authoring

The view combines a tiled background, road and sprites with the player and HUD. Vehicle brake lamps select a saved
palette. Every picture, a vehicle's, a cone's or a barricade's included, is a flat picture drawn at its base point, the
centre of what it shows, standing above it and lying on the nearer ground below it; the camera keeps the player's
picture at the same place and size. Every vehicle, and every cone or barricade, casts a shadow on the road directly
below it, grounded or in the air, so the height and landing point of a jump read at a glance: a second picture paired
with each picture, drawn at the same size with its base on the road beneath, turning with the vehicle and halving the
road's brightness; it falls on the road alone, never on walls, vehicles or objects. Vehicle pictures and their shadows
are generated, every size of each its own picture, from a solid built from four views of the vehicle (front, side, rear
and top), by the [picture contract](image-assets.md#picture-contract). Tires throw puffs by the surface under them:
smoke when sliding on dry asphalt (more the more they slide); spray on wet asphalt and through water; dust in the colour
of the shoulder, dirt and sand when rolling or sliding there, and of grass and earth when sliding on grass. Every
vehicle in view throws them. Puffs are opaque pictures like the rest, hidden by what stands before them: a front tire's
puffs pass behind the player's body, a rear tire's are drawn over it ([Tire puffs](tire-puffs.md)). Courses and assets
are saved files.
Courses, images and definitions are saved documents. One authoring core compiles them for the build, the CLI and the
workbench. The workbench is a browser page served with each build: it edits documents, previews measured racing lines
and reference times, authors sprites and palettes, and starts the game on its own build. Its changes leave as one
archive of documents. [Development](development.md) owns the commands.

The workbench's course editor shows how a course is written as well as how it looks: repeats and single elements,
references and absolute values, authored points and derived lines are drawn apart. Edits keep that form; changing it
is always a named operation an author chooses. Cleaning operations and a list of findings keep course data tidy.

## 16. Ground

Ground is an ordered list of colored Strips covering the whole plane,
including open outer sides. Later Strips replace earlier colors or erase them to transparency. Transparent
areas reveal the background below as well as above the horizon. Material and color can be authored independently on the same Strip. [Content and gameplay](content-and-gameplay.md#strips)
owns authoring; [Architecture](architecture.md#strip-rendering) owns preblending and pixel filtering.

Ground and walls are drawn by one method, LEVEL-POINT, defined only in the rendering contract linked above; there is
no display setting for it. Ground contains no image assets;
lettering, arrows, curbs and cliff edges expand from saved Strip constructs.
