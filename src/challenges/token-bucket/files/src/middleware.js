function rateLimit(limiter, { keyFrom = req => req.ip, cost = 1 } = {}) {
  return function handler(req, res, next) {
    const key = keyFrom(req);
    if (limiter.allow(key, cost)) return next();

    const wait = limiter.retryAfterMs(key, cost);
    res.setHeader('Retry-After', String(wait));
    res.statusCode = 429;
    res.end(JSON.stringify({ error: 'rate_limited', retryAfterMs: wait }));
  };
}

module.exports = { rateLimit };
