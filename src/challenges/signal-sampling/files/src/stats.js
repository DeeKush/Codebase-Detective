const { f } = require('./convolve');

// Average of every `window` consecutive values.
function movingAverage(values, window) {
  const ones = new Array(window).fill(1 / window);
  return f(values, ones);
}

module.exports = { movingAverage };
