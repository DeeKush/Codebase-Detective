'use strict';
const { mergeRanges } = require('./intervals');

// Total length covered by the union of the ranges.
function totalCoverage(ranges) {
  return mergeRanges(ranges).reduce((sum, [start, end]) => sum + (end - start), 0);
}

// Free ranges inside [from, to] that no booking covers.
function gaps(ranges, from, to) {
  const free = [];
  let cursor = from;
  for (const [start, end] of mergeRanges(ranges)) {
    if (end <= cursor) continue;
    if (start >= to) break;
    if (start > cursor) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < to) free.push([cursor, to]);
  return free;
}

module.exports = { totalCoverage, gaps };
