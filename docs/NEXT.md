# Next task checkpoint

## Current state

- One compiled graph scene serves RIBBON COAST, RIBBON FORK and RIBBON RING with CLASSIC/CUSTOM Sessions.
- Ground is Band-only, with LEVEL-POINT as the default of three display methods; sprites are indexed.
  BG is one infinite tiled plane with sine mapping.
- Build currently generates vehicle envelopes, reference runs and time budgets. Tire audio uses UNIFIED.
- TIME ATTACK, traffic, BGM, wind and sound effects are not implemented; vehicle, sound and difficulty tuning remain open.

Next PR: **6-2b — Plan authority**.

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Current contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence.

## Stage 6 — Authoritative geometry

Make authored plan and vertical geometry authoritative, with rendering-only approximations and simpler connections.

- **6-2b — Plan authority:** authored straights and circular arcs, arc-length s, rendering-only Raster, asymmetric coordinate domains with J > 0, and engine-constant margins; name Guide/Raster replacements according to the glossary.
- **6-3 — Rendering-space mapping:** derive vehicle and camera positions from (s, l, h), with orientation from physical yaw.
- **6-4 — Coordinate-domain injectivity:** check injectivity at compilation and remove runtime geometry checks.
- **6-5 — Guide remnants:** remove fillet reconstruction, μ, mMin, the `guide` field, envelope, `maxSupportedAbsL`, geometry-window checks and metric; name remaining Guide/Raster replacements according to the glossary.
- **6-6 — Vertical alignment:** PVIs and parabolas, allowing zero curve lengths with endpoint curve lengths set to zero; polyline rendering with separate authoritative and rendering Readers; rename HeightProfile/OpenProfile replacements according to the glossary.
- **6-7 — Band tail cells:** truncate preblend cells at the Section end and separate compilation from sampling while preserving private compiled coefficient storage.
- **6-8 — Cut-line seams:** replace overlaps with cut lines, remove Port, `Section.start` and overlap machinery, rename `Link.source` according to the glossary, and review the straight requirement for parallel fork intervals.
- **6-9 — Views and occurrences:** minimize their procedures and name occurrence-view replacements (`createView`, `CourseGeometryView` and their adapters) according to the glossary.
- **6-10 — Local tolerances:** clarify each tolerance's basis and owning algorithm.

## Stage 7 — Course format v13

Unify authored coordinates, appearance, delivery and progress in the course format.

- **7-1 — Coordinates and variation:** use Anchor and Lateral position types, and knot sequences for variation along s.
- **7-2 — Section layers:** plan / structure / profile / appearance; give Regions material knots and carriagewayId,
  and remove role. Rename VisualProfile replacements according to the glossary.
- **7-3 — Appearance elements:** one list and shared repeat for band / arrow / text / curb / sprite.
  Rename CoursePresentation and associated visual records according to the glossary.
- **7-4 — Course identity:** derive kind from the graph, remove production provenance, and simplify nulls and limits.
- **7-5 — Delivery identity:** one manifest, one version per format and one image path.
- **7-6 — Progress and validation:** unify progress and consolidate validation into one layer.

## Stage 8 — Vehicles and materials

Give vehicles, tires, tuning and materials explicit data definitions, and treat airborne driving as normal state.

- **8-1 — Vehicle data:** saved vehicle definitions and independent tire definitions.
  Rename vehicle/tire/powertrain/actuator Profiles and Arcade prefixes according to the glossary.
- **8-2 — DEV tuning:** replace definitions rather than mutate running settings.
- **8-3 — Materials:** one material-definition table.
- **8-4 — Jumps and recovery:** normal airborne state, revised recovery conditions and suspension limits.

## Stage 9 — Audio

Separate the audio scene from the browser and organize sound around replaceable definitions.

- **9-1 — Audio scene:** move voice allocation and spatialization from the browser layer to the audio layer.
- **9-2 — Sound graph:** generators, voices and buses that can accommodate BGM, environmental audio and effects.
  Rename audio Profiles and audio-presentation replacements according to the glossary.
