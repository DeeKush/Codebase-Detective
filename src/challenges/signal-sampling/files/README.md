# Numeric utilities

- `convolve.js`: `f(x, w)` slides the kernel `w` across the signal `x` ("valid" positions only).
- `sampling.js`: `reservoirSample(stream, k)` returns k items chosen uniformly from a stream of unknown length.
- `stats.js`: `movingAverage(values, window)` built on `f`.
