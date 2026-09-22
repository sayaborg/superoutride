# Development commands and build outputs

Use Node.js 24. [AGENTS](../AGENTS.md) owns checks and release procedure.

## Commands

| Command                       | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `npm ci`                      | Install locked dependencies.                                                       |
| `npm run check`               | Run lint, format checking and strict type checking.                                |
| `npm run lint`                | Lint source, tests and tools.                                                      |
| `npm run format`              | Format maintained files.                                                           |
| `npm run format:check`        | Check formatting.                                                                  |
| `npm run build`               | Clear dist, compile TypeScript, build graphics tools and generate course content.  |
| `npm test`                    | Run lint, format, strict TypeScript build, startup smoke and acyclic layer checks. |
| `python3 -m http.server 8000` | Serve the checkout, game and tools over HTTP.                                      |

### Course commands

Run these after building. Generated previews and reports are disposable.

```sh
npm run course -- compile content/courses/linear.course.json
npm run course -- render content/courses/linear.course.json --s 1200 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- report content/courses/linear.course.json --step 25 --out /tmp/course-report
node tools/course/fit.mjs observations.json recipe.json --out course.course.json
node tools/course/measure.mjs request.json --out observations.json
```

`npm run compile:course -- <source.json> [image-directory]` reports geometry-only compiler output.
[Content and gameplay](content-and-gameplay.md#agent-authoring) owns input/output semantics.

### Graphics tools

Serve the checkout and open `tools/graphics/sprite-tool.html` or `tools/graphics/sprite-lod.html`.
The file compilers are `npm run build:sprite-source -- <arguments>` and
`npm run build:sprite-lod -- <arguments>`; [Image assets](image-assets.md) owns their formats.

### Audio audition

Serve the checkout and open [engine audition](../tools/audio/audio-browser.html) or
[UNIFIED tire audition](../tools/audio/tire-browser.html). Both use the production audio voices at
fixed playback gain. Tire scenarios expose front/rear/both output; the game DEV panel provides
UNIFIED tuning and R/Q controls. These are listening tools, not automated quality or level gates.

## Build outputs

`dist/` contains compiled ESM and the built Sprite Tool/LOD preview. `dist/content/` contains validated course
JSON, compiled images/sprites, completed resident RGB555 ground and the content manifest. These are generated
outputs; authored sources remain under `content/`.

Build also generates current vehicle envelopes, continuous AI reference runs and game time budgets. It reuses
matching disposable entries from `.cache/course-reference/` and regenerates them when their inputs change.
This is game-data generation, not a timing regression test. The flat asphalt world in
`tools/course/vehicle-envelope.mjs` uses `SurfaceMap` for these measurements. Browsers load the selected vehicle's envelope and
budget without running the reference simulation.

| Output                                         | Use                                                    |
| ---------------------------------------------- | ------------------------------------------------------ |
| `dist/content/envelopes/<vehicle>.json`        | Driving envelopes used by rivals.                      |
| `dist/content/budgets/<course>/<vehicle>.json` | Initial and checkpoint time limits for timed Sessions. |
| `dist/offline/reference/<course>.json`         | Full generated reference runs; excluded from Pages.    |
| `_site/build/<commit>/`                        | Commit-versioned Pages build.                          |
| `_site/version.txt`                            | Published build identifier.                            |

Dependencies, caches, dist, previews and Pages staging are not committed source.

Pages stages only the commit-versioned build. After deployment,
`node tools/build/verify-published-site.mjs <Pages URL> <commit>` checks the public version and
starts the served game in headless Chrome. It does not rebuild or compare asset digests.
`CHROME_BIN` can select a Chromium executable for local use.
