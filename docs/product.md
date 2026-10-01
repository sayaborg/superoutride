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
Every Session is single-player; there is no split screen or online play.

A reference game's special controls are not adopted merely because it had them: there is no turbo
button, jump control or siren.

### Era

The world is the late 1980s. Vehicles existing by 1989 are eligible, including older cars; a vehicle's
model year, market, grade, engine, appearance and sound describe one consistent specification, without
later parts or outputs. Reference games released in the 1990s are eligible; their roads are remastered
into this world.

### Vehicle identity

A vehicle behaves identically in every mode, series and course. A different specification of the same
model (road and rally-raid, road and Group A) is a different vehicle. Difficulty never changes vehicle
mechanics; it is expressed by Session rules and rival driving (§3).

## 2. Structure

| Level   | Meaning                                                                        |
| ------- | ------------------------------------------------------------------------------ |
| MODE    | How to play: ARCADE, FREE PLAY or TIME TRIAL                                   |
| SERIES  | In ARCADE, a reference game or original game: its courses, vehicles and rules  |
| COURSE  | One road to drive; a course may belong to several series or to none            |
| VEHICLE | The vehicle the player drives                                                  |
| STAGE   | The route interval between consecutive race gates (checkpoints and the finish) |

LINEAR means one route without forks or laps (not a straight road), BRANCH a course with forks and
several goals, and CIRCUIT a lapped course. Stages are rule intervals; they need not coincide with
course Sections. Every delivered product course is available in FREE PLAY and TIME TRIAL, including
courses that belong to no series. Series, courses and vehicles are all available from the start;
there is no unlocking, currency or progression.

## 3. Session rules

A Session combines these rule components. Forks, recovery and timing mechanics are common to all
Sessions ([Content and gameplay](content-and-gameplay.md) owns their definitions).

| Component          | Values                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| Clock              | On or off. On: the checkpoint clock with per-checkpoint time extensions                 |
| Rank limits        | Per race gate: a limit N, or none                                                       |
| Competitor entries | Vehicle, color, pace ratio, stage interval and appearance (grid slot or ahead distance) |
| Player slot        | The player's own entry position, or the last grid slot                                  |
| Laps               | Circuits only                                                                           |
| Traffic            | On or off                                                                               |

**Field.** A Session has at most sixteen competitors, the player included. The entries of a series
course list its whole field in grid order. The player occupies one entry of the selected vehicle; the
remaining entries are the rivals. With the player slot "own entry position" the player starts where
that entry stands (Turbo OutRun); with "last" the player starts in the last slot and the rivals keep
their order in front. Rivals avoid repeating a vehicle/color pair where the entries allow.
Cars and motorcycles may share a field.

**Stage interval and appearance.** An entry takes part in a stage interval. An entry starting at the
first stage stands in its grid slot. An entry joining later appears ahead of the player by its ahead
distance when the player enters its first stage, moving at its driver's planned speed there. After its
last stage ends for the player, the entry leaves as soon as it is out of view. Whole-race rivals, one
rival per stage and a final all-rival stage are all entries with different intervals.

**Rank limits.** A gate with rank limit N fails the player at the moment the N-th other competitor
crosses it before the player. An exact tie in event time goes to the player. Rank limits count the
competitors present in the Session at that moment.

**Clock.** The clock starts at GO; each newly earned checkpoint extends it once, and expiry ends the
run in GAME OVER. The time allowance on a course derives from the player's selected vehicle: the
reference driver's time for that vehicle on that course and route, multiplied by the series margin.

**Rival pace.** In ARCADE, rival driving is relative to the player's selected vehicle. Each entry has a pace ratio
p. At every route station a rival's target speed is at most p times the speed of the player's vehicle
in its reference run at that station on the selected route. Thus the choice of vehicle does not change
the difficulty, and no vehicle's mechanics change. The limitation is visible driving, not a hidden
correction.

**Forks.** The first competitor to cross a fork's lock line selects the route for the whole field;
alone, that is the player. Unselected roads show warnings and closure signs; vehicles remaining there
at closure recover to the selected road. Recovery preserves earned progress.

**Traffic** vehicles are not competitors: they take no rank and never select a route.

## 4. Modes

**ARCADE** runs a series course with that series' vehicles and rules (§5). Its settings are fixed;
the player chooses the course, vehicle and color. A series may fix colors.

