# SUPER OUTRIDE

A 320×240 raster pseudo-3D driving game for the browser. Cars and bikes share world coordinates, suspension contacts, tires and wheel mechanics.

Vehicle mechanics and control laws are frozen; parameters remain tunable. Handling is `DEV_UNCALIBRATED`. Visuals, sound and game systems can build on this foundation while vehicle calibration and target-device acceptance continue.

[AGENTS.md](AGENTS.md) defines project authority and development priorities.

- [Restart and next work](docs/NEXT.md)
- [Current specifications](docs/README.md)
- [Development contract](AGENTS.md)
- [Play the game](https://sayaborg.github.io/superoutride/)

## Run

Use Node.js 24.

```sh
npm ci
npm test
python3 -m http.server 8000
```

Open `http://localhost:8000/`. `npm run check` checks lint, formatting and types; `npm run build` generates ESM and GroundMap assets.

## Controls

Left/right arrows steer. Up or X accelerates; down or Z brakes. On touchscreens, the left half controls steering and the right half controls throttle (up) and brake (down). Each finger's initial position is its origin; 64 CSS pixels of displacement produces full input. Keyboard and touch share input arbitration.

Use the selectors for vehicle, course and calibration. Course keys 1–4 select LINEAR / BRANCHING / TSUKUBA / FISCO. Their URLs are `?mode=linear`, `?mode=branching`, `?mode=circuit` and `?mode=fisco`; BRANCHING is the default.

See [current calibration values and meanings](docs/calibration.md).

## Structure

`src/core` owns open coordinates and projection; `src/physics` owns common mechanics. `src/course` and `src/runtime` compile and assemble course content. `src/gameplay` owns route choices, laps and recovery. `src/render` and `src/visual` own presentation; `src/browser` owns browser input, scheduling and UI. `src/dev` contains concrete trial courses and regression fixtures.

The working tree contains current specifications, executable regressions and one restart checkpoint. Git retains history. Fixture names do not supersede current specifications.
