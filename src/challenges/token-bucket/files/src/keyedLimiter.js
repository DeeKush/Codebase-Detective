const { TokenBucket } = require('./tokenBucket');

class KeyedLimiter {
  constructor(options) {
    this.options = options;
    this.buckets = new Map();
  }

  bucketFor(key) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.options);
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  allow(key, cost = 1) {
    return this.bucketFor(key).tryConsume(cost);
  }

  retryAfterMs(key, cost = 1) {
    return this.bucketFor(key).retryAfterMs(cost);
  }

  size() {
    return this.buckets.size;
  }
}

module.exports = { KeyedLimiter };
