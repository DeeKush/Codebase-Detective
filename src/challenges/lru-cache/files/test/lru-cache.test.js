const assert = require('assert');
const { LRUCache, fakeClock } = require('../src');

describe('LRUCache', function () {
  it('stores and returns values', function () {
    const cache = new LRUCache({ max: 2 });
    cache.set('a', 1);
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('missing'), undefined);
  });

  it('evicts the least recently used entry when full', function () {
    const cache = new LRUCache({ max: 2 });
    cache.set('a', 1).set('b', 2).set('c', 3);
    assert.deepStrictEqual(cache.keys(), ['b', 'c']);
  });

  it('reading an entry protects it from eviction', function () {
    const cache = new LRUCache({ max: 2 });
    cache.set('a', 1).set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    assert.deepStrictEqual(cache.keys(), ['a', 'c']);
  });

  it('expires entries after the ttl', function () {
    const clock = fakeClock();
    const cache = new LRUCache({ max: 5, ttlMs: 100, clock });
    cache.set('a', 1);
    clock.advance(99);
    assert.strictEqual(cache.get('a'), 1);
    clock.advance(1);
    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.size, 0);
  });

  it('peek and has do not change recency', function () {
    const cache = new LRUCache({ max: 2 });
    cache.set('a', 1).set('b', 2);
    cache.peek('a');
    cache.has('a');
    cache.set('c', 3);
    assert.deepStrictEqual(cache.keys(), ['b', 'c']);
  });

  it('overwriting a key makes it the most recent', function () {
    const cache = new LRUCache({ max: 2 });
    cache.set('a', 1).set('b', 2).set('a', 10);
    cache.set('c', 3);
    assert.deepStrictEqual(cache.keys(), ['a', 'c']);
  });

  it('rejects a non-positive max', function () {
    assert.throws(() => new LRUCache({ max: 0 }), RangeError);
  });
});
