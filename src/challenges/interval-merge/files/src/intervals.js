'use strict';

function normalize(range) {
  const [start, end] = range;
  if (!(start <= end)) throw new RangeError(`Invalid range [${start}, ${end}]`);
  return [start, end];
}

// Merges overlapping or touching ranges and returns them sorted. Does not modify its input.
function mergeRanges(ranges) {
  const sorted = ranges.map(normalize).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = end;
    else merged.push([start, end]);
  }
  return merged;
}

module.exports = { mergeRanges };
