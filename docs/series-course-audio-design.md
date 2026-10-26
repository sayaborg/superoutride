# Series packages and course-bound audio

Design brief from K's decisions of 2026-10-27. **The direction in section 1 is accepted; the examples and migration
proposal are not implemented.** This brief introduces no runtime format, content entry or playback behavior.
The implementation baseline inspected was main `859b592ee5a7c9113fa26064364910a91a6b8ee3`.

This is a temporary change brief, not a second permanent specification or a new work queue. Before implementing it,
incorporate the accepted target into [Product](product.md), and its dependencies, open decisions and ordered work
into [NEXT](NEXT.md). Update each topic contract with its implementation, as [AGENTS](../AGENTS.md) requires.
Remove this brief and its README link when its content has been integrated; its PR retains the decision record.
Existing topic specifications describe the delivered behavior until then. Do not treat the old product's
reference-game series table or selectable music as the newly accepted target.

## 1. Accepted direction

### The game

SUPER OUTRIDE lets the player drive courses from contemporary arcade hardware, retaining their period visual
expression, with a shared, physically grounded vehicle model. Changing a package does not redesign the road,
replace its scenery or change a vehicle's mechanics. Driving a familiar road with a different vehicle is part of
the game's identity; it is neither a collection of separate reference-game clones nor a modern visual remake.

### Five packages

The basic SERIES lineup is OUTRIDE, CANNONBALL, ROAD DUEL, GRAND PRIX and STAGE ATTACK, in that order. OUTRIDE
replaces the earlier GRAND TOUR name; it is the game's flagship, not a sixth package.

| SERIES | Organizing idea | What makes it a package |
| --- | --- | --- |
| OUTRIDE | Enjoy the road and the vehicle | A curated driving adventure across different roads and vehicles; clocks, traffic and rivals support that experience. |
| CANNONBALL | Race the field on the open road | Public-road competition, overtaking and contrasting vehicles; field size and traffic can differ by class. |
| ROAD DUEL | Beat a particular rival | Distinct matchups and pursuits; a whole-run duel and successive opponents can belong together. |
| GRAND PRIX | Take part in organized circuit racing | Production classes, one-make cups, formula cars and sports prototypes, each under its own class conditions. |
| STAGE ATTACK | Master the road's stages | Driving accuracy and sustained pace across demanding stages; not restricted to unpaved roads. |

These are concepts, not five engine rule types. A series need not have one victory condition, one vehicle form or
one reference game's courses. OUTRIDE may contain both timed drives and competitive classes. Other packages may
share rule combinations with it when their curated vehicles, field and course offer a distinct experience.
Do not introduce series-ID switches into race, physics, drivers or audio to enforce this table.

### Composition and reuse

- SERIES owns its identity, presentation and ordered classes. It does not own a course or override vehicle physics.
- CLASS is one complete authored event: one course, eligible vehicles, opponents and competition conditions.
  Rules remain class data; the package is not merely an unrestricted settings menu.
- COURSE is a shared road and visual presentation, with a fixed race BGM and jingle assignment.
  Multiple classes in multiple series may reference the same course without copying its road data.
- VEHICLE retains its mechanics and physical sound identity across courses, classes, series and sessions.
- Cars and motorcycles are not separated merely because of a series name or a course's reference game.
  Class restrictions are justified by the event, such as a production-bike race or a one-make cup.
- FREE PLAY remains independent: arbitrary product-course, vehicle and supported run-condition choices.
  Its audio still follows the selected course. RACE and TIME ATTACK remain sessions, not new series.

This does not make every vehicle eligible for every class. It also does not require all courses to appear in all
five packages. Reuse is intentional, not a Cartesian product of courses, vehicles and rules.

### Reference-game scope

SEGA sources stop at these five: **ENDURO RACER, OUTRUN, SUPER HANG-ON, TURBO OUTRUN and SUPER MONACO GP**.
RACING HERO and COOL RIDERS are excluded. OUTRUNNERS is also outside that closed set; its inclusion in earlier
reorganization examples must not be carried forward. No WEST ROUND or EAST ROUND classes are scheduled by this brief.

CHASE H.Q., CISCO HEAT, FINAL LAP, WEC LE MANS 24 and BIG RUN remain reference-course plans from the existing
product specification, subject to their existing production decisions. The undecided NAMCO and TAITO extraction
choices in NEXT are not additional confirmed titles. TSUKUBA is an existing original venue; RALLY STAGE is the
existing original-course proposal, not an arcade-hardware source. Their status must remain distinguishable.

Excluding a reference game does not delete independently useful vehicle definitions, recordings or general
mechanisms. Such removals require their own dependency review. This brief neither expands the vehicle catalog nor
adds a new reference title.

### Course-bound race audio

Race BGM and jingles are fixed by the selected course, not by SERIES, CLASS, vehicle or a player's last song choice.
The same course uses the same audio assignment in OUTRIDE, another series, TIME ATTACK and FREE PLAY.
SELECT MUSIC is removed from both series and FREE PLAY flows. Volume controls remain; muting is not song selection.

