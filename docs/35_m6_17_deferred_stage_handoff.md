# M6.17 — Deferred Stage Handoff

## Purpose

Route choice and content/chart replacement are not the same event.

M6.17 introduces an explicit pending interval so a fork can remain visually continuous after the player has chosen a side. The old package remains active until an authored world-space handoff seam is crossed.

## DEV sequence

```text
visible route gate at approximately s=545
        ↓
validated LEFT / RIGHT choice
        ↓
PENDING target stage/chart/package
        ↓
overlap / occlusion interval
        ↓
world-space handoff seam at s=600
        ↓
atomic child chart + content-reference commit
```

This gives future stages room to hide the unselected road behind terrain, buildings, tunnel walls or other ordinary content before the old package is discarded.

## Transaction rules

- only a forward crossing of the pending choice's seam can commit
- reverse crossing cannot commit
- while a handoff is pending, another route choice is not accepted
- recovery resyncs the observation origin and cannot trigger the seam
- the commit reads the world pose but does not mutate position, yaw or velocity
- active chart and opaque content package change together

M6.17 deliberately does not yet force the renderer or vehicle physics onto the child package. It establishes the transaction boundary first.
