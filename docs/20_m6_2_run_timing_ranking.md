# M6.2 — Deterministic Run Timing and Ranking Consumer

## 1. Purpose

M6.0 established physical checkpoint authority. M6.1 provided continuous ranking progress bounded by those checkpoints.

M6.2 adds a thin gameplay consumer layer:

```text
validated race progress
    ├─> deterministic run timing
    └─> active ranking
```

It does not reconstruct progress from raw geometry and does not add renderer state to gameplay authority.

---

## 2. Product-neutral FINISH semantics

The current DEV course is closed because it is a convenient geometry/render/physics test bed. That must not force the product into lap-race gameplay.

Therefore the timing layer calls each physically validated FINISH crossing a:

```text
course boundary
```

not a product lap.

On the current closed DEV course, repeated boundaries can be used to test interval timing. A later point-to-point/branching course can consume the same validated FINISH event as end-of-run semantics without replacing the timing architecture.

---

## 3. Deterministic timing authority

The run timer advances only from simulation time:

```text
elapsedSeconds += SIM_DT
```

It does not use:

```text
Date.now()
performance.now()
requestAnimationFrame timestamps
```

for gameplay timing.

The browser frame timestamp still drives the accumulator, but once physics ticks are emitted, race timing is a deterministic function of those ticks.

Accepted gate timestamps are quantized to the reporting physics tick, so timing resolution is bounded by one `SIM_DT`. This is simple, deterministic, and sufficient at the current gameplay stage.

---

## 4. Recovery behavior

Recovery/reset does not pause time.

A recovery tick:

```text
advances elapsed run time
records no gate timing
records no FINISH boundary
```

Thus recovery cannot be exploited to stop the clock, and a teleport/resync cannot manufacture a split.

---

## 5. Validated gate timings

A timing record is emitted only when `RaceProgressUpdate.acceptedGate` is non-null.

Each record stores:

```text
gate name
gate kind
elapsed simulation time
validatedProgressFloor
```

Diagnostic events such as shortcut rejection or reverse crossing do not create checkpoint timing records.

---

## 6. Course-boundary intervals

A physically accepted FINISH records:

```text
elapsedSeconds
intervalSeconds since previous accepted FINISH boundary
```

The session also tracks the minimum observed boundary interval.

Again, this is DEV closed-course instrumentation, not a declaration that SUPER OUTRIDE is a lap game.

---

## 7. Ranking authority

Ranking input is intentionally small:

```ts
interface RaceRankingInput {
  competitorId: string;
  sProgress: number;
  validatedProgressFloor: number;
}
```

There is no `sLocal`, world distance, renderer depth, or screen position in the ranking input.

Ranking uses:

```text
1. larger sProgress first
2. if equal, larger validatedProgressFloor first
3. if both equal, true tie
```

The secondary key matters at a gate boundary. An unvalidated competitor may have continuous progress saturated at the next gate ceiling. A competitor that has physically crossed and validated that gate has the same instantaneous `sProgress` but a higher `validatedProgressFloor`, so the validated competitor ranks ahead.

No arbitrary competitor ID is used to break a genuine tie.

---

## 8. Runtime integration

Each simulation tick now performs, conceptually:

```text
world physics
→ recovery check
→ race geometry/progress update or resync
→ advanceRaceSession(SIM_DT)
→ camera
→ existing renderer
```

Session timing runs on recovery ticks as well.

The HUD exposes:

```text
TIME <deterministic simulation run time>
BND  <validated course boundary count>
BEST <best validated boundary interval>
```

This remains debug presentation. The renderer itself is unchanged.

---

## 9. Validation

Validated feature head:

```text
0f9d7f777828a6b4e04316b197d3a672ed6d5efe
```

GitHub Actions:

```text
run 32614030397
job 97131611258
```

Result:

```text
131 tests
131 pass
0 fail
```

M6.2-specific tests prove:

- deterministic timer accumulation from fixed dt;
- only accepted gates generate timing records;
- validated FINISH generates course-boundary intervals and best interval;
- recovery consumes time without producing false timings;
- ranking ignores raw geometry;
- physically validated floor wins an equal-progress gate-boundary comparison;
- exactly equal validated states remain a true tie;
- deterministic millisecond time formatting.

---

## 10. Next

The next useful gameplay foundation is to represent more than one moving world vehicle while preserving the same authority split:

```text
world physics per vehicle
→ own Guide chart / SurfaceMap
→ own validated progress
→ shared ranking consumer
→ existing sprite renderer
```

That should be introduced as a small competitor/rival foundation, not as renderer-specific traffic logic.