**FREE PLAY** runs any product course with any vehicle. There is no clock. OPTIONS choose the rival
count (0–15), the rival vehicle pool (ALL, CARS or BIKES; default: the player's vehicle form), traffic
(on/off where the course has traffic) and laps on circuits. Rival vehicles and colors are drawn from
the pool by the Session seed. FREE PLAY rivals drive at their own vehicles' pace, so the choice of
vehicles shapes the race; FREE PLAY needs no reference runs.

**TIME TRIAL** runs any product course alone: no rivals, no traffic, no clock. On circuits the player
chooses the lap count. On forks the player selects the route by driving; the record belongs to the
route driven.

## 5. Series

Series display names are the reference titles. Course and vehicle choices follow; rule values marked
in §3 are set during course production.

| Series         | Courses                                                   | Vehicles                                                                                                | Clock | Rank limits          | Field                                   | Player slot | Traffic |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- | -------------------- | --------------------------------------- | ----------- | ------- |
| SUPER HANG-ON  | AFRICA, ASIA, AMERICA, EUROPE (LINEAR)                    | VFR750R (RC30), GSX-R750, 851                                                                           | on    | none                 | 16, whole race                          | last        | off     |
| OUTRUN         | 1 BRANCH: 15 stages, 5 goals                              | TESTAROSSA, COUNTACH                                                                                    | on    | none                 | player only                             | —           | on      |
| TURBO OUTRUN   | 1 LINEAR: 16 stages, New York → Los Angeles               | F40 (red, right), 959 (silver, left)                                                                    | on    | none                 | 2, whole race                           | own entry   | on      |
| CHASE H.Q.     | 1 LINEAR: 5 stages                                        | 928, ESPRIT TURBO, COUNTACH, 911 TURBO (930), 288 GTO                                                   | off   | 1 at every stage end | one rival per stage, appearing ahead    | —           | on      |
| CISCO HEAT     | 1 course: 5 stages                                        | BROUGHAM TUNED, 300ZX (Z32)                                                                             | on    | none                 | 8 (4 of each), whole race               | last        | on      |
| OUTRUNNERS     | WEST ROUND, EAST ROUND (BRANCH)                           | 911 SPEEDSTER, RX-7 (FC3S), COBRA 427, ELDORADO, MINI, QUATTRO, COUNTACH, TESTAROSSA                    | off   | N per gate           | 8 (one of each vehicle), whole race     | last        | on      |
| COOL RIDERS    | 1 BRANCH: prestage, four three-way stages, final NEW YORK | VFR750R (RC30), VMAX 1200, RG500 Γ, FXRT SPORT GLIDE, R80 G/S PARIS-DAKAR, PX200E, GL1500, SUPER CUB 90 | on    | none                 | one rival per stage; seven in the final | —           | pending |
| FINAL LAP      | SUZUKA (CIRCUIT)                                          | 1987 Formula One cars (pending)                                                                         | on    | none                 | grid, whole race                        | last        | off     |
| WEC LE MANS 24 | LE MANS (CIRCUIT)                                         | 962C, C9                                                                                                | on    | none                 | grid, whole race                        | last        | off     |
| BIG RUN        | 1 LINEAR: 6 stages, rally raid                            | pending (959 rally-raid, 205 T16, PAJERO candidates)                                                    | off   | N at every stage end | whole race                              | last        | on      |
| RALLY STAGE    | 4 LINEAR mixed-surface stages (working set)               | DELTA HF INTEGRALE GROUP A, CELICA GT-FOUR (ST165) GROUP A, GALANT VR-4 GROUP A                         | on    | —                    | player only                             | —           | off     |

- **SUPER HANG-ON** drives period road superbikes, not Grand Prix racers. The field mixes the three
  vehicles in several colors.
- **OUTRUN** adds the Countach as a second choice. The player avoids traffic, chooses forks and aims
  for a goal within time.
- **TURBO OUTRUN** races the vehicle the player did not choose. Colors and grid sides are fixed by
  vehicle: the silver 959 starts left, the red F40 right.
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
- Enduro Racer is not included.

## 6. Flow and screens

```text
TITLE (PRESS START) → SELECT MODE
  ARCADE:     SELECT SERIES → SELECT COURSE (only when several) → SELECT VEHICLE + COLOR
  FREE PLAY:  SELECT COURSE (grouped by series) → SELECT VEHICLE + COLOR → OPTIONS
  TIME TRIAL: SELECT COURSE → SELECT VEHICLE + COLOR → LAPS (circuits only)
→ SELECT MUSIC → RACE → RESULT
RESULT: RETRY / CHANGE VEHICLE / back to the selection / TITLE
PAUSE:  RESUME / RETRY / QUIT
TITLE:  SETTINGS (MASTER, MUSIC and EFFECTS volume; controls)
```

All screens are in one page, and all text is English. PRESS START is the first user gesture, which
enables sound and requests fullscreen where the browser allows it. There is no continue. While the
title is idle, an attract demo drives a product ARCADE course with the driver at the wheel; any input
returns to the title. RESULT shows the outcome (GOAL or GAME OVER), rank when there were rivals, race
time, best lap on circuits and new records. Development courses appear only with DEV.

## 7. Start and finish

Every Session uses a standing start. All vehicles are held for 3 seconds of READY while signal lamps
count down to GO; engines rev freely with the throttle. There are no rolling starts and no jump starts.

When the player finishes, the driver takes over the player's vehicle and brakes it to a stop on the
runout while the rest of the field keeps driving; RESULT follows after 3 seconds. The player's rank is
fixed at the finish: competitors unfinished at that moment rank behind. After GAME OVER the player's
throttle is released and the vehicle coasts; RESULT follows after the same delay.

## 8. Camera

The product has one camera, shared by cars and motorcycles: the pseudo projection rigidly fixed behind
the player at constant depth, pitching with the body, with its height solved so the player sits at
its target row. The player does not select cameras.

## 9. HUD

The product HUD is drawn inside the 320×240 frame. It reads only published observations: race facts,
the player's final input sample and the player vehicle's observations. It is a set of independent
elements, each reading one observation; the active Session rules determine which appear.

| Condition                  | Elements                      |
| -------------------------- | ----------------------------- |
| Always                     | SPEED (km/h), GEAR, race time |
| Clock on                   | TIME remaining, TIME EXTEND   |
| Other competitors present  | POS n/m                       |
| Next gate has a rank limit | PASS n                        |
| LINEAR or BRANCH           | STAGE n                       |
| CIRCUIT                    | LAP x/y, lap time             |
| One rival per stage        | Distance to that rival        |

Vehicle-state elements follow: steering, throttle and brake (both the player's input and the vehicle's
actual values) and a tachometer. Text uses one original 8×8 bitmap font of uppercase letters, digits
and symbols. Fork guidance is course appearance (signs), not HUD. DEV UI and the DEV HUD stay separate.

## 10. Records and settings

The browser keeps one versioned record of settings and records:

- **Settings:** each vehicle's selected color, the three volumes and the latest selections.
- **TIME TRIAL records:** best time and best lap for each course, route, lap count and vehicle.
- **ARCADE records:** best completion time for each series, course, reached goal and vehicle.

An equal time keeps the earlier record. Color and music are not record conditions. Sessions rebuilt by
DEV tuning record nothing. There is no name entry, ghost or online ranking.

## 11. Input and display

- **Keyboard:** Left/Right steer, Up or X accelerates, Down or Z brakes; menus use the arrows, Enter and
  Escape; Escape pauses.
- **Touch:** analog steering in the left half and pedals in the right half of the touch area; menus use
  taps; a pause button sits in a corner.
- **Gamepad:** standard mapping: left stick or D-pad steers, RT or A accelerates, LT or B brakes, Start
  pauses.
- There is no key remapping, gyro control, manual transmission, driving assist or manual recovery.
  Recovery is automatic.

In landscape the 4:3 frame fills the screen and the touch area covers it. In portrait the frame spans
the width at the top and the area below it is the touch area.

## 12. Interaction

Competitors and traffic have physical extent and contact each other, cars and motorcycles included.
Contact never ends a run by itself and causes no damage. The response model, traffic behavior, movable
and fixed roadside objects, barriers and track limits are designed at the start of Stage 13.

## 13. Music and sound effects

Engine and tire sound follow physical observations. Music is original; the player selects a track before
each race. Sound effects cover the countdown, gate crossings, time extensions and menus. Music and
effects have separate volumes.

## 14. References and remaster

A course preserves its reference's topology, characteristic turn order, elevation sequence and visual
identity within the pseudo projection and mechanics, and records deliberate departures. Provenance
(editions, layouts, sources, departures) lives in authoring project data, not in runtime documents.

## 15. Rendering and authoring

The view combines a tiled background, road and sprites with the player and HUD. Vehicle brake lamps
select a saved palette. Courses and assets are saved files. The CLI compiles courses, reports
diagnostics and renders previews through the game scene. The Sprite Tool edits image inputs and exports
compiled sprites. [Development](development.md) owns the commands.

## 16. Ground

Ground is an ordered list of colored Strips covering the whole plane,
including open outer sides. Later Strips replace earlier colors or erase them to transparency. Transparent
areas reveal the background below as well as above the horizon. Material and color can be authored independently on the same Strip. [Content and gameplay](content-and-gameplay.md#strips)
owns authoring; [Architecture](architecture.md#strip-rendering) owns preblending and pixel filtering.

The product ground-display setting defaults to LEVEL-POINT. DEV provides its control, and
switching redraws the current scene without changing vehicle state, camera or Session progress.
[Browser](browser.md#ground-display-setting) owns operation and setting lifetime. The three rendering
modes are defined only in the rendering contract linked above. Ground contains no image assets;
lettering, arrows, curbs and cliff edges expand from saved Strip constructs.
