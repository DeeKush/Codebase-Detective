'use strict';

function quote(value, delimiter) {
  const s = value === null || value === undefined ? '' : String(value);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stringify(rows, { delimiter = ',' } = {}) {
  return rows.map(row => row.map(v => quote(v, delimiter)).join(delimiter)).join('\n') + (rows.length ? '\n' : '');
}

module.exports = { stringify };
