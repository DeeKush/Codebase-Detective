const assert = require('assert');
const { Emitter, Bus } = require('../src');

describe('Emitter', function () {
  it('calls handlers in order with the arguments', function () {
    const e = new Emitter(), seen = [];
    e.on('x', (a, b) => seen.push(['one', a, b]));
    e.on('x', (a, b) => seen.push(['two', a, b]));
    e.emit('x', 1, 2);
    assert.deepStrictEqual(seen, [['one', 1, 2], ['two', 1, 2]]);
  });

  it('returns whether anything listened', function () {
    const e = new Emitter();
    assert.strictEqual(e.emit('nobody'), false);
    e.on('x', () => {});
    assert.strictEqual(e.emit('x'), true);
  });

  it('on() returns an unsubscribe function', function () {
    const e = new Emitter();
    let calls = 0;
    const off = e.on('x', () => calls++);
    e.emit('x');
    off();
    e.emit('x');
    assert.strictEqual(calls, 1);
  });

  it('once() runs a single time', function () {
    const e = new Emitter();
    let calls = 0;
    e.once('x', () => calls++);
    e.emit('x');
    e.emit('x');
    assert.strictEqual(calls, 1);
  });

  it('off() can remove a once() handler by its original function', function () {
    const e = new Emitter();
    let calls = 0;
    const fn = () => calls++;
    e.once('x', fn);
    e.off('x', fn);
    e.emit('x');
    assert.strictEqual(calls, 0);
  });

  it('cleans up empty event lists', function () {
    const e = new Emitter();
    const fn = () => {};
    e.on('x', fn);
    e.off('x', fn);
    assert.strictEqual(e.listenerCount('x'), 0);
  });
});

describe('Bus', function () {
  it('delivers payloads to topic subscribers', function () {
    const bus = new Bus(), seen = [];
    bus.subscribe('user.created', p => seen.push(p));
    bus.publish('user.created', { id: 1 });
    assert.deepStrictEqual(seen, [{ id: 1 }]);
  });

  it('wildcard subscribers see every topic', function () {
    const bus = new Bus(), seen = [];
    bus.subscribe('*', (topic, p) => seen.push([topic, p]));
    bus.publish('a', 1);
    bus.publish('b', 2);
    assert.deepStrictEqual(seen, [['a', 1], ['b', 2]]);
  });
});
