# Next task checkpoint

## Current state

- One compiled graph scene serves RIBBON COAST, RIBBON FORK, RIBBON RING and RIBBON ROUGH with ARCADE/FREE PLAY Sessions;
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
- The [product specification](product.md) is the target for Stages 12–16. Series documents own ARCADE settings and
  fields; FREE PLAY rivals are drawn from vehicle pools; TIME TRIAL runs alone; music and sound effects are not
  implemented; SELECT MUSIC and the attract demo wait for their stages.
- Stage 12 is complete: the front end runs inside the frame from TITLE through RESULT, with SETTINGS and `dev=1`; the
  product HUD is drawn with the text layer from race facts and the player's observation, and DEV measurements stay with
  `dev=1`; the player record keeps settings and the TIME TRIAL and ARCADE records shown at READY, at TIME TRIAL
  crossings and on RESULT; all UI is English.
- Engine sound can lag on some devices and stay late. With `dev=1` the audio timing line measures the AudioContext's
  latency, clock and worklet overruns; headless Chromium did not reproduce the lag, so its fix waits on a reading
  from an affected device ([Browser](browser.md#performance-hud)).
- Stage 13 is complete: vehicles have overall dimensions and road-aligned footprints that contact vehicles, walls,
  course limits and roadside objects through one external force on the ordinary mechanics; Carriageways have lanes,
  drivers follow lane centres, change lanes past slower vehicles or follow them and merge where their lane ends; traffic
  appears at seeded Route positions from the series or FREE PLAY's TRAFFIC option; RIBBON COAST is the verification
  course of all of it.

Next PR: **AU3-30** — the third design audit's fixes, in the order of its instructions.

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Audit 2 leftovers

Findings of the second design audit not yet addressed, by when they are taken up:

- **Stage 14 or 15, when nearby code changes:** D8e-03, P7b-02, P7f-08, A6d3-02.
- **Stage 15:** P7a-01, P7a-02, A6g-07, H15-02, H14-02, H18-01, D3-06.
- **Not addressed, with reasons:** D8c-03 (it concerns the DEV HUD only); D8e-05 (a documentation contract, already
  stated); S12-02 (the scope of the guarantee is documented).

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

- Series images and attract demo: each series has one 320×240 image (20×15 tiles of 16×16 px), and
  SELECT SERIES switches between them; the attract demo replaces the text title.

### Rival racing line

Rivals follow lane centres and change lanes past slower vehicles. A racing line within the road width (the
minimum-curvature line, compiled with the course), whether reference runs drive it, and passing off that line are
designed once product courses exist to evaluate it on.

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

### Series production starting points

Candidates and reference observations gathered while specifying the product. They are starting points for
production, not decisions: the [product specification](product.md#5-series) owns what is decided, and
series documents and authoring project data replace these rows as each series is produced. Exact vehicle
specifications follow [Era](product.md#era): one consistent model year, market and grade per vehicle.

| Series         | Starting points                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SUPER HANG-ON  | The reference courses have 6, 10, 14 and 18 stages (AFRICA, ASIA, AMERICA, EUROPE); which cabinet's roads to use is open. VFR750R keeps the existing 1988 full-power definition; GSX-R750 is the 1988 standard export model, not the 1989 GSX-R750R; 851 is a 1988 road model.                                                                                                       |
| OUTRUN         | COUNTACH candidate: 25th Anniversary, 1988–1989. TESTAROSSA keeps the existing 1989 definition.                                                                                                                                                                                                                                                                                      |
| TURBO OUTRUN   | Stage order: New York, Washington D.C., Pittsburgh, Indianapolis, Chicago, St. Louis, Memphis, Atlanta, Miami, New Orleans, San Antonio, Dallas, Oklahoma City, Denver, Grand Canyon, Los Angeles. F40 and 959 are period road specifications.                                                                                                                                       |
| CHASE H.Q.     | 928 candidate: S4. ESPRIT TURBO generation is open. 911 TURBO (930) relates to the existing 3.3 L definition.                                                                                                                                                                                                                                                                        |
| CISCO HEAT     | Reference stages: Golden Gate Bridge → Fisherman's Wharf, Fisherman's Wharf → Union Square, Union Square → Moscone Center, Moscone Center → Twin Peaks, Twin Peaks → Treasure Island; internal forks are unverified. BROUGHAM TUNED starts from the 1989 Brougham. 300ZX candidate: 1989–early 1990 Z32 Twin Turbo, without mixing US and Japanese outputs or two-seat and 2+2 data. |
| OUTRUNNERS     | The reference has 30 stages and 10 goals over both courses; connections are to be confirmed. Candidates: 911 SPEEDSTER 1989, RX-7 (FC3S) 1989, COBRA 427 (year open), ELDORADO (Biarritz; generation open), MINI (1967 Cooper S 1275), QUATTRO (1989 20V).                                                                                                                           |
| COOL RIDERS    | Stage nodes: prestage 1, stages 1–4 with 3, 9, 15 and 21, final NEW YORK 1 (fifty); each of three main routes runs 1, 3, 5, 7 with shared and merging nodes. The full exit table is open. VMAX 1200: 1989 export; RG500 Γ: 1985 road model; GL1500: 1988–1989; SUPER CUB 90: a late-1980s model.                                                                                     |
| FINAL LAP      | 1987 car candidates: Williams-Honda FW11B, Lotus-Honda 99T, McLaren-TAG Porsche MP4/3, March-Cosworth 871. Whether SUZUKA follows the reference game's layout or the real 1987 or 1989 circuit is open.                                                                                                                                                                              |
| WEC LE MANS 24 | 962C and C9 in their 1989 Le Mans specifications; reference cars Joest #9 and #63 are candidates. Qualifying and race outputs are not mixed.                                                                                                                                                                                                                                         |
| BIG RUN        | Reference route toward Dakar: Tunis, Tozeur, Tumu, Agadez, Bamako, Saint-Louis; the mapping to stages is unverified. A rally-raid 959 is a different vehicle from the road 959; 205 T16 is not the 205 GTI; PAJERO generation is open.                                                                                                                                               |
| RALLY STAGE    | Provisional courses: FOREST (tarmac, gravel, tarmac, gravel), MOUNTAIN (narrow tarmac, gravel climb, mountain tarmac), COAST (fast tarmac, dirt, wet tarmac), WINTER (tarmac, snow, packed snow, tarmac). Vehicle years, valve variants and Group A references are open.                                                                                                             |

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
(rebound-only) suspension damping only if landings bounce. Size terminal runouts for paced rivals at the minimum pace
utilization; runout admission still checks the fixed 0.75.
Use continuous tool reference runs that complete reproducibly and use different vehicles' capabilities
comparably; review proposed checkpoint margins against the resulting driving experience. FREE PLAY and
TIME TRIAL have no time limit. Reference driving stays outside builds. Review the complete 32-vehicle
scene (sixteen competitors and sixteen traffic vehicles) with graphics and audio on named devices. Establish device capacity/performance budgets from the whole
application. Measure color-table preblend memory per km on the product courses (ribbon-coast's road is about 0.3 MB per km;
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

| Area             | Decision or future capability                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| References       | Exact editions/layout evidence, tolerances and remaster departures                                                                             |
| Series values    | Rank limits, ahead distances, pace ratios, margins, grid spacing and colors per series course (Stage 16 playtests)                             |
| Series content   | SUPER HANG-ON reference layouts; CISCO HEAT course type; COOL RIDERS connections, rivals and traffic; FINAL LAP layout and cars                |
| Series content   | WEC LE MANS 24 layout and field; BIG RUN vehicles and field; RALLY STAGE title and course set                                                  |
| Vehicles         | Exact specifications of adopted vehicles (year, market, grade); BROUGHAM TUNED values                                                          |
| Circuits         | Series or FREE PLAY placement of the selected circuits below                                                                                   |
| Interaction      | Oncoming traffic (Stage 16)                                                                                                                    |
| Tunnels          | Whether tunnel sides and ceilings are drawn by the renderer like walls (a ceiling is a second surface above the road), replacing sprite frames |
| Walls            | Whether walls take the ground's arrow, text and curb constructs as well as strip and repeat (when a product course needs them)                 |
| Walls            | Whether wall friction varies by wall rather than being one game-wide `barrierFriction`                                                         |
| Walls            | Whether walls' preblend memory (about 1.3–2.5 MB per km of cliff on RIBBON COAST, about 0.3 MB per km of road) fits the device budget          |
| Rivals           | Whether rivals follow closer than traffic (in dense traffic they keep the 1.5 s following time and queue)                                      |
| Rivals           | Whether an ahead entry's lane is checked where it appears rather than against the course's fewest lanes (Stage 16)                             |
| Drivers          | Whether steering lookahead and response change: a lane change at about 47 m/s overshoots by about 1.7 m (with the rival racing line)           |
| Traffic          | Whether traffic speeds vary or density changes: one speed lets it fill both lanes of a two-lane road; lane drivers never pass                  |
| Courses          | Whether RIBBON ROUGH stays an evaluation course or changes shape: drivers leave it at a kinked crest and on short narrow waves                 |
| Interaction      | Whether a slight front-face overlap with a solid object deflects the vehicle instead of stopping it (real devices)                             |
| Interaction      | How far a vehicle rebounds from a solid object (about 7 m/s back from 40 m/s today; real devices)                                              |
| Records          | Whether traffic settings belong to the ARCADE record key                                                                                       |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby crossings                                               |
| Front end        | Attract demo idle time                                                                                                                         |
| HUD              | Layout of the HUD elements, the vehicle-state elements included (real-device evaluation)                                                       |
| HUD              | Whether HUD text has a backing (none today)                                                                                                    |
| Camera           | Height spring (frequency and damping ratio) and yaw response (real-device evaluation of the DEV choices)                                       |
| Bank             | How the displayed vehicle bank follows lean (real-device evaluation)                                                                           |
| Art              | Production assets, new physical materials and tunnel/background content                                                                        |
| BG transitions   | Whether environment changes use wipes or dissolves (palette fades are not expected)                                                            |
| Ground           | Which of LEVEL-POINT and LEVEL2-POINT is the product default (real devices); the other and its cells are then removed                          |

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
