/**
 * The DataTables server-side request fields that a datatable action reads, made
 * safe for a JSON body. A JSON body can hold any value, so String() or
 * parseInt() on a field can throw (an object with a `toString` key), and a
 * start that is not a safe integer makes Waterline refuse the skip.
 *
 * Input: body, the request body (may be undefined).
 * Output: {draw, start, length, search}
 *   draw, start  a whole number of at least 0 from a string or a number, and
 *                a safe integer. Anything else is 0.
 *   length       the whole number, or NaN when the field is not a string or a
 *                number, or is not a safe integer. Each caller keeps its own
 *                rule for -1, 0 and NaN.
 *   search       body.search.value as trimmed text, when it is a string or a
 *                finite number. Anything else is ''.
 *
 * Usage: const {draw, start, length, search} = sails.helpers.datatables.parseRequest.with({body: req.body});
 * It returns the object itself, with no .now(): see api/helpers/permissions/resolve.js.
 */
// A whole number from a string or a number, or NaN.
function whole(value) {
  let n = NaN;
  if (typeof value === 'number') { n = Math.trunc(value); }
  if (typeof value === 'string') { n = parseInt(value, 10); }
  return Number.isSafeInteger(n) ? n : NaN;
}

module.exports = {
  friendlyName: 'Parse a DataTables request',
  description: 'The draw, start, length and search of a server-side request body, safe for any JSON value.',
  sync: true,
  inputs: {
    body: {type: 'ref', description: 'The request body.'}
  },
  exits: {
    success: {outputType: 'ref', description: '{draw, start, length, search}'}
  },
  // A sync machine must answer through exits.success.
  fn: function ({body}, exits) {
    // An array body has its own `length`, so it counts as no body.
    const source = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const nonNegative = (value) => {
      const n = whole(value);
      return n >= 0 ? n : 0;
    };
    const found = _.get(source, 'search.value');
    const usable = typeof found === 'string' || (typeof found === 'number' && Number.isFinite(found));
    return exits.success({
      draw: nonNegative(source.draw),
      start: nonNegative(source.start),
      length: whole(source.length),
      search: usable ? String(found).trim() : ''
    });
  }
};
