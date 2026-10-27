// Time source for the limiter. Injected so tests can control time.
const systemClock = {
  now() {
    return Date.now();
  }
};

module.exports = { systemClock };
