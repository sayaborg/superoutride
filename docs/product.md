# Product specification

This is the adopted product target for Course Editor development, not a statement of deployed behaviour.
It defines the game, its content and authoring capabilities. The [index](README.md) assigns technical
contracts, validation and work order to their respective owners. Explicit candidates and open decisions
remain unresolved until their stated gates are met. Implementation and acceptance require separate evidence.

Architectural elegance, simplicity and consistency take priority over convenience and hardware imitation.

## 1. Course master

Thirty master courses: remasters of the selected game courses, and real circuits using their 1989
layout unless noted. The following identities and reference notes are production selections,
not newly verified historical claims.

| ID  | Type    | Course                                  | Source / reference year      | Notes                                      |
| --- | ------- | --------------------------------------- | ---------------------------- | ------------------------------------------ |
| L01 | LINEAR  | Enduro Racer                            | _Enduro Racer_ (1986, SEGA)  | 5 consecutive stages                       |
| L02 | LINEAR  | Super Hang-On — Africa / Mini Ride-On   | _Super Hang-On_ (1987, SEGA) | 6 stages                                   |
| L03 | LINEAR  | Super Hang-On — Africa / Sit-Down       | _Super Hang-On_ (1987, SEGA) | Alternate layout                           |
| L04 | LINEAR  | Super Hang-On — Asia                    | _Super Hang-On_ (1987, SEGA) | 10 stages; subsumes _Hang-On_ (1985)       |
| L05 | LINEAR  | Super Hang-On — America / Mini Ride-On  | _Super Hang-On_ (1987, SEGA) | 14 stages                                  |
| L06 | LINEAR  | Super Hang-On — America / Sit-Down      | _Super Hang-On_ (1987, SEGA) | Alternate layout                           |
| L07 | LINEAR  | Super Hang-On — Europe / Mini Ride-On   | _Super Hang-On_ (1987, SEGA) | 18 stages                                  |
| L08 | LINEAR  | Super Hang-On — Europe / Sit-Down       | _Super Hang-On_ (1987, SEGA) | Alternate layout                           |
| L09 | LINEAR  | Turbo OutRun — New York → Los Angeles   | _Turbo OutRun_ (1989, SEGA)  | 16-stage crossing of the USA               |
| L10 | LINEAR  | Chase H.Q.                              | _Chase H.Q._ (1988, Taito)   | Original 5 stages                          |
| L11 | LINEAR  | Cisco Heat                              | _Cisco Heat_ (1990, Jaleco)  | San Francisco, 5 urban stages              |
| B01 | BRANCH  | OutRun — Original Branch Course         | _OutRun_ (1986, SEGA)        | 15 stage nodes / 16 routes / 5 goals       |
| B02 | BRANCH  | OutRunners — West Course                | _OutRunners_ (1993, SEGA)    | San Francisco side                         |
| B03 | BRANCH  | OutRunners — East Course                | _OutRunners_ (1993, SEGA)    | Grand Canyon side                          |
| B04 | BRANCH  | Cool Riders — World Course              | _Cool Riders_ (1995, SEGA)   | Left / Middle / Right, 50 stage positions  |
| C01 | CIRCUIT | Nürburgring Nordschleife                | Germany / 1989               | About 20.8 km                              |
| C02 | CIRCUIT | Spa-Francorchamps                       | Belgium / 1989               | 1983–93 layout                             |
| C03 | CIRCUIT | Circuit de la Sarthe / Le Mans          | France / 1989                | Before the Mulsanne chicanes               |
| C04 | CIRCUIT | Autodromo Nazionale Monza               | Italy / 1989                 | Contemporary GP road course                |
| C05 | CIRCUIT | Silverstone Grand Prix Circuit          | UK / 1989                    | 1987–90 layout                             |
| C06 | CIRCUIT | Laguna Seca                             | USA / 1989                   | 1988–89 layout                             |
| C07 | CIRCUIT | Mount Panorama / Bathurst               | Australia / 1989             | Mountain / public-road character           |
| C08 | CIRCUIT | Interlagos / Autódromo José Carlos Pace | Brazil / 1989                | Former 7.874 km long course                |
| C09 | CIRCUIT | Monte Carlo / Monaco                    | Monaco / 1989                | Street circuit                             |
| C10 | CIRCUIT | Phillip Island Grand Prix Circuit       | Australia / 1989             | 1989 layout                                |
| C11 | CIRCUIT | Mugello Circuit                         | Italy / 1989                 | 1974–90 family                             |
| C12 | CIRCUIT | TT Circuit Assen                        | Netherlands / 1989           | Contemporary long GP layout                |
| C13 | CIRCUIT | Road America                            | USA / 1989                   | About 6.5 km                               |
| C14 | CIRCUIT | Brands Hatch Grand Prix Circuit         | UK / 1989                    | 1988–98 family                             |
| C15 | CIRCUIT | Suzuka Circuit                          | Japan / 1989                 | Figure eight; lower road drawn as a tunnel |

