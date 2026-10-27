const assert = require('assert');
const { mergeRanges, totalCoverage, gaps } = require('../src');

describe('mergeRanges', function () {
  it('returns an empty list for no ranges', function () {
    assert.deepStrictEqual(mergeRanges([]), []);
  });

  it('keeps separate ranges separate and sorted', function () {
    assert.deepStrictEqual(mergeRanges([[10, 12], [1, 3]]), [[1, 3], [10, 12]]);
  });

  it('merges overlapping ranges', function () {
    assert.deepStrictEqual(mergeRanges([[1, 5], [4, 9]]), [[1, 9]]);
  });

  it('merges ranges that touch', function () {
    assert.deepStrictEqual(mergeRanges([[1, 5], [5, 8]]), [[1, 8]]);
  });

  it('does not modify its input', function () {
    const input = [[5, 8], [1, 6]];
    mergeRanges(input);
    assert.deepStrictEqual(input, [[5, 8], [1, 6]]);
  });

  it('rejects a reversed range', function () {
    assert.throws(() => mergeRanges([[5, 1]]), RangeError);
  });
});

describe('coverage', function () {
  it('adds up the length of separate ranges', function () {
    assert.strictEqual(totalCoverage([[0, 2], [5, 9]]), 6);
  });

  it('counts overlap once', function () {
    assert.strictEqual(totalCoverage([[0, 5], [3, 8]]), 8);
  });

  it('finds the gaps between bookings', function () {
    assert.deepStrictEqual(gaps([[2, 4], [6, 8]], 0, 10), [[0, 2], [4, 6], [8, 10]]);
  });

  it('reports no gaps when fully booked', function () {
    assert.deepStrictEqual(gaps([[0, 10]], 0, 10), []);
  });
});
