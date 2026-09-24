# Product specification

SUPER OUTRIDE is a browser driving game with a 320 by 240 raster pseudo-3D view.
Cars and motorcycles share vehicle mechanics. [NEXT](NEXT.md) contains future product work and course selections.

## 1. Courses and vehicles

The game loads saved CourseDocuments through one shared driving scene. RIBBON COAST is a finite
linear route, RIBBON FORK contains a fork and merge, and RIBBON RING has a finite lap target. These
provisional courses include ordered ground colors, repeated markings, arrows, lettering, curbs and
transparent cliff/bridge exteriors. They are not reproductions of selected production references.
RIBBON FORK's left/right Sections run independently before the shared home Section.
Course geometry, height, width, roadside rows and environment changes are authored data.
[Content and gameplay](content-and-gameplay.md) owns their definitions and rules.

The vehicle catalog supplies car and motorcycle definitions with model, manufacturer, identifier,
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

## 3. Rendering and authoring

The view combines a tiled background, road and sprites sprites with the player and HUD. Testarossa
brake lamps select a saved palette. Engine sound and player tire sound follow physical observations.
The HUD shows race state and current performance measurements; a DEV overlay exposes camera, sound and ground display controls.

Courses and assets are saved files. The CLI compiles courses, reports diagnostics and renders previews
through the game scene. The Sprite Tool edits image inputs and exports compiled sprites.
[Development](development.md) owns the commands.

## 4. Ground

Ground is an ordered list of colored Strips covering the whole plane,
including open outer sides. Later Strips replace earlier colors or erase them to transparency. Transparent
areas reveal the background below as well as above the horizon. Material and color can be authored independently on the same Strip. [Content and gameplay](content-and-gameplay.md#strips)
owns authoring; [Architecture](architecture.md#strip-rendering) owns preblending and pixel filtering.

The product ground-display setting defaults to LEVEL-POINT. DEV provides its control, and
switching redraws the current scene without changing vehicle state, camera or Session progress.
[Browser](browser.md#ground-display-setting) owns operation and setting lifetime. The three rendering
modes are defined only in the rendering contract linked above. Ground contains no image assets;
lettering, arrows, curbs and cliff edges expand from saved Strip constructs.
