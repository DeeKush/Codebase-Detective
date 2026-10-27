'use strict';

class Emitter {
  constructor() { this.handlers = new Map(); }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
    return () => this.off(event, fn);
  }

  // Runs fn at most once, then removes itself.
  once(event, fn) {
    const wrapper = (...args) => { this.off(event, wrapper); return fn(...args); };
    wrapper.original = fn;
    return this.on(event, wrapper);
  }

  off(event, fn) {
    const list = this.handlers.get(event);
    if (!list) return;
    const index = list.findIndex(h => h === fn || h.original === fn);
    if (index >= 0) list.splice(index, 1);
    if (!list.length) this.handlers.delete(event);
  }

  // Calls every handler registered when emit starts. Returns true if there was at least one.
  emit(event, ...args) {
    const list = this.handlers.get(event);
    if (!list) return false;
    for (const handler of list) handler(...args);
    return true;
  }

  listenerCount(event) { return (this.handlers.get(event) || []).length; }
}

module.exports = { Emitter };
