# M6.16 — Child Guide Chart Handoff

## Purpose

M6.16 separates world-authoritative motion from the road coordinate chart used after a branch.

A child chart does not move the vehicle. It only changes which road center is called local `l=0`.

For the fully separated DEV junction:

```text
parent chart left road:   l = -7.5 m
left child chart:         l = 0

parent chart right road:  l = +7.5 m
right child chart:        l = 0
```

## Handoff rule

```text
world x, y, z      unchanged
world yaw          unchanged
world velocity     unchanged
road chart         replaced
new (s,l)          recovered from the same world pose
```

The child chart is therefore a coordinate interpretation, not a teleport, snap or hidden transform of physics.

## Invariants

- world pose/motion remains authoritative
- signed lateral freedom around the child center remains continuous
- chart logic imports neither renderer nor vehicle-physics implementation
- renderer source coordinates are not silently switched before matching visual content exists

This boundary lets later stage packages replace their Guide/content authority without contaminating physics with route selection.
