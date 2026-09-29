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
- TIME ATTACK, traffic, collisions, BGM, wind and sound effects are not implemented; vehicle, sound and difficulty tuning remain open.

Next PR: **11-11 — Sound tables (delete)**.

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage 11 — Audio

Separate the audio scene from the browser and organize sound around replaceable definitions.

- **11-11 — Sound tables (delete):** remove the TypeScript tables `ENGINE_SOUNDS` and `SURFACE_SOUNDS`, the build's
  consistency checks against them, and the `DEFAULT_*` records that duplicate the audio document (gathered in
  `DEFAULT_AUDIO_SETTINGS`).
- **11-12 — DEV sound controls and audio tools (move only):** move DEV sound-control DOM construction out of the
  audio lifecycle; the shell's reusable DOM controls (range control, number stepper and the DEV sound panels) live
  under `src/shell/controls/`; the audio observation factory moves to the audio layer; tools import only
  `src/shell/dom.ts` and `src/shell/controls/` from the shell, and the dependency exception is narrowed to that rule.

## Stage 12 — Product shell

Define input, run state, framebuffer, persistent player settings, data-driven Sessions and product display
independently of DEV.

- **12-1 — Input composition:** `InputManager` owns the arbiters, suspension, lifecycle resets and the final sample;
  the apply method is owner data, not a parsed string; the touch indicator is an observation drawn by the shell.
- **12-2 — Duplicate input APIs (delete):** remove the adapters' own complete samples and resets.
- **12-3 — Run state:** one run-state owner drives the loop, input and audio symmetrically; the displayed input clears
  on suspension.
- **12-4 — View consolidation:** separate small PRs: move the generic Strip slab resolver out of color ground; remove
  `CourseGround` and one-valued `kind` tags; remove environment boundaries and unused fields from terrain lines;
  compute the visible interval and player projection once; time the renderer from its caller; remove the unimplemented
  course-sprite reader branch; move the 45° bank calibration into sprite-set data; remove the unconsumed Route
  `renderHeight.distanceToNextVertex`, the `sStart`/`sEnd`/`segmentIndex` fields of Route `renderHeight.sample()`,
  and `EnvironmentReader.distanceToNextInterval`.
- **12-5 — Shell leftovers (delete):** the numeric selector branch, the thin selector-model layer, the misplaced
  calibration stepper, the unused touch heuristic, the unused `presentation` getter and the second CLASSIC preset
  resolution.
- **12-6 — Framebuffer:** RGB555; one authority for the 320×240 logical frame.
- **12-7 — Player settings:** a persistent settings model, including each vehicle's selected color.
- **12-8 — Session rules:** one settings record, modes as rule data and TIME ATTACK; CUSTOM has no time limit. Model
  rival lifetime (whole race, per stage or until a fork) and fork decider (first arrival or player) as Session rule
  components, with modes as their combinations; Cool Riders has one rival per stage, first-arrival fork choice and an
  all-rival final stage. Rival exit intent and rival strength (`rivalUtilization`) are rule data. The Session assigns
  rival vehicles and colors deterministically, avoiding repeated vehicle/color pairs where possible.
- **12-9 — Start procedure:** remove `updateHeldVehicle`; a held start constrains the body explicitly inside the one
  vehicle update while the powertrain runs; READY has one meaning. Design countdown lamps and rolling starts as Session
  rule components in this PR.
- **12-10 — Cameras:** define camera methods, allowing later changes and mode-specific choices. The camera is rigidly
  fixed to the player in the pseudo projection: constant player depth, pitch following the body, and height solved
  each frame so the player sits at its target row; decide there whether a sprung
  camera mount or a ground-clearance rule is wanted after playability evaluation. The loading window covers every
  camera method. Rename camera yaw mode and current-camera-profile names according to the glossary. Use the camera
  definition's `dCam` for the display-side rearward offset instead of `CURRENT_CAMERA_DISTANCE_METERS`. Define the
  fixed 40 px/m player-depth display scale directly instead of deriving it from `CAR_WIDTH_METERS`.
- **12-11 — Ground sampling:** make a footprint-centred box the default Strip display method (dyadic box in s,
  lateral integration across the pixel), keeping LEVEL-POINT as the cheaper method. Confirm with the RIBBON ROUGH
  evaluation and real-device performance.
- **12-12 — Navigation:** screen transitions within one page; rename the URL mode parameter and course-selection
  names according to the glossary. Pass the manifest-derived course list explicitly instead of the mutable
  `BROWSER_COURSE_MODES`.