Totals: LINEAR 11, BRANCH 4, CIRCUIT 15.

Excluded: _Hang-On_ (1985) as a separate entry, Rad Mobile, Racing Hero, OutRun 2,
OutRun 2 SP, Power Drift, Virtua Racing, Daytona USA, Sega Rally, Manx TT and Scud Race.

Provisional CourseDocuments exercise product features without attempting to reproduce a master
course.

### Reference and remaster scope

Each course records its exact edition, region/cabinet or circuit layout, supporting material,
known dimensions and deliberate approximations. Preserve topology, characteristic turns, elevation
sequence and visual identity within the existing pseudo-projection and vehicle-mechanics contracts.
Record departures needed for valid geometry or playable forks. The reference's stage boundaries
may change scenery or music without creating a Section boundary.

## 2. Sessions and play

### Primary settings and modes

The four primary settings are rivals (0–16, excluding the player), traffic on/off, checkpoint
countdown on/off, and player vehicle. A resolved Session also contains the complete course,
roster, start/finish, lap, timing, seed and record policies needed to run the game.

| Mode, provisional name | Rivals        | Traffic       | Time rule                 | Player vehicle       |
| ---------------------- | ------------- | ------------- | ------------------------- | -------------------- |
| CLASSIC                | Course preset | Course preset | Checkpoint countdown      | Course preset, fixed |
| CUSTOM                 | Player, 0–16  | Player        | Player: countdown or none | Player choice        |
| TIME ATTACK            | 0             | Off           | Elapsed-time recording    | Player choice        |

CLASSIC values belong to each course: the Super Hang-On preset has 16 motorcycle rivals; the OutRun
preset has none. CUSTOM provides vehicle freedom, including driving against the checkpoint clock.
Real circuits receive product-authored presets. Record eligibility depends on the complete resolved
configuration; identical visible settings alone do not equate a CUSTOM run with TIME ATTACK.

### Starts, goals and timing

Sessions use standing starts. Timing begins at the start signal. LINEAR and BRANCH
finish at an accepted terminal goal; CIRCUIT finishes after the configured finite number of valid laps.
The grid-release crossing is not a completed lap. Recovery and reverse travel preserve earned progress.

Checkpoint budgets come from continuous, offline reference-AI runs in the product physics. The runs
use no traffic or rivals; the explicit course margin accounts for difficulty and disturbances. CLASSIC
uses its fixed vehicle and timed CUSTOM uses the selected vehicle. Original-game time tables are not reused.

