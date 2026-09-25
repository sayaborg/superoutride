# Next task checkpoint

## Current state

- One compiled graph scene serves RIBBON COAST, RIBBON FORK and RIBBON RING with CLASSIC/CUSTOM Sessions.
- Course documents use PIs, `at` positions, Lateral values, Strips, Carriageways and gates.
  Circuits are closed cycles of two or more Sections.
- One manifest verifies all delivered content, including vehicle and game-wide driving definitions.
- Surface color and material are authored with Strips, with LEVEL-POINT as the default of three display methods; sprites are indexed.
  BG is one infinite tiled plane with sine mapping.
- Build generates vehicle envelopes, reference runs and time budgets. Tire audio uses UNIFIED.
- TIME ATTACK, traffic, BGM, wind and sound effects are not implemented; vehicle, sound and difficulty tuning remain open.

Next PR: **8-5c — Clutch and engine inertia**.

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence.

## Stage 8 — Vehicles and materials

Give vehicles, driving assists, tires, powertrains and materials explicit definitions, and treat airborne driving as normal state.

- **8-5c — Clutch and engine inertia:** engine inertia derived from displacement by a game-wide rule. The clutch locks when the wheel-derived speed reaches the peak-torque RPM; otherwise engine speed follows one law, (throttle torque − friction − clutch torque) / inertia, capped at the peak-torque RPM by a clutch that transmits the excess and never a negative torque, with idle held by torque rather than a clamp. The DEV HUD shows the clutch as LOCK, SLIP or OPEN. Behavior changes. Audio reads engine speed without its own idle floor.
- **8-5d1 — Time-limit name:** rename the Session `countdown` flag, which means "has a time limit", to a name that says so, before the start procedure arrives. Behavior unchanged.
- **8-5d2 — Provisional start:** a simple held start before GO with the clutch open, so the engine revs freely under the same law. Behavior changes.
- **8-5e — Shift observations:** the powertrain reports each shift (up or down, engine speed before and after) for audio. Behavior unchanged.
- **8-6a — Remove keyboard shortcuts:** remove every DEV keyboard shortcut (course, vehicle, steering and tire tuning, camera yaw, recovery); DEV UI buttons select everything, including a new recovery button. Driving keys stay. Driving behavior unchanged.
- **8-6b — Vehicle state and model:** vehicle state holds only dynamic values; the compiled vehicle, driving settings and form policy form one immutable model passed to each step. The composition shared by browser, race and tools moves from shell to race, and SessionVehicle holds only the vehicle and driving definitions. Report a split plan first if large. Behavior unchanged.
- **8-6c — DEV tuning:** replace the model instead of mutating running settings, and export definitions in their saved formats. Behavior unchanged.
- **8-7 — Materials and airborne state:** material definitions including tire effect kinds, jumps and airborne state, pitch-angle protection, suspension limits and recovery conditions. Split if large. Behavior changes.
- **8-8a — Content admission:** one admission toolkit for every authored format (courses, vehicle and driving definitions, sprite images and sets, tile images, sprite sources), each reporting diagnostics at a document and JSON Pointer; build products keep plain internal checks. Report a split plan first if large. Behavior unchanged.
- **8-8b — Required course rules:** course rules are mandatory, and race code receives them without non-null assertions. Behavior unchanged.
- **8-8c — Remove unused code:** unused exports such as the `core/validation.ts` helpers, `headingFromDelta`, `createPlanarCoordinateSample` and `planSegmentBounds`. Behavior unchanged.
- **8-8d — Content build:** stage the vehicle sprite library in the content build instead of the browser-tool preview build. Behavior unchanged.

## Stage 9 — Audio

Separate the audio scene from the browser and organize sound around replaceable definitions.

- **9-1 — Audio scene:** move voice allocation and spatialization from the browser layer to the audio layer.
- **9-2 — Sound graph:** generators, voices and buses that can accommodate BGM, environmental audio and effects.
  Rename audio Profiles and audio-presentation replacements according to the glossary.
- **9-3 — Audio tuning:** use definition replacement consistently; rename remaining audio Profiles
  and timing records according to the glossary.
  Rename the tire-sound DEV controls (`tire-tuning-controls.ts`) so they are not mistaken for tire physics tuning.

## Stage 10 — Shell

Define persistent player settings, data-driven Sessions and product display independently of DEV.

