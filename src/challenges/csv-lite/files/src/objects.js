'use strict';
const { parse } = require('./parse');

// First row is the header; every other row becomes an object keyed by it.
function parseObjects(text, options) {
  const [header, ...rows] = parse(text, options);
  if (!header) return [];
  return rows.map(row => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ''])));
}

module.exports = { parseObjects };
