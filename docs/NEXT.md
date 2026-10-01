# Next task checkpoint

## Current state

- One compiled graph scene serves RIBBON COAST, RIBBON FORK, RIBBON RING and RIBBON ROUGH with CLASSIC/CUSTOM Sessions;
  RIBBON ROUGH is an untimed evaluation course.
- Course documents use PIs, `at` positions, Lateral values, Strips, Carriageways and gates.
  Circuits are closed cycles of two or more Sections.
- One manifest verifies all delivered content, including vehicle and game-wide driving definitions and surface materials.
  The content build compiles every delivered file from authored documents in one pass.
- Surface color and material are authored with Strips, with LEVEL-POINT as the default of three display methods; sprites are indexed.
  BG is one infinite tiled plane with a linear vertical row mapping.
- Build generates vehicle envelopes, reference runs and time budgets; their vehicle and course identities derive
  from delivered document SHA-256. Tire audio uses UNIFIED.
- Engine sound load is the powertrain's effective opening.
- Stage 10 is complete: the race owns competitor mechanics in fixed steps and publishes facts (time-ordered events,
  Route with its fork choices, borrowed competitor observations); drivers intend lanes and target exits, rival exits
  derive from the Session seed; loading coverage, recovery policy and reference identities each have one owner.
- Stage 11 is complete: the audio scene and sound graph are separate from the browser; engine sounds, surface sounds
  and the game-wide sound settings are content documents; every sound value is derived from physics or a DEV setting;
  exhausts are collector graphs.
- The [product specification](product.md) is the target for Stages 12–16. The implementation still uses the
  CLASSIC/CUSTOM mode names and course-owned CLASSIC settings; all competitors share one vehicle; series, TIME TRIAL,
  traffic, collisions, music, sound effects and the product front end are not implemented.

Next PR: **12-4 — View consolidation**, its next PR: time the renderer from its caller.

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage 12 — Product shell

Define input, run state, framebuffer, persistent player data, data-driven Sessions, the product front end and the
product HUD independently of DEV, as specified in the [product specification](product.md).

- **12-4 — View consolidation:** separate small PRs: time the renderer from its caller; remove the unimplemented
  course-sprite reader branch; move the 45° bank calibration into sprite-set data; remove the unconsumed Route
  `renderHeight.distanceToNextVertex`, the `sStart`/`sEnd`/`segmentIndex` fields of Route `renderHeight.sample()`, the
  route-level environment reader in the visual readers (unused since 12-4d) and
  `EnvironmentReader.distanceToNextInterval`.
