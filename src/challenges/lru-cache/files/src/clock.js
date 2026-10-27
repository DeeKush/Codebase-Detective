'use strict';
const systemClock = { now: () => Date.now() };

// A clock tests can move by hand.
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: ms => { t += ms; } };
}

module.exports = { systemClock, fakeClock };