- **9-3 — Audio tuning:** use definition replacement consistently; rename remaining audio Profiles
  and timing records according to the glossary.

## Stage 10 — Shell

Define persistent player settings, data-driven Sessions and product display independently of DEV.

- **10-1 — Framebuffer:** RGB555.
- **10-2 — Player settings:** a persistent settings model.
- **10-3 — Session rules:** one settings record, modes as rule data and TIME ATTACK; CUSTOM has no time limit.
- **10-4 — Cameras:** define camera methods, allowing later changes and mode-specific choices.
  Rename camera yaw mode and current-camera-profile names according to the glossary.
- **10-5 — Navigation:** screen transitions within one page; rename the URL mode parameter and
  course-selection names according to the glossary.
- **10-6 — Product HUD:** draw it inside the game frame, separately from DEV UI and HUD.
- **10-7 — Language:** make all UI English.

## Stage 11 — Production pipeline

Build a shared authoring core and tools, with author-confirmed content independent of build-time reference driving.

- **11-1 — Authoring foundation:** core and CLI.
- **11-2 — Workbench:** workbench and sprite module.
- **11-3 — Course editor.**
- **11-4 — Definition modules:** vehicles and audio.
- **11-5 — Time limits and CI:** tool reference driving proposes limits; the author confirms and saves one
  CLASSIC-only set per course. Builds do not run reference driving. Simplify CI.

## Stage 12 — Produce product courses

Create the selected courses using the Band schema and file/CLI authoring workflow. Review appearance,
driving experience and time margins on real devices. The following production and authoring goals are
collected from the topic specifications; their order within this stage is not yet scheduled.

### Reference and remaster goals

Record exact edition, cabinet/region or circuit layout, supporting material, deliberate approximations
and remaster departures. Preserve topology, characteristic turn order, elevation sequence and visual
identity within the pseudo-projection and mechanics. Checkpoints and scenery/music changes may be
independent of Section boundaries. Use schematic route maps rather than require one geographic embedding.
Suzuka's lower crossing is represented as a tunnel with one road surface drawn at a time.

### Time-based authoring

Implement a timeline-based fitting workflow. For the selected vehicle, observations contain interval
start/duration, turn direction, speed ratio to maximum speed, and relaxed/fast/limit headroom.
Hills, environments, scenery and checkpoints use timestamped landmarks.

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
vehicle-infeasible intervals as remaster departures. Footage and vehicle-profile choices remain content inputs.

### Inspection and art

Add a human inspection/adjustment GUI over the file/CLI workflow. It owns selections, panels, view and
transient undo; a 2D plan is an authoring view. Show stale previews and anchor displacement after explicit
geometry-recipe changes. Before master-course production, document/compiler versions can advance without
migration readers; replace development inputs with the corresponding version.

Develop production scenery, BG and tunnel artwork. Inspect distant scenery, source-camera/variant
sampling, palettes and braking lamps on real devices. Preserve the authoring goals of dimensioned
markings, boundary treatments and seeded visual variation through the Band model; ground
appearance and physical bindings stay independent. Saved generated artwork and recipes are inputs,
with descriptive provenance and reproducible builds; an embedded image-generation service is optional.

### Calibration, time margins and forks

Tune physical parameters, tire sound and driver difficulty, including vehicle-specific tire settings.
Use continuous tool reference runs that complete reproducibly and use different vehicles' capabilities
comparably; review proposed checkpoint margins against the resulting driving experience. The author confirms
one CLASSIC time-limit set per course and saves it in the course; CUSTOM has no time limit. Reference driving
stays outside builds. Review the complete sixteen-rival scene with graphics and audio on named devices.
Establish device capacity/performance budgets from the whole application.

Review fork transfer over vehicle, speed, initial-state and material ranges, including three-way
outer-to-outer travel, response time, bike attitude, combined tire demand, yaw/slip, width and median
transitions. Review pre-lock query coverage and parent-specific exit visibility separately from transfer
space. Record margins and remaster departures with the content.

### Pending product decisions

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
