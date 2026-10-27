const assert = require('assert');
const { parse, stringify, parseObjects } = require('../src');

describe('parse', function () {
  it('splits simple rows', function () {
    assert.deepStrictEqual(parse('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
  });

  it('handles a missing final newline', function () {
    assert.deepStrictEqual(parse('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  });

  it('keeps commas and newlines inside quotes', function () {
    assert.deepStrictEqual(parse('"a,b","line1\nline2"\n'), [['a,b', 'line1\nline2']]);
  });

  it('unescapes doubled quotes', function () {
    assert.deepStrictEqual(parse('"say ""hi"""\n'), [['say "hi"']]);
  });

  it('supports windows line endings', function () {
    assert.deepStrictEqual(parse('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  });

  it('keeps empty fields', function () {
    assert.deepStrictEqual(parse('a,,c\n,,\n'), [['a', '', 'c'], ['', '', '']]);
  });

  it('supports other delimiters', function () {
    assert.deepStrictEqual(parse('a;b\n', { delimiter: ';' }), [['a', 'b']]);
  });
});

describe('stringify', function () {
  it('quotes only when needed', function () {
    assert.strictEqual(stringify([['a', 'b c', 'd,e', 'say "x"']]), 'a,b c,"d,e","say ""x"""\n');
  });

  it('round-trips through parse', function () {
    const rows = [['id', 'note'], ['1', 'line1\nline2'], ['2', 'a "quoted", value']];
    assert.deepStrictEqual(parse(stringify(rows)), rows);
  });
});

describe('parseObjects', function () {
  it('maps rows to objects by header', function () {
    assert.deepStrictEqual(parseObjects('name,age\nAda,36\n'), [{ name: 'Ada', age: '36' }]);
  });

  it('fills missing trailing fields with empty strings', function () {
    assert.deepStrictEqual(parseObjects('a,b\n1\n'), [{ a: '1', b: '' }]);
  });
});

describe('csv blank lines', function () {
  it('parse ignores blank lines between rows', function () {
    assert.deepStrictEqual(parse('a,b\n\n1,2\n'), [['a', 'b'], ['1', '2']]);
  });

  it('parse ignores blank windows lines and trailing blanks', function () {
    assert.deepStrictEqual(parse('a\r\n\r\nb\r\n\r\n'), [['a'], ['b']]);
  });

  it('parseObjects does not turn a blank line into a record', function () {
    assert.deepStrictEqual(parseObjects('name\nAda\n\nGrace\n'), [{ name: 'Ada' }, { name: 'Grace' }]);
  });

  it('a row holding only an empty quoted field is not blank', function () {
    assert.deepStrictEqual(parse('""\n'), [['']]);
  });
});
