'use strict';
const { Emitter } = require('./emitter');

// Topic bus: subscribers to "*" see every topic as (topic, payload).
class Bus {
  constructor() { this.emitter = new Emitter(); }

  subscribe(topic, fn) { return this.emitter.on(topic, fn); }
  subscribeOnce(topic, fn) { return this.emitter.once(topic, fn); }

  publish(topic, payload) {
    const direct = this.emitter.emit(topic, payload);
    const wild = this.emitter.emit('*', topic, payload);
    return direct || wild;
  }
}

module.exports = { Bus };