A fixed assignment does not require a unique recording for every course: multiple courses may intentionally
reference the same assets. It also does not mean that all runs emit the same events. A time extension cue plays
only when time is extended, for example; TIME ATTACK must not fabricate one. Event production stays with the race,
and the course's audio mapping resolves the cue for the event that actually occurred.

Course-specific jingles include musical race cues such as checkpoint/time-extension and goal/game-over cues.
Menu operation sounds and physical engine, tire and impact sound are not converted into course music.
The precise boundary for READY, lap, final-lap and record cues must be recorded when the audio contract is updated.

This is a binding decision, not an instruction to extract the original games' music. Existing original-music
policy and asset sourcing remain unchanged. Exact compositions, recordings and per-course assignments have not
been chosen here. SERIES-selection/title music is a separate open presentation decision: do not delete it or
assign new tracks merely because race BGM moves to COURSE.

## 2. Candidate event slate, not a confirmed class list

The following is a starting point for class production. Names, availability, vehicles, opponent counts and
numeric difficulty values require validation. It does not establish a class count or a release order.

| Package | Candidate event | Course source | Intended distinction |
| --- | --- | --- | --- |
| OUTRIDE | COAST DRIVE | An OUTRUN route | Road cars and motorcycles, scenery and traffic, a complete authored drive. |
| OUTRIDE | AFRICA DRIVE | SUPER HANG-ON / AFRICA | The road with a broad, curated vehicle choice, rather than mandatory bike racing. |
| OUTRIDE | AMERICA DRIVE | One TURBO OUTRUN section | A drive on a selected leg; no assumption of a new continuous sixteen-stage course. |
| OUTRIDE | ENDURO TRAIL | ENDURO RACER | A drive on the original's unpaved course with suitable selected vehicles. |
| CANNONBALL | AFRICA SUPERBIKE | The same AFRICA course | A production-bike field; its event, not the source title, justifies eligibility. |
| CANNONBALL | COAST RACE | The same OUTRUN route | A curated competitive field; mixed cars and bikes only where admitted and playtested. |
| CANNONBALL | CITY RACE | CISCO HEAT | A city-road field with its traffic and overtaking conditions. |
| ROAD DUEL | F40 / 959 DUEL | TURBO OUTRUN sections | A defined matchup; each selected course is a separate class under the current model. |
| ROAD DUEL | PURSUIT | CHASE H.Q. | Successive opponents, without arrests or a requirement to collide. |
| ROAD DUEL | CAR / BIKE DUEL | An OUTRUN or SUPER HANG-ON course | A deliberately chosen cross-form matchup, without hidden performance equalization. |
| GRAND PRIX | PRODUCTION 750, GTI CUP, 911 CUP | TSUKUBA | Preserve the delivered events' meaning when migrating their package. |
| GRAND PRIX | FORMULA | SUPER MONACO GP; FINAL LAP | Separate course-specific classes, not a newly assumed multi-course championship. |
| GRAND PRIX | GROUP C | WEC LE MANS 24 | Circuit competition; no new pit, fuel or real-time endurance system. |
| STAGE ATTACK | ENDURO ATTACK | The same ENDURO RACER course | A stage-focused challenge distinct from OUTRIDE's drive. |
| STAGE ATTACK | RALLY RAID | BIG RUN | Candidate placement only; do not silently discard its planned rival/rank rules. |
| STAGE ATTACK | ROAD ATTACK | A SUPER HANG-ON course | Stage-focused paved-road driving, not an off-road-only category. |

The proposed original RALLY STAGE courses remain candidates for STAGE ATTACK if retained. They are not promoted to
completed courses by this table. Likewise, no cross-original road splicing, arbitrary new stage selection or
multi-course progression is authorized by these examples.

For the shared AFRICA example, both packages would reference one road and one audio assignment. Their eligible
vehicles, field and traffic may differ. This is the intended distinction between COURSE reuse and CLASS reuse.
STAGE ATTACK's package name must also remain distinct from the existing TIME ATTACK session.

## 3. Implementation gaps found in the inspected baseline

The inspected [series catalog](../src/content/series-catalog.ts) already permits course reuse, but its series
holds `music.title` and `music.race`. The [run request](../src/shell/run-request.ts) carries a selected `track`,
and `offeredTracks`/`latestTrack` also drive URL-started runs. Removing the selection screen alone would leave
old song selection active through these paths.

The [run effects](../src/shell/run-effects.ts) currently request common named effects. Their event timing and
one-event/one-cue policy can remain shared; the course must supply musical cue assets without changing the race's
facts. Contact explosion/impact sounds must not accidentally become course-specific through that change.

Two gameplay constraints must not be overlooked:

1. Every eligible class vehicle currently requires a grid entry, and the field has at most sixteen entries.
   Those entries become rivals when the player chooses another entry. This cannot represent an arbitrary choice
   of cars and bikes for a genuinely solo OUTRIDE class. Separate player eligibility from opponent composition
   at the responsible content/run-assembly boundary, without dummy opponents or duplicating a class per vehicle.
