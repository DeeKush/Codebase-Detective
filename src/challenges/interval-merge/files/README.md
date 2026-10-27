# Booking Intervals

Helpers for a room-booking tool.

- `mergeRanges(ranges)` merges overlapping or touching `[start, end]` ranges and returns them sorted. It must not modify its input.
- `totalCoverage(ranges)` is the total length of the union of the ranges.
- `gaps(ranges, from, to)` lists the free ranges in `[from, to]`.
