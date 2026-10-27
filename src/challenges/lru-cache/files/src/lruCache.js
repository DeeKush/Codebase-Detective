'use strict';
const { systemClock } = require('./clock');

// Least-recently-used cache with optional time-to-live.
class LRUCache {
  constructor({ max = 100, ttlMs = 0, clock = systemClock } = {}) {
    if (!(max > 0)) throw new RangeError('max must be positive');
    this.max = max;
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.entries = new Map(); // insertion order == recency order, oldest first
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.ttlMs ? this.clock.now() + this.ttlMs : Infinity });
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value);
    return this;
  }

  get(key) {
    const entry = this._live(key);
    if (!entry) return undefined;
    if (entry.value) {
      this.entries.delete(key);
      this.entries.set(key, entry); // mark as most recently used
    }
    return entry.value;
  }

  // Like get() but does not change recency.
  peek(key) {
    const entry = this._live(key);
    return entry ? entry.value : undefined;
  }

  has(key) { return this._live(key) !== undefined; }
  delete(key) { return this.entries.delete(key); }
  get size() { return this.entries.size; }
  keys() { return [...this.entries.keys()]; }

  _live(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock.now()) { this.entries.delete(key); return undefined; }
    return entry;
  }
}

module.exports = { LRUCache };