2. Admission currently restricts mixed car/bike candidate fields on a course with a dedicated bike grid, because
   reference runs and starting positions must agree. Preserve correct starts and timing, or keep those particular
   events separated until the shared rule is corrected. Do not bypass admission or rewrite course geometry to
   make a proposed mixed event appear to work.

The current series schema also lacks an explicit optional-clock field even though Product describes on/off
clocks. Do not claim an authored clock-free competition is already supported. Verify the actual run-rule contract
before using it in a class; do not add a second clock system just to distinguish OUTRIDE from STAGE ATTACK.

## 4. Migration proposal

[NEXT](NEXT.md) remains the scheduling authority. This dependency order is a proposal for integration there, not
permission to interrupt the ongoing original-road reconstruction work or merge an unvalidated branch.

### A. Integrate the target and scope

Update Product's structure, series lineup, selection flow and audio target together. Replace reference-title
SERIES ownership with the five packages, but keep reference titles as course provenance. Remove excluded games
from future production tables without deleting unrelated reusable assets. Transfer unresolved values and this
migration's order into NEXT. Keep current delivered-state descriptions truthful.

Do not simply rename all old series or adopt the earlier thirty-class count. K accepted the package direction,
not every illustrative class, car, route, stage count or competition rule previously suggested.

### B. Make race audio resolve from the course

Prefer one authored course-to-audio binding outside regenerated ROM-derived road geometry. Validate its course,
track and cue references once when compiling/delivering content. A missing required binding is a diagnostic;
intentional silence must be explicit, not a silent fallback to another series or a remembered song.

Initially use the existing playback facilities. A fixed sequence of course-local tracks can be added only when
a produced course actually requires it; there is no need to add a general music scheduler for this migration.
Sharing an asset does not require copying it. Audit what participates in the course/run identity so that changing
only audio does not unnecessarily discard driving records or rerun physical reference measurements.

Resolve audio after the course is known for every entry path: menus, direct URLs, RETRY, CHANGE VEHICLE, DEV
rebuilds, TIME ATTACK and FREE PLAY. Remove SELECT MUSIC, offered-song lookup, obsolete song-choice state and
series race-track ownership. Do not leave a permanent old/new playback branch. If the work must span several
reviewable PRs, NEXT must name the final removal PR and the game must stay playable at each step.

Keep music/effects volume settings and shared pause/resume, READY, finish/failure and one-shot lifetimes. Decide
how SETTINGS auditions a fixed track without reviving gameplay song selection. Preserve current title-menu music
until its separate presentation decision is made.

### C. Author the packages and migrate identity carefully

Separate eligibility and rivals as needed, then introduce the five series with reviewed class definitions.
Reusing a course must reuse its road, scenery and audio binding; changing a class must not change vehicle physics.
Keep physics, race and playback code independent of individual series IDs.

Retain existing TSUKUBA class identities where possible when moving them to GRAND PRIX. Audit saved selections,
URL entry and TIME ATTACK records before changing series IDs. A display/package-only move may have an explicit
migration; a changed competition or driving condition must not inherit an incomparable record. Preserve player
volume and vehicle-color preferences. Old music-selection values must no longer influence a run.

### D. Validate and close the migration

Update Audio, Browser, Content and gameplay, development/build descriptions and the documentation index with the
implemented contracts. Remove the old reference-title package assumptions and obsolete SELECT MUSIC state/tests.
Once the owning documents contain the target and work, remove this temporary brief and its root README link.
Keep rationale and verification in the PRs, not a parallel permanent specification.

## 5. Acceptance checks for the implementation PRs

- One course used by two series resolves identical BGM and identical cue assets for corresponding events;
  switching the player's car/bike or session does not select different music. Events absent from a session do
  not play invented cues. Explicitly shared audio assets work without duplicated files.
- A multi-vehicle solo class produces the player alone; a duel has its intended opponent, and a field race its
  intended entries. Mixed-form starts and vehicle reference timing satisfy admission rather than bypass it.
- Menus, URLs, RETRY, CHANGE VEHICLE, TIME ATTACK and FREE PLAY all resolve course audio; stale song selections
  cannot override it. Pause/resume, completion, failure and record notifications have correct lifetimes.
- Invalid course/audio references fail admission. An intentional silent cue is distinguished from missing data.
- No course road/scenery data, vehicle mechanics, physical sounds or current original-road research is changed
  merely by regrouping packages or moving audio ownership. Audio-only changes preserve valid driving records.
- The five closed-scope SEGA sources remain the only such sources in production plans. No excluded game's class
  is reintroduced by an old table, demonstration, test fixture presented as product content, or selector.
- Before release, run the repository's Node 24 checks, link checks and relevant deterministic scenarios; inspect
  the exact PR-head CI and preserve the unrelated active branches. This design-only PR makes no claim that those
  runtime acceptance checks have already passed.

## 6. Still open

The exact class inventory and order within each package; eligible vehicle sets and opponents; course-specific
clock/rank/traffic values; actual BGM and jingle assignments; the boundary of race presentation cues; title-menu
music; and the release/migration schedule remain open. A short representative slate is preferable to filling
all combinations. No new recording, broad vehicle eligibility, scoring system or championship is implied until
its concrete data and behavior are approved and validated.
