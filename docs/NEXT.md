# Next task checkpoint

## Current state

- The game uses one compiled graph scene, indexed sprites and CLASSIC/CUSTOM Session flow.
- Ground is Band-only. The product display setting has three modes, with LEVEL-POINT as the default;
  [Architecture](architecture.md#band-rendering) owns their definitions and shared image level selection.
- RIBBON COAST, RIBBON FORK and RIBBON RING are the only provisional playable courses. FORK transfers
  from its shortened parent chart to separate route Sections after a short divergence.
- BG is one infinite tiled plane with sine mapping. Build generates vehicle envelopes and game time budgets.
- Tire audio uses UNIFIED with R/Q output controls. Authoring tools and both browser auditions are available.
- Standing checks cover strict TypeScript, lint, formatting, build, saved-course startup and acyclic layers.
  Pages uses a commit-versioned build with public-version and browser-startup verification.
- Stages 1–4 are complete. Vehicle settings carry `DEV_UNCALIBRATED`; physics, tire sound and difficulty
  tuning remain open. TIME ATTACK, traffic, BGM, wind and sound effects remain future work.

Implement the numbered stages in order. Current contracts belong to the topic specifications;
development and release procedure belongs to AGENTS. PRs hold rationale and verification evidence.

## Stage 4 — Replace ground with Bands — complete

Ordered color Bands and independent physical Regions are the sole ground representation.
The product setting, DEV adapter, sampling-time/active-count HUD and provisional courses are in place.
Ground definitions belong to Product, Architecture, Image assets and Content; operation belongs to Browser.
The current active limit is 64. Whole-application capacity and motion quality still need named-device
assessment in Stage 7; local tests do not establish a device budget. Continue with Stage 5, not new
sampling candidates or ground payload formats.

## Stage 5 — Simplify structure

- Replace the three forms of `GuideCoordinateSource` with one reader.
- Unify circuit and ordered progress engines; remove synthetic `':EXIT'` gates.
- Move running geometry checks (`course-driving-view` calls to `compileCourseGeometryWindow`) to compilation.
- Consolidate validation into one layer and minimize version/hash management.
- Clarify physics responsibilities and names (`arcade-vehicle-physics` / `vehicle-dynamics`), and remove physics
  dependencies on course and input.
- Give surface properties one representation: remove `SurfaceMap`, assign material definitions one owner,
  and distinguish the `SHOULDER` role from material names.
- Give tuning values one authority, including running setters and the `DEV_UNCALIBRATED` label.
- Retain body-fixed yaw and movement-direction yaw cameras; clarify their roles and names. A product selector may follow.
- Give rendering concepts one owner and one name: resolve presentation, BG splitting and the runtime/authoring boundary.
  Unify the two course-sprite paths.
- Remove unnecessary indirection in `boot.ts` and define the product/DEV UI boundary.

## Stage 6 — Close specification gaps

- Implement TIME ATTACK with zero rivals, traffic off, elapsed-time recording and player vehicle choice.
  Define record eligibility from the complete resolved configuration, including differences from CUSTOM.
- Make course selection data-driven and clarify the `mode` parameter name.
- Define audio buses for BGM, environmental/wind audio and sound effects.
- Make all UI English, including DEV panels and tools.

## Stage 7 — Produce product courses

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
markings, boundary treatments and seeded visual variation through the Stage 4 Band model; ground
appearance and physical bindings stay independent. Saved generated artwork and recipes are inputs,
with descriptive provenance and reproducible builds; an embedded image-generation service is optional.

### Calibration, time margins and forks

Tune physical parameters, tire sound and driver difficulty, including vehicle-specific tire settings.
Use continuous reference runs that complete reproducibly and use different vehicles' capabilities
comparably; tune checkpoint margins from the resulting driving experience. Review the complete
sixteen-rival scene with graphics and audio on named devices. Establish device capacity/performance
budgets from the whole application.

Review fork transfer over vehicle, speed, initial-state and material ranges, including three-way
outer-to-outer travel, response time, bike attitude, combined tire demand, yaw/slip, width and median
transitions. Review pre-lock query coverage and parent-specific exit visibility separately from transfer
space. Record margins and remaster departures with the content.

### Pending product decisions

| Area             | Decision or future capability                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| References       | Exact editions/layout evidence, tolerances and remaster departures                                                  |
| Presets          | CLASSIC vehicles, rosters, checkpoints, laps, margins and traffic settings                                          |
| CUSTOM           | Exposed rival vehicle/difficulty choices and lap configurations                                                     |
| Rival intent     | Deterministic or seeded route preferences                                                                           |
| Interaction      | Traffic, rival/vehicle response, movable objects including cones, fixed roadside objects, barriers and track limits |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby crossings                    |
| Records/results  | Eligibility, ranking/ties, continue, persistence and ghosts                                                         |
| Art              | Production assets, new physical materials and tunnel/background content                                             |
| Shell            | Front end, HUD, music, progression, naming/distribution and future input devices                                    |

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