- **12-13 — Product HUD:** draw it inside the game frame from race facts, separately from DEV UI and HUD; separate
  product and DEV observations in the render result.
- **12-14 — Language:** make all UI English.

## Stage 13 — Interaction

Give vehicles physical extent and let them meet each other and traffic.

- **13-1 — Vehicle dimensions:** vehicle mechanics documents declare dimensions; derive the course coordinate-domain
  margin from vehicle reach. The 40 px/m display scale stays independent.
- **13-2 — Vehicle contacts:** contact response between competitors; the response model is proposed at the start of
  this stage.
- **13-3 — Traffic:** traffic vehicles and their Session settings. Traffic does not participate in competitive route
  locking.

## Stage 14 — Production pipeline

Build a shared authoring core and tools, with author-confirmed content independent of build-time reference driving.

- **14-1 — Authoring foundation:** core and CLI.
- **14-2 — Workbench:** workbench and sprite module. The sprite module authors multiple named color palettes per image (and hand-authored lighting palettes per color), keeps palette slot 15 reserved for the brake lamp in vehicle images (quantization never assigns artwork to it; lamp pixels can be marked for it), assembles vehicle sprite sets (yaw/bank bindings and the set's brake-lamp colors), and previews every color, lighting and lamp state. Palette adjustment derives a new named palette from an existing one by hue, saturation, lightness and tint changes on selected slots, applied to every image of a set at once in a perceptual color space; the reserved slot is never adjusted, only the resulting explicit palettes are saved, and each can then be edited slot by slot.
- **14-3 — Course editor.**
- **14-4 — Definition modules:** authoring for vehicle mechanics, vehicle appearance and sound documents.
- **14-5 — Time limits and CI:** tool reference driving proposes limits; the author confirms and saves one
  CLASSIC-only set per course. Builds do not run reference driving, so reference workers no longer read the build
  back and the hand-listed model identity disappears. Review the route-count ceiling before branch courses with
  three-way forks. Simplify CI.

## Stage 15 — Produce product courses

Create the selected courses using the Strip schema and file/CLI authoring workflow. Review appearance,
driving experience and time margins on real devices. The following production and authoring goals are
collected from the topic specifications; their order within this stage is not yet scheduled.

### Reference and remaster goals

Provenance lives in authoring project data (observations), not in the runtime course document.

Record exact edition, cabinet/region or circuit layout, supporting material, deliberate approximations
and remaster departures. Preserve topology, characteristic turn order, elevation sequence and visual
identity within the pseudo-projection and mechanics. Checkpoints and sprites/music changes may be
independent of Section boundaries. Use schematic route maps rather than require one geographic embedding.
Suzuka's lower crossing is represented as a tunnel with one road surface drawn at a time.

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
comparably; review proposed checkpoint margins against the resulting driving experience. The author confirms
one CLASSIC time-limit set per course and saves it in the course; CUSTOM has no time limit. Reference driving
stays outside builds. Review the complete sixteen-rival scene with graphics and audio on named devices.
Establish device capacity/performance budgets from the whole application.
Measure color-table preblend memory per km on the product courses (ribbon-coast is about 0.8 MiB/km;
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

- Start procedure: countdown lamps, rolling starts and their Session rules are designed in 12-9.
- Vehicle sprite resolution: decide the yaw division count (currently 24) and the two-wheeler bank count (currently 5) before producing final vehicle art; the sprite set format already declares both as data.

| Area             | Decision or future capability                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| References       | Exact editions/layout evidence, tolerances and remaster departures                                                                 |
| Presets          | CLASSIC vehicles, rosters, checkpoints, laps, margins and traffic settings                                                         |
| CUSTOM           | Exposed rival vehicle/difficulty choices and lap configurations; no time limit                                                     |
| Rival intent     | Deterministic or seeded route preferences                                                                                          |
| Interaction      | Traffic, rival/vehicle response, movable objects including cones, fixed roadside objects, barriers and track limits                |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby crossings                                   |
| Records/results  | Eligibility, ranking/ties, continue, persistence and ghosts                                                                        |
| Art              | Production assets, new physical materials and tunnel/background content                                                            |
| BG transitions   | Consider wipes or dissolves for environment changes; palette fades are not expected                                                |
| Shell            | Front end, product HUD separate from DEV UI/HUD, music, progression, naming/distribution and future input devices                  |
| Engine sound     | Tried, not adopted: displacement pulse. It did not improve driving sound and added computation (11-7b–11-7k)                       |
| Engine sound     | Tried, not adopted: pipe cross-sections and muffler segments. It did not improve driving sound and added computation (11-7b–11-7k) |
| Engine sound     | Tried, not adopted: packing absorption. It did not improve driving sound and added computation (11-7b–11-7k)                       |
| Engine sound     | Tried, not adopted (not implemented): cycle speed fluctuation, for the same reason as 11-7b–11-7k                                  |

Design traffic and collision/interaction response together. Traffic does not participate in competitive
route locking. Product CLASSIC presets include sixteen motorcycle rivals for Super Hang-On and zero
rivals for OutRun; real circuits need authored presets. Rolling starts and additional lamp states remain
future choices.

### Selected course master

These are production selections and reference labels. Exact source evidence is part of content production.
Circuit selections use their 1989 layout with the identifying notes below.

| ID  | Type    | Course                                  | Reference / identifying note                          |
| --- | ------- | --------------------------------------- | ----------------------------------------------------- |
| L01 | LINEAR  | Enduro Racer                            | SEGA, 1986; five stages                               |
| L02 | LINEAR  | Super Hang-On — Africa / Mini Ride-On   | SEGA, 1987; six stages                                |
| L03 | LINEAR  | Super Hang-On — Africa / Sit-Down       | SEGA, 1987; alternate layout                          |
| L04 | LINEAR  | Super Hang-On — Asia                    | SEGA, 1987; ten stages; includes Hang-On motif        |
| L05 | LINEAR  | Super Hang-On — America / Mini Ride-On  | SEGA, 1987; fourteen stages                           |
| L06 | LINEAR  | Super Hang-On — America / Sit-Down      | SEGA, 1987; alternate layout                          |
| L07 | LINEAR  | Super Hang-On — Europe / Mini Ride-On   | SEGA, 1987; eighteen stages                           |
| L08 | LINEAR  | Super Hang-On — Europe / Sit-Down       | SEGA, 1987; alternate layout                          |
| L09 | LINEAR  | Turbo OutRun — New York → Los Angeles   | SEGA, 1989; sixteen-stage crossing                    |
| L10 | LINEAR  | Chase H.Q.                              | Taito, 1988; original five stages                     |
| L11 | LINEAR  | Cisco Heat                              | Jaleco, 1990; San Francisco urban stages              |
| B01 | BRANCH  | OutRun — Original Branch Course         | SEGA, 1986; fifteen nodes, sixteen routes, five goals |
| B02 | BRANCH  | OutRunners — West Course                | SEGA, 1993; San Francisco side                        |
| B03 | BRANCH  | OutRunners — East Course                | SEGA, 1993; Grand Canyon side                         |
| B04 | BRANCH  | Cool Riders — World Course              | SEGA, 1995; left/middle/right, fifty stage positions  |
| C01 | CIRCUIT | Nürburgring Nordschleife                | Germany, 1989                                         |
| C02 | CIRCUIT | Spa-Francorchamps                       | Belgium, 1989; 1983–93 layout                         |
| C03 | CIRCUIT | Circuit de la Sarthe / Le Mans          | France, 1989; before Mulsanne chicanes                |
| C04 | CIRCUIT | Autodromo Nazionale Monza               | Italy, 1989 GP road course                            |
| C05 | CIRCUIT | Silverstone Grand Prix Circuit          | UK, 1989; 1987–90 layout                              |
| C06 | CIRCUIT | Laguna Seca                             | USA, 1989; 1988–89 layout                             |
| C07 | CIRCUIT | Mount Panorama / Bathurst               | Australia, 1989                                       |
| C08 | CIRCUIT | Interlagos / Autódromo José Carlos Pace | Brazil, 1989 long layout                              |
| C09 | CIRCUIT | Monte Carlo / Monaco                    | Monaco, 1989                                          |
| C10 | CIRCUIT | Phillip Island Grand Prix Circuit       | Australia, 1989                                       |
| C11 | CIRCUIT | Mugello Circuit                         | Italy, 1989; 1974–90 family                           |
| C12 | CIRCUIT | TT Circuit Assen                        | Netherlands, 1989 long GP layout                      |
| C13 | CIRCUIT | Road America                            | USA, 1989                                             |
| C14 | CIRCUIT | Brands Hatch Grand Prix Circuit         | UK, 1989; 1988–98 family                              |
| C15 | CIRCUIT | Suzuka Circuit                          | Japan, 1989; figure eight with lower tunnel           |
