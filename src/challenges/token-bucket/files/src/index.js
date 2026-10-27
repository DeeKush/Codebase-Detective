const { KeyedLimiter } = require('./keyedLimiter');
const { rateLimit } = require('./middleware');

// Default policy: bursts of 5 requests, 1 new request per second per client.
const limiter = new KeyedLimiter({ capacity: 5, refillPerSecond: 1 });

module.exports = { limiter, middleware: rateLimit(limiter) };
