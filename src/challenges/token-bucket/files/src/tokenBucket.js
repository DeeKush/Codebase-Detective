const { systemClock } = require('./clock');

class TokenBucket {
  constructor({ capacity, refillPerSecond, clock = systemClock }) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.clock = clock;
    this.tokens = capacity;
    this.lastRefill = clock.now();
  }

  refill() {
    const now = this.clock.now();
    const elapsed = now - this.lastRefill;
    if (this.tokens > this.capacity) {
      this.tokens = this.capacity;
    }
    this.tokens += elapsed * this.refillPerSecond;
    this.lastRefill = now;
  }

  tryConsume(cost = 1) {
    this.refill();
    if (this.tokens > cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  // Time in milliseconds until `cost` tokens will be available.
  retryAfterMs(cost = 1) {
    this.refill();
    const missing = cost - this.tokens;
    if (missing <= 0) return 0;
    return Math.ceil(missing / this.refillPerSecond);
  }
}

module.exports = { TokenBucket };
