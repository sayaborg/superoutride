# SUPER OUTRIDE

A 320×240 raster pseudo-3D browser driving game. Cars and bikes share world coordinates, suspension
contacts, tires and wheel mechanics. Saved CourseDocuments supply TSUKUBA and the
courses raised from the originals' ROMs through one driving scene, with ordered Strip surfaces.

[Play the game](https://sayaborg.github.io/superoutride/).
[Specifications](docs/README.md) identify each contract's owner; [NEXT](docs/NEXT.md) owns future work.

[Series packages and course-bound audio](docs/series-course-audio-design.md) records the approved redesign
and its proposed migration. It is a temporary design brief, not implemented behavior or a replacement work queue.

## Run

Use Node.js 24:

```sh
npm ci
npm test
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Build stages saved content, completed sprites and run data under
`dist/delivery/`. Strip constructs compile to immutable color and material fields before driving starts.
Ground and walls are drawn by one method, LEVEL-POINT, defined in [Architecture](docs/architecture.md#strip-rendering).

## Controls and authoring

[Browser](docs/browser.md) defines keyboard/touch operation, run setup, URLs and DEV controls.
[Development](docs/development.md) lists course compilation, PNG previews, reports and graphics tools. Authored content lives under `content/`; generated outputs are disposable.

## Structure

`src/` is the product root; `tools/` is the authoring/build root. TypeScript tools consume product source and share its strict type/lint checks. [Development](docs/development.md#typescript-tools)
describes execution and browser-tool delivery.

[Architecture](docs/architecture.md#layer-boundaries) defines the product layer order, responsibilities and dependency rules.

`src/shell/main-course.ts` is the one composition root: it creates the page and assembles its runs.
