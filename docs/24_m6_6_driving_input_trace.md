# M6.6 — Deterministic Driving Input Trace Replay

## Purpose

Current vehicle handling is still `DEV_UNCALIBRATED`. M6.6 therefore does not tune physics. It adds a repeatable driver-command trace so later handling candidates can be compared with exactly the same steering/throttle/brake sequence.

The calibration loop is now:

```text
DrivingInput trace
    -> candidate vehicle physics
    -> authoritative world state
    -> M6.5 telemetry
    -> compare summaries / traces
```

The input trace is independent from renderer, camera and race progress.

## Trace format

`src/dev/driving-input-trace.ts` defines:

```text
SUPER_OUTRIDE_INPUT_TRACE_V1
```

A trace contains:

```text
fixed dt
run-length encoded commands
    ticks
    steering [-1,+1]
    throttle boolean
    brake boolean
```

Adjacent identical commands are merged. Invalid steering is rejected rather than silently clamped, so a malformed calibration trace cannot quietly change meaning.

## Deterministic replay

`visitDrivingInputTrace()` expands the trace in a deterministic tick order. A caller can feed each command directly to a concrete physics implementation and then record the resulting state with the M6.5 telemetry observer.

JSON serialize/parse is supported so a trace can be stored as calibration evidence and replayed later.

## A/B handling comparison

Validation replays one immutable trace against:

```text
A: current M5_CAR_PROFILE
B: cloned profile with different maxDriveForce
```

The trace itself remains byte-equivalent before and after both runs, while output telemetry changes. This proves the tooling can distinguish physics candidates without embedding current handling values into the trace.

## What is authoritative

Authoritative:

- trace format and exact command sequence;
- fixed simulation dt attached to the trace;
- deterministic replay ordering;
- world-state output from whichever physics candidate is being evaluated.

Not authoritative:

- current M5 car parameter values;
- current M5 bike parameter values;
- current telemetry baseline;
- current rival AI tuning.

All remain subject to later handling work.

## Validation

```text
148 tests
148 pass
0 fail
```

Validated implementation head:

```text
141819a0fe296c1537ce01e8b296cd3d61cc3595
```

This provides the minimum repeatable experiment harness needed before serious vehicle handling calibration begins.
