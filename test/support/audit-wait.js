const assert = require('assert');

// Helpers for a test that expects an audit row. The request seam
// (api/hooks/audit) writes after the response finishes, so a test polls for the
// row. A test that expects NO row makes its request, then a sentinel request
// that does write a row, waits for the sentinel row, and only then asserts the
// absence (test/integration/audit.test.js).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll every 25 ms, up to 2 s, for at least `count` rows at or after `start`.
async function waitFor(where, start, count = 1) {
  const deadline = Date.now() + 2000;
  for (;;) {
    const found = await AuditLog.find(Object.assign({}, where, {createdAt: {'>=': start}})).sort('createdAt ASC');
    if (found.length >= count) { return found; }
    if (Date.now() > deadline) { assert.fail(`no audit row for ${JSON.stringify(where)} within 2 s`); }
    await sleep(25);
  }
}

// A denied GET on a model that no one can read: a row for sure. `get(url)` is
// the test's own GET for the actor (with its credential and headers); `model`
// is a name that no test shares. Returns the row once it is stored. It proves
// the earlier writes landed.
async function sentinel(get, model, start) {
  await get(`/api/v1/${model}`).expect(403);
  const [row] = await waitFor({permission: `${model}.read`}, start);
  return row;
}

module.exports = {waitFor, sentinel};
