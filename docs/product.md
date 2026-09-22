# Product specification

SUPER OUTRIDE is a browser driving game with a 320 by 240 raster pseudo-3D view.
Cars and motorcycles share vehicle mechanics. [NEXT](NEXT.md) contains future product work and course selections.

## 1. Courses and vehicles

The game loads saved CourseDocuments through one shared driving scene. The browser offers LINEAR,
SEAM, CIRCUIT and BRANCH development selections. LINEAR and SEAM are finite routes, CIRCUIT has a
finite lap target, and BRANCH contains forks and merges. SEAM exposes a connection between local
course frames. Course geometry, height, width, roadside rows and environment changes are authored data.
[Content and gameplay](content-and-gameplay.md) owns their definitions and rules.

The vehicle catalog supplies car and motorcycle profiles with model, manufacturer, identifier,
specification and period metadata. Testarossa is the default player vehicle. Vehicle presentation
uses authored yaw and motorcycle-bank images.

## 2. Sessions and play

CLASSIC uses the course's vehicle, rival count, lap count and checkpoint countdown. CUSTOM offers
vehicle selection, zero to sixteen rivals, the permitted lap count and countdown on/off.
The setup screen resolves these settings before START; vehicle and handling settings are locked
for the run. [Browser](browser.md) owns controls and URL settings.

Sessions use standing starts. Checkpoints add time to a running countdown; a terminal goal or the
required completed laps ends the run. GOAL and GAME OVER show the final rank and elapsed time.
PAUSE suspends the run, and NEW SESSION returns to setup.

Rivals use the same mechanics as the player and receive steering and pedal input from the envelope
driver. At a fork, the first eligible crossing selects the route for the racing field. Unselected
roads show warnings and closure signs; vehicles remaining there at closure recover to the selected
road. Vehicles and roadside objects are pass-through. Recovery preserves earned race progress.
[Session and timing rules](content-and-gameplay.md#session-and-reference-timing) define event ordering and budgets.

## 3. Presentation and authoring

The view combines a tiled background, road and scenery sprites with the player and HUD. Testarossa
brake lamps select a saved palette. Engine sound and player tire sound follow physical observations.
The HUD shows race state and current performance measurements; a DEV overlay exposes camera and sound controls.

Courses and assets are saved files. The CLI compiles courses, reports diagnostics and renders previews
through the game scene. The Sprite Tool edits image inputs and exports compiled sprites.
[Development](development.md) owns the commands.

## 4. Ground

The game loads completed resident RGB555 ground before driving. Inside each finite painted strip,
completed colors supply the visible surface; outside it, the environment supplies a left/right color
or transparency. Transparent outside areas reveal the background. Physical support and friction use
separate authored bindings. [Image assets](image-assets.md#resident-ground) owns the current encoding and filter.