- **10-1 — Framebuffer:** RGB555.
- **10-2 — Player settings:** a persistent settings model.
- **10-3 — Session rules:** one settings record, modes as rule data and TIME ATTACK; CUSTOM has no time limit. Model rival lifetime (whole race, per stage or until a fork) and fork decider (first arrival or player) as Session rule components, with modes as their combinations; Cool Riders has one rival per stage, first-arrival fork choice and an all-rival final stage. Move rival strength (`rivalUtilization`) into Session rule data.
- **10-4 — Cameras:** define camera methods, allowing later changes and mode-specific choices.
  Rename camera yaw mode and current-camera-profile names according to the glossary.
  Use the camera definition's `dCam` for the display-side rearward offset instead of `CURRENT_CAMERA_DISTANCE_METERS` from `display-scale.ts`.
  Define the fixed 40 px/m player-depth display scale directly instead of deriving it from `CAR_WIDTH_METERS`; vehicle dimensions arrive with collisions.
- **10-5 — Navigation:** screen transitions within one page; rename the URL mode parameter and
  course-selection names according to the glossary.
  Pass the manifest-derived course list explicitly instead of the mutable `BROWSER_COURSE_MODES`.
- **10-6 — Product HUD:** draw it inside the game frame, separately from DEV UI and HUD.
- **10-7 — Language:** make all UI English.

## Stage 11 — Production pipeline

Build a shared authoring core and tools, with author-confirmed content independent of build-time reference driving.

- **11-1 — Authoring foundation:** core and CLI.
- **11-2 — Workbench:** workbench and sprite module. The sprite module authors multiple named color palettes per image (and hand-authored lighting palettes per color), keeps palette slot 15 reserved for the brake lamp in vehicle images (quantization never assigns artwork to it; lamp pixels can be marked for it), assembles vehicle sprite sets (yaw/bank bindings and the set's brake-lamp colors), and previews every color, lighting and lamp state. Palette adjustment derives a new named palette from an existing one by hue, saturation, lightness and tint changes on selected slots, applied to every image of a set at once in a perceptual color space; the reserved slot is never adjusted, only the resulting explicit palettes are saved, and each can then be edited slot by slot.
- **11-3 — Course editor.**
- **11-4 — Definition modules:** vehicles and audio.
- **11-5 — Time limits and CI:** tool reference driving proposes limits; the author confirms and saves one
  CLASSIC-only set per course. Builds do not run reference driving. Simplify CI.
  Derive vehicle identity from delivered content SHA-256 values instead of hashing runtime objects; the hand-listed model identity disappears with build-time reference driving.

## Stage 12 — Produce product courses

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

Tune physical parameters, tire sound and driver difficulty, including vehicle-specific tire settings.
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

### Pending product decisions

- Start procedure: 8-5d2's held start is provisional; decide countdown lamps, rolling starts and their Session rules.

- Vehicle color choice: every vehicle sprite set carries at least two named color palettes; decide how the player selects a color and how rivals are assigned colors (and vehicles).
- Section lighting for vehicles: Sections may switch vehicle palettes (for example a night section), adding a lighting axis beside color and the brake-lamp animation. Each lighting is a hand-authored palette per color that recolors the whole image, lit headlamps included; only the brake lamp keeps its reserved slot, with off and on colors declared per sprite set and lighting. Decide whether switching follows each vehicle's Section or the camera's, and whether it cuts or fades.
- Vehicle sprite resolution: decide the yaw division count (currently 24) and the two-wheeler bank count (currently 5) before producing final vehicle art; the sprite set format already declares both as data.

| Area             | Decision or future capability                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| References       | Exact editions/layout evidence, tolerances and remaster departures                                                  |
| Presets          | CLASSIC vehicles, rosters, checkpoints, laps, margins and traffic settings                                          |
| CUSTOM           | Exposed rival vehicle/difficulty choices and lap configurations; no time limit                                      |
| Rival intent     | Deterministic or seeded route preferences                                                                           |
| Interaction      | Traffic, rival/vehicle response, movable objects including cones, fixed roadside objects, barriers and track limits |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby crossings                    |
| Records/results  | Eligibility, ranking/ties, continue, persistence and ghosts                                                         |
| Art              | Production assets, new physical materials and tunnel/background content                                             |
| BG transitions   | Consider wipes or dissolves for environment changes; palette fades are not expected                                 |
| Shell            | Front end, product HUD separate from DEV UI/HUD, music, progression, naming/distribution and future input devices   |

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
