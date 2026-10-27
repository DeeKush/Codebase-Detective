# Rate limiter

`TokenBucket` allows bursts up to `capacity` and refills at `refillPerSecond` tokens per second.
`KeyedLimiter` keeps one bucket per client key. `middleware.js` turns a denied request into HTTP 429
with a `Retry-After` header (the HTTP header is expressed in whole seconds).