- **12-5 — Shell leftovers (delete):** the numeric selector branch, the thin selector-model layer, the misplaced
  calibration stepper, the unused touch heuristic, the unused `presentation` getter, the uncalled `shell.dispose()`
  (and the audio lifecycle's returned `dispose`, which only it calls), the second CLASSIC preset resolution and the
  stale `StripPiece.value` comment ("renamed in the naming stage").
- **12-6 — Framebuffer:** RGB555; one authority for the 320×240 logical frame.
- **12-7 — Player settings:** one versioned persistent record for each vehicle's selected color, the three volumes
  and the latest selections.
- **12-8a — Mode names (rename only):** CLASSIC → ARCADE and CUSTOM → FREE PLAY in code, documents and URL values.
- **12-8b — Series documents:** a `series` content kind owning ARCADE settings (courses, vehicle candidates, competitor
  entries, rule components, time margin); course documents keep geometry, gates, grid slots and the lap maximum and lose
  `rules.classic`. The RIBBON courses form a DEV series shown only with DEV. Split into a (add series) and b (remove
  course CLASSIC settings) if one review would be exceeded.
- **12-8c — Competitor vehicles:** every competitor has its own vehicle, calibration and envelope; runout admission
  covers every vehicle in the field; time budgets are keyed by course, vehicle and route state; the Session product
  maximum becomes sixteen competitors including the player.
- **12-8d — Session rule components:** clock, per-gate rank limits (failure at the N-th earlier crossing, ties to the
  player), competitor entries with stage intervals and grid or ahead appearance, player slot (own entry or last),
  ARCADE rival pace ratio (target speed at most p times the player vehicle's reference speed at the route station), and
  seeded rival vehicle/color assignment for FREE PLAY pools. Forks keep first arrival; there is no fork-decider or
  until-fork lifetime component. This settles the Rival intent row of the pending-decisions table.
- **12-8e — TIME TRIAL:** the third mode; solo, no traffic, no clock, route chosen by driving.
- **12-9 — Start and finish:** remove `updateHeldVehicle`; a held start constrains the body explicitly inside the one
  vehicle update while the powertrain runs; READY has one meaning (today both the start phase and the checkpoint
  clock have a READY state). Signal lamps count down the 3-second hold. After the player's finish the driver takes
  over the player's vehicle and stops it; after GAME OVER the throttle is released; RESULT follows after 3 s (a DEV
  setting), and the rest of the field keeps driving.
- **12-10 — Camera:** one product camera, as specified; the body-yaw/movement-yaw choice remains DEV only. Decide
  from playability evaluation whether a sprung camera mount or a ground-clearance rule is wanted (criterion: the view
  must not shake excessively over elevation changes). The loading window covers every camera method. Rename camera
  yaw mode and current-camera-profile names according to the glossary. Use the camera definition's `dCam` for the
  display-side rearward offset instead of `CURRENT_CAMERA_DISTANCE_METERS`. Define the fixed 40 px/m player-depth
  display scale directly instead of deriving it from `CAR_WIDTH_METERS`.
- **12-11 — Ground sampling:** make a footprint-centred box the default Strip display method (dyadic box in s,
  lateral integration across the pixel), keeping LEVEL-POINT as the cheaper method. Confirm with the RIBBON ROUGH
  evaluation and real-device performance.
- **12-12 — Front end:** the screens and flow in one page, PRESS START as the sound and fullscreen gesture, PAUSE
  menu, RESULT, landscape and portrait layouts with the touch area, Escape and gamepad Start pause. URL parameters
  remain DEV and test deep links: rename `mode` to `course` and `session` to `mode`. Pass the manifest-derived course
  list explicitly instead of the mutable `BROWSER_COURSE_MODES`.
- **12-13 — Product HUD:** independent elements drawn inside the game frame from published observations with the
  8×8 bitmap font; the active rules select the elements. Separate product and DEV observations in the render result,
  including the performance HUD's ground (Strip) metrics. Place the vehicle-state elements and review the layout.
- **12-14 — Records:** TIME TRIAL and ARCADE records in the persistent record; DEV-tuned Sessions record nothing.
- **12-15 — Language:** make all UI English.

## Stage 13 — Interaction

Give vehicles physical extent and let them meet each other and traffic. Contact never ends a run and causes no
damage; cars and motorcycles may share a field.

- **13-1 — Vehicle dimensions:** vehicle mechanics documents declare dimensions; derive the course coordinate-domain
  margin from vehicle reach. The 40 px/m display scale stays independent.
- **13-2 — Vehicle contacts:** contact response between competitors, cars and motorcycles included; the response
  model is proposed at the start of this stage.
- **13-3 — Traffic:** traffic vehicles and their Session settings. Traffic does not participate in competitive route
  locking or ranking.

## Stage 14 — Music and sound effects

- **14-1 — Music:** a music bus in the sound graph, the MUSIC selection screen and the MUSIC volume.
- **14-2 — Sound effects:** an effects bus for countdown, gate, time-extension and menu sounds, and the EFFECTS volume.

## Stage 15 — Production pipeline

Build a shared authoring core and tools, with author-confirmed content independent of build-time reference driving.

- **15-1 — Authoring foundation:** core and CLI.
- **15-2 — Workbench:** workbench and sprite module. The sprite module authors multiple named color palettes per image (and hand-authored lighting palettes per color), keeps palette slot 15 reserved for the brake lamp in vehicle images (quantization never assigns artwork to it; lamp pixels can be marked for it), assembles vehicle sprite sets (yaw/bank bindings and the set's brake-lamp colors), and previews every color, lighting and lamp state. Palette adjustment derives a new named palette from an existing one by hue, saturation, lightness and tint changes on selected slots, applied to every image of a set at once in a perceptual color space; the reserved slot is never adjusted, only the resulting explicit palettes are saved, and each can then be edited slot by slot.
- **15-3 — Course editor.**
- **15-4 — Definition modules:** authoring for vehicle mechanics, vehicle appearance, sound and series documents.
- **15-5 — Time limits and CI:** the tool's reference driving generates the time budgets for every series course,
  candidate vehicle and route; the author sets the series time margin and confirms each course's generated set as a
  whole. Builds do not run reference driving, so reference workers no longer read the build back and the hand-listed
  model identity disappears. Review the route-count ceiling before branch courses with three-way forks. Simplify CI.

## Stage 16 — Produce product courses

Create the selected courses using the Strip schema and file/CLI authoring workflow. Review appearance,
driving experience and time margins on real devices. The first product target is the OUTRUN, SUPER HANG-ON and
CHASE H.Q. series, which together use every Session rule component. The following production and authoring goals
are collected from the topic specifications; their order within this stage is not yet scheduled.

### Reference and remaster goals

Provenance lives in authoring project data (observations), not in the runtime course document.

Record exact edition, cabinet/region or circuit layout, supporting material, deliberate approximations
and remaster departures. Preserve topology, characteristic turn order, elevation sequence and visual
identity within the pseudo-projection and mechanics. Checkpoints and sprites/music changes may be
independent of Section boundaries. Use schematic route maps rather than require one geographic embedding.
Suzuka's lower crossing is represented as a tunnel with one road surface drawn at a time.

### Series values

Each series course sets its rule values from playtests on the produced course: rank limits, ahead distances,
pace ratios, time margin, grid spacing and entry colors. Add the attract demo once product ARCADE courses exist.

### Time-based authoring

Implement a timeline-based fitting workflow. For the selected vehicle, observations contain interval
start/duration, turn direction, speed ratio to maximum speed, and relaxed/fast/limit headroom.
Hills, environments, sprites and checkpoints use timestamped landmarks.

Use measured vehicle envelopes and explicit authoring defaults, initially:

```text
u(relaxed, fast, limit) = (0.55, 0.75, 0.95)
v = speedRatio*maximumSpeed
R = v²/(u*lateralLimit(v))
arcLength = v*duration
```

Fit a new CourseDocument without requiring a template. Keep fitting and iteration outside compiler/runtime.
Initial pacing goals are ±10% per interval and ±3% overall. Compare continuous reference driving with
observations, revise explicit speed ratio, utilization and interval lengths, and record geometric or
vehicle-infeasible intervals as remaster departures. Footage and vehicle choices remain content inputs.

### Inspection and art

Add a human inspection/adjustment GUI over the file/CLI workflow. It owns selections, panels, view and
transient undo; a 2D plan is an authoring view. Show stale previews and anchor displacement after explicit
geometry changes. Before master-course production, document/compiler versions can advance without
migration readers; replace development inputs with the corresponding version.

Develop production sprites, BG and tunnel artwork. Inspect distant sprites, source-camera/variant
sampling, palettes and braking lamps on real devices. Preserve the authoring goals of dimensioned
markings, boundary treatments and seeded visual variation through the Strip model; ground
appearance and physical bindings stay independent. Saved generated artwork and recipes are inputs,
with descriptive provenance and reproducible builds; an embedded image-generation service is optional.

### Calibration, time margins and forks

If a later course admits both a cycle and branches (for example a pit lane), generalize the
cycle-closure check from walking the single circuit cycle to every directed cycle.

Tune physical parameters, tire sound and driver difficulty, including vehicle-specific tire settings;
reintroduce per-vehicle or per-axle tire parameters only when this tuning needs them. Add asymmetric
(rebound-only) suspension damping only if landings bounce.
Use continuous tool reference runs that complete reproducibly and use different vehicles' capabilities
comparably; review proposed checkpoint margins against the resulting driving experience. FREE PLAY and
TIME TRIAL have no time limit. Reference driving stays outside builds. Review the complete sixteen-competitor
scene with graphics and audio on named devices. Establish device capacity/performance budgets from the whole
application. Measure color-table preblend memory per km on the product courses (ribbon-coast is about 0.8 MiB/km;
a dense 21 km probe used about 121 MiB). If it exceeds the device budget, build preblend levels only
for the route window instead of the whole Section.

Review fork transfer over vehicle, speed, initial-state and material ranges, including three-way
outer-to-outer travel, response time, bike attitude, combined tire demand, yaw/slip, width and median
transitions. Review pre-lock query coverage and parent-specific exit visibility separately from transfer
space. Record margins and remaster departures with the content.

Add surface materials to the one game-wide material catalog as product courses need them (courses reference material IDs; there are no per-course material documents), with physical and sound values tuned on those courses: kerbs (circuits), gravel traps, concrete (streets, run-offs, pits), wet asphalt for rain sections, packed snow, mud and shallow water (off-road), and cobblestones. Kerbs and cobblestones rely on sound for their vibration unless a material roughness is added later.

Section lighting for vehicles: lighting is an attribute of environment intervals, so Sections may switch vehicle
palettes (for example a night section), adding a lighting axis beside color and the brake-lamp animation. Each
lighting is a hand-authored palette per color that recolors the whole image, lit headlamps included; only the brake
lamp keeps its reserved slot, with off and on colors declared per sprite set and lighting. Each vehicle uses the
lighting at its own chainage, and switching is a cut.

### Pending product decisions

- Vehicle sprite resolution: decide the yaw division count (currently 24) and the two-wheeler bank count (currently 5) before producing final vehicle art; the sprite set format already declares both as data.

| Area             | Decision or future capability                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| References       | Exact editions/layout evidence, tolerances and remaster departures                                                                 |
| Series values    | Rank limits, ahead distances, pace ratios, margins, grid spacing and colors per series course (Stage 16 playtests)                 |
| Series content   | SUPER HANG-ON reference layouts; CISCO HEAT course type; COOL RIDERS connections, rivals and traffic; FINAL LAP layout and cars    |
| Series content   | WEC LE MANS 24 layout and field; BIG RUN vehicles and field; RALLY STAGE title and course set                                      |
| Vehicles         | Exact specifications of adopted vehicles (year, market, grade); BROUGHAM TUNED values                                              |
| Circuits         | Series or FREE PLAY placement of the selected circuits below                                                                       |
| Interaction      | Contact response, traffic behavior, movable objects including cones, fixed roadside objects, barriers and track limits (Stage 13)  |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby crossings                                   |
| Camera           | Sprung camera mount or ground-clearance rule (12-10 evaluation)                                                                    |
| Front end        | Attract demo idle time; HUD layout of the vehicle-state elements (12-13)                                                           |
| Art              | Production assets, new physical materials and tunnel/background content                                                            |
| BG transitions   | Consider wipes or dissolves for environment changes; palette fades are not expected                                                |
| Engine sound     | Tried, not adopted: displacement pulse. It did not improve driving sound and added computation (11-7b–11-7k)                       |
| Engine sound     | Tried, not adopted: pipe cross-sections and muffler segments. It did not improve driving sound and added computation (11-7b–11-7k) |
| Engine sound     | Tried, not adopted: packing absorption. It did not improve driving sound and added computation (11-7b–11-7k)                       |
| Engine sound     | Tried, not adopted (not implemented): cycle speed fluctuation, for the same reason as 11-7b–11-7k                                  |

Design traffic and collision/interaction response together. Traffic does not participate in competitive
route locking.

### Selected circuits

These real circuits remain production selections, using their 1989 layout with the identifying notes below.
Series courses are listed in the [product specification](product.md#5-series).

| ID  | Course                                  | Reference / identifying note                |
| --- | --------------------------------------- | ------------------------------------------- |
| C01 | Nürburgring Nordschleife                | Germany, 1989                               |
| C02 | Spa-Francorchamps                       | Belgium, 1989; 1983–93 layout               |
| C03 | Circuit de la Sarthe / Le Mans          | France, 1989; before Mulsanne chicanes      |
| C04 | Autodromo Nazionale Monza               | Italy, 1989 GP road course                  |
| C05 | Silverstone Grand Prix Circuit          | UK, 1989; 1987–90 layout                    |
| C06 | Laguna Seca                             | USA, 1989; 1988–89 layout                   |
| C07 | Mount Panorama / Bathurst               | Australia, 1989                             |
| C08 | Interlagos / Autódromo José Carlos Pace | Brazil, 1989 long layout                    |
| C09 | Monte Carlo / Monaco                    | Monaco, 1989                                |
| C10 | Phillip Island Grand Prix Circuit       | Australia, 1989                             |
| C11 | Mugello Circuit                         | Italy, 1989; 1974–90 family                 |
| C12 | TT Circuit Assen                        | Netherlands, 1989 long GP layout            |
| C13 | Road America                            | USA, 1989                                   |
| C14 | Brands Hatch Grand Prix Circuit         | UK, 1989; 1988–98 family                    |
| C15 | Suzuka Circuit                          | Japan, 1989; figure eight with lower tunnel |