The [timing contract](content-and-gameplay.md#reference-times-and-clock) defines initial time, carry-over,
conservative reference aggregation and exact-event priority for every timed session.

### Rivals and traffic

Rivals use the same vehicle mechanics as the player and differ through driving policy. Reference-AI
qualification requires reproducible completion, comparable use of different vehicles' capabilities,
and acceptable checkpoint difficulty. Existing DEV AI is not presumed qualified.

Collision and interaction design is deferred as one milestone covering traffic vehicles, rivals,
movable road objects (including physically displaced cones) and fixed off-road objects. Traffic itself
will be designed in that milestone. Current vehicles and roadside objects remain pass-through; no
provisional contact response or contact-dependent structure is introduced. Traffic never votes on
competitive route decisions. The 16-rival configuration requires full-scene device acceptance with
graphics and audio.

## 3. Course structure and route choice

### Elements

| Element             | Product meaning                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Section             | A continuous road/content chart; its terminal fork can contain multiple carriageways.      |
| Link                | A connection between Section ports, including continuations, forks, merges and a lap loop. |
| Checkpoint          | A rule landmark independent of Section boundaries.                                         |
| Start / Goal        | The start grid and the session's physical completion landmarks.                            |
| Environment profile | Scenery, ground-fill, background or music changes within a Section.                        |

| Course type | Topology                                                               |
| ----------- | ---------------------------------------------------------------------- |
| LINEAR      | Finite chain, commonly one Section.                                    |
| BRANCH      | Finite directed acyclic graph with two- or three-way forks and merges. |
| CIRCUIT     | One closed-lap Section with an explicit loop Link.                     |

An original game's stage is a checkpoint interval, not necessarily a Section. A selected 18-stage
course can have one Section, 17 interior checkpoints and independent environment changes.

Courses need not form one globally consistent geographical map. Route maps are schematic. Connections,
merges and lap boundaries must preserve continuous driving and presentation. Course data is reused at
merges and across laps; traversal history remains distinct from source identity.

### Forks and route lock

A fork contains a split, a parallel zone with a drivable median, warning/closure locations and exit
seams. The parent contains the fork's static road geometry and scenery. The first eligible racing
vehicle to cross the lock line selects the branch for the field. Eligible vehicles are the player
and rivals; with zero rivals, the player is the entire field. This rule applies to every mode.

Choice is free before the lock line and fixed after it. Unselected roads warn immediately and close
later, allowing vehicles to cross the median. Rival intent retargets the selected road. At closure, a vehicle still on an unselected road uses legal-route
recovery to the selected road; it grants no progress. V1 has no wall collision physics. Warning and
closure visuals are ordinary state-selected presentation.

The lock line is at the start of the parallel zone; closure precedes every exit seam. Unselected roads
peel away through authored, static geometry, and parent-specific roads/scenery leave view before the
seam under the [exit-presentation contract](content-and-gameplay.md#exit-presentation-and-lateral-transfer).
Branch choice, each actor's seam crossing and earned checkpoint progress are distinct events.

The [fork contract](content-and-gameplay.md#fork-lock-and-handoff) separately qualifies lateral
transfer, pre-lock lookahead coverage and exit continuity. A calculated lane-change distance is not
also a universal visibility guarantee.

### Grade separation

Suzuka retains its figure eight. The lower passage is shown as a tunnel; the crossing road is not
simultaneously drawn as another road surface. Authored topology and height distinguish nearby roads,
physical gates and vehicles at the crossing.

## 4. Visual content and ground

### Common image convention

Sprite masters, ground swatches and stamps use the same source convention: RGB555, at most 15 opaque
colours plus transparent index 0, and 40 source texels per metre in both axes. This limit applies to
each sprite level and each BG tile, not the completed course. Coarse sprite palettes may contain
filtered mixtures while retaining the per-level 15-opaque-color limit. Existing screen and player-scale contracts remain.

Completed ground uses the static colour representation defined by the
[image contract](image-assets.md#source-and-completed-images).

### Ground residency and variation

Ground uses a deduplicated tile dictionary and is completely loaded before driving, including every
branch and the single source lap. During a run, ground is sampled from completed resident data.
Course selection/loading remains an explicit, failure-safe transaction. Content must fit a measured
whole-course budget; there is no hidden switch to streaming or lower-quality runtime art.

Static A/B variation follows the single [saved-recipe workflow](image-assets.md#static-ab-recipe).
Ground palette animation, cycling and driving-time theme recolouring are outside this revision.
Testarossa brake lamps select immutable instance palettes under the adopted image contract; general palette animation remains outside scope.

### Materials, asphalt and scenery

AI image generation supplies material swatches and stamps. Approved image bytes and recipes are
stored inputs; generation provenance is descriptive. Builds reproduce products from saved inputs,
not by calling a generator again. External generation is sufficient; an embedded AI service is optional.

| Visual source | Intended appearance                            | Physical binding, authored separately         |
| ------------- | ---------------------------------------------- | --------------------------------------------- |
| Asphalt       | Seamless base, static A/B, patches and repairs | Usually ASPHALT                               |
| Grass         | Seamless base, static A/B and shape variants   | Usually GRASS                                 |
| Soil          | Repeating soil, optional static variation      | DIRT                                          |
| Sand          | Repeating sand                                 | SAND                                          |
| Gravel        | Repeating gravel                               | New GRAVEL definition requires review         |
| Sea water     | Static water                                   | Usually unsupported                           |
| Shoreline     | Repeating boundary treatment                   | Independently specified sand/support boundary |
| White line    | Paint texture clipped by dimensioned geometry  | Underlying physical surface retained          |

Asphalt has visible repairs rather than a uniform noise appearance. Use seeded seamless variants,
larger dimensioned repairs and individual stamps. The visual `repairDensity` setting changes appearance,
not grip or sound. Line widths, dash lengths, kerbs and text dimensions come from authored geometry
or metric assets rather than inferred dimensions in generated images.

Roadside scenery supports pattern rows and individual placements. Environment changes remain Section
profiles. Appearance and physical bindings may reference the same authored boundary while retaining
separate meanings and compiled outputs. Ground colour never determines grip or support.

## 5. Course Editor scope

Courses are saved data documents compiled through one public entry composed of small domain compilers.
The first authoring interface is files, a small CLI, structured diagnostics and product-renderer previews.
AI agents create courses; GUI later supports human inspection and small adjustments. The format covers
geometry, height, cross-sections, boundaries, ground layers, placements, environments,
Links, checkpoints, starts, goals and presets. It displays actionable diagnostics and actual capacity.

Saved projects reproduce their inputs and compiled outputs, keep source and generated products distinct,
and expose stale previews after an edit. Failed operations preserve prior source. Driving preview uses
the product compiler, readers, camera, renderer and mechanics. A 2D editing plan is a separate authoring
view, not a second driving engine. Reference-time runs are build-generated offline products.

The [authoring contract](content-and-gameplay.md#authoring-documents-and-assets) owns formats and saved
semantics; [validation](development.md) owns evidence. Work order belongs only to [NEXT](NEXT.md).

## 6. Remaining product decisions

| Area              | Unresolved content or product choice                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Course references | Exact editions/layout evidence, tolerances and documented remaster departures.                |
| Presets           | CLASSIC vehicle additions/mappings, rosters, checkpoints, laps, margins and traffic settings. |
| CUSTOM            | Exposed rival vehicle/difficulty choices and admitted lap configurations.                     |
| Rival intent      | Deterministic or seeded route preferences; lock authority is already specified above.         |
| Interaction       | Vehicle/traffic/barrier response, track limits, corner cutting and traffic behaviour.         |
| Records/results   | Eligibility categories, ranking/tie display, continue, persistence and ghosts.                |
| Art               | Production artwork, new physical materials, background and tunnel content.                    |
| Shell             | Front end, HUD, music, progression, naming/distribution and future input devices.             |

Technical candidates and their evidence gates are listed by their owners, not repeated here.
Rolling starts, additional lamp states, ghosts and new input devices remain outside the initial editor slice.
Physics and tire-audio tuning are open work in [NEXT](NEXT.md#current-state).
