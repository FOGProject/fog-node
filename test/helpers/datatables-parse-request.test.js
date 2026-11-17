const assert = require('assert');

// The datatables/parse-request helper: the draw, start, length and search of a
// server-side request, safe for any JSON value. A JSON body can make String()
// or parseInt() throw (an object with a toString key), and a start of 1e20 is
// not a safe integer, so Waterline refuses it as a skip.
describe('datatables parse-request helper::', () => {
  const parse = (body) => sails.helpers.datatables.parseRequest.with({body});
  const OBJ = {toString: 1};

  it('reads draw, start, length and search from a form-style body', () => {
    assert.deepStrictEqual(parse({draw: '3', start: '20', length: '10', search: {value: '  Lab '}}),
      {draw: 3, start: 20, length: 10, search: 'Lab'});
    assert.deepStrictEqual(parse({draw: 3, start: 20, length: -1, search: {value: 7}}),
      {draw: 3, start: 20, length: -1, search: '7'});
  });

  it('turns a missing or unusable body into the defaults', () => {
    [undefined, null, 'text', 5, []].forEach((body) => {
      const got = parse(body);
      assert.deepStrictEqual([got.draw, got.start, got.search], [0, 0, ''], JSON.stringify(body));
      assert.ok(Number.isNaN(got.length), JSON.stringify(body));
    });
  });

  // [value, expected] for draw and start.
  const WHOLE = [
    ['5', 5], [5, 5], [5.9, 5], ['5abc', 5], [0, 0], ['0', 0], [-1, 0], ['-3', 0], ['x', 0], ['', 0],
    ['99999999999999999999', 0], [1e20, 0], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    [NaN, 0], [Infinity, 0], [null, 0], [true, 0], [OBJ, 0], [[5], 0], [undefined, 0]
  ];
  ['draw', 'start'].forEach((field) => {
    it(`reads ${field} as a safe integer of at least 0, else 0`, () => {
      WHOLE.forEach(([value, want]) => {
        assert.strictEqual(parse({[field]: value})[field], want, `${field} ${String(typeof value === 'object' ? JSON.stringify(value) : value)}`);
      });
    });
  });

  it('reads length as a safe integer, else NaN, and keeps -1 and 0', () => {
    [['10', 10], [10, 10], [-1, -1], ['-1', -1], [0, 0], [1000, 1000]].forEach(([value, want]) => {
      assert.strictEqual(parse({length: value}).length, want, String(value));
    });
    ['x', '', '99999999999999999999', 1e20, NaN, Infinity, null, true, OBJ, [5], undefined].forEach((value) => {
      assert.ok(Number.isNaN(parse({length: value}).length), typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
  });

  it('reads search only from a string or a finite number, else an empty string', () => {
    [['lab', 'lab'], ['  lab  ', 'lab'], [12, '12'], [0, '0'], ['', '']].forEach(([value, want]) => {
      assert.strictEqual(parse({search: {value}}).search, want, String(value));
    });
    [OBJ, {x: 1}, [1], null, true, NaN, Infinity, undefined].forEach((value) => {
      assert.strictEqual(parse({search: {value}}).search, '', typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
    assert.strictEqual(parse({search: 'lab'}).search, '');
    assert.strictEqual(parse({search: null}).search, '');
    assert.strictEqual(parse({search: OBJ}).search, '');
  });
});
