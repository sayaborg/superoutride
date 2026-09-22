# Development commands and build outputs

Use Node.js 24. [AGENTS](../AGENTS.md) owns checks and release procedure.

## Commands

| Command                       | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm ci`                      | Install locked dependencies                                      |
| `npm run check`               | Lint, format check and strict type check                         |
| `npm run lint`                | Lint source, tests and tools                                     |
| `npm run format`              | Format maintained files                                          |
| `npm run format:check`        | Check formatting                                                 |
| `npm run build`               | Clear dist, compile TypeScript, build tools and generate content |
| `npm test`                    | Lint, format, build, startup smoke and acyclic layer checks      |
| `python3 -m http.server 8000` | Serve the checkout, game and tools                               |

### Course commands

Run after building:

```sh
npm run course -- compile content/courses/ribbon-coast.course.json
npm run course -- render content/courses/ribbon-coast.course.json --s 100 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- report content/courses/ribbon-coast.course.json --step 25 --out /tmp/course-report
node tools/course/measure.mjs request.json --out observations.json
```

`npm run compile:course -- <source.json> [--images directory]` reports the compiled course.
[Content and gameplay](content-and-gameplay.md#observation-formats) owns saved tool formats.
The render command uses the shared product scene; reports and preview images are disposable outputs.

### Graphics tools

Serve the checkout and open `tools/graphics/sprite-tool.html` or `tools/graphics/sprite-lod.html`.
The file compilers are `npm run build:sprite-source -- <arguments>` and
`npm run build:sprite-lod -- <arguments>`; [Image assets](image-assets.md) owns their formats.

### Audio audition

Serve the checkout and open [engine audition](../tools/audio/audio-browser.html) or
[UNIFIED tire audition](../tools/audio/tire-browser.html). Both use production voices and render at
48 kHz with fixed playback gain; game audio uses the device's supported native rate.

For engine adjustment, select a catalog profile and compare steady RPM/excitation with acceleration
and coast. Commit settings before the next audition playback. Keep playback gain fixed when comparing
timbre or output level. For tire adjustment, use independent front/rear/both scenarios for rolling,
cornering, wheel lock, loose surfaces and release. R/Q output controls isolate the two components.
[Calibration](calibration.md) gives values; the audio specifications define their effect.

On a device, check media volume and silent mode, then use SOUND START. Browser context state and audible
speaker output are separate observations. Record device/browser, scenario, settings and listening
findings with the change. [NEXT](NEXT.md) owns outstanding tuning and device work.

## Source-file conventions

Authored CourseDocuments and independent game assets live under `content/`. Reference videos,
extracted frames and pixel-bearing reference data stay in ignored `reference-media/` directories or
outside the checkout. This includes pixel arrays, masks and crops stored in JSON or other containers.
Only numeric observations, scalar calibration and source/edition descriptions are committed as
reference evidence. Product-renderer previews and reports are generated outputs.

## Build outputs

`dist/` contains compiled ESM and graphics tools. `dist/content/` contains course JSON, compiled
images/sprites and the content manifest. Course JSON retains authored Band constructs; the shared compiler expands them and builds immutable
preblend fields before browser driving or headless rendering. Expanded Bands and their profiles are
in-memory compiler products, not committed files or an additional delivered image format. Build also generates
vehicle envelopes, continuous reference runs and game time budgets. Matching disposable data under
`.cache/course-reference/` is reused; changed inputs regenerate it. Browsers load these products.

| Output                                         | Use                                      |
| ---------------------------------------------- | ---------------------------------------- |
| `dist/content/envelopes/<vehicle>.json`        | Rival driving envelopes                  |
| `dist/content/budgets/<course>/<vehicle>.json` | Timed Session budgets                    |
| `dist/offline/reference/<course>.json`         | Full reference runs, excluded from Pages |
| `_site/build/<commit>/`                        | Complete commit-versioned Pages build    |
| `_site/version.txt`                            | Published build identifier               |

Dependencies, caches, dist, previews and Pages staging are generated rather than committed source.
Pages serves one complete commit-versioned ESM build, including its relative module URLs.
After deployment, `node tools/build/verify-published-site.mjs <Pages URL> <commit>` checks the public
version and starts the served game in headless Chrome. `CHROME_BIN` selects a local Chromium executable.
