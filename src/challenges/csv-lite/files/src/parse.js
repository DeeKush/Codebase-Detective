'use strict';

// Parses CSV text into rows of strings. Supports quoted fields, doubled quotes ("") and \n or \r\n line endings.
// Blank lines are ignored.
function parse(text, { delimiter = ',' } = {}) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let blank = true; // nothing but a line break seen on this line so far

  const endRow = () => {
    if (!blank) { row.push(field); rows.push(row); }
    row = []; field = ''; blank = true;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      quoted = true; blank = false;
    } else if (c === delimiter) {
      row.push(field); field = ''; blank = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row);
      row = []; field = ''; blank = true;
    } else {
      field += c; blank = false;
    }
  }
  endRow();
  return rows;
}

module.exports = { parse };
