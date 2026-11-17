const assert = require('assert');
const crypto = require('crypto');
const supertest = require('supertest');
const support = require('../support/pki');
const auditWait = require('../support/audit-wait');
const {waitFor} = auditWait;

// The Audit Log page (issue #200): GET /audit and POST /api/v1/audit/datatable,
// behind the audit.view permission. The seam writes after the response, so a
// test that expects a row polls for it. A test that expects NO row makes its
// request, then a sentinel request that does write a row, waits for the
// sentinel row, and only then asserts the absence (test/integration/audit.test.js).
describe('Audit Log page::', function () {
  this.timeout(120000);

  support.useFixture();
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mocha-alp' + RUN;
  const PASSWORD = 'mocha-alp-pw';
  const URL = '/api/v1/audit/datatable';
  // A time far ahead of every real row, so the rows of a test sort first.
  const FUTURE = 4102444800000;
  let seq = 0;

  async function mkUser(label, {isAdmin = false, permissions = {}} = {}) {
    const name = `${PREFIX}-${label}`;
    const role = await Role.create({name, isAdmin, permissions}).fetch();
    await User.create({username: name, password: PASSWORD, email: `${name}@example.com`, roles: [role.id]});
    return name;
  }

  // Signs in as a browser does: a CSRF token for the login form, then the form POST.
  async function signIn(username) {
    const agent = supertest.agent(app());
    const {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password: PASSWORD, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    return agent;
  }

  // A denied GET on a model that no one can read (test/support/audit-wait.js).
  const sentinel = (agent, start) => auditWait.sentinel((url) => agent.get(url).set(...AJAX), `${PREFIX}-sentinel-${seq++}`, start);

  const table = (agent, body) => agent.post(URL).set(...AJAX).send(body);
  // The rows that a test created: its own createdBy values start with PREFIX.
  const mine = (rows) => rows.filter((r) => r.createdBy.startsWith(PREFIX + '-row'));

  let admin;
  let limited;
  let granted;
  let adminNames;

  async function cleanup() {
    await AuditLog.destroy({createdBy: {startsWith: PREFIX}});
    await User.destroy({username: {startsWith: PREFIX}});
    await Role.destroy({name: {startsWith: PREFIX}});
  }

  before(async () => {
    await cleanup();
    adminNames = await mkUser('admin', {isAdmin: true});
    const limitedName = await mkUser('limited', {permissions: {stock: {host: {read: true}}}});
    const grantedName = await mkUser('granted', {permissions: {stock: {audit: {view: true}}}});
    admin = await signIn(adminNames);
    limited = await signIn(limitedName);
    granted = await signIn(grantedName);
    limited.username = limitedName;
  });
  after(cleanup);

  describe('the page', () => {
    it('answers 200 for an admin, and 403 for a limited user without audit.view', async () => {
      await admin.get('/audit').set(...HTML).expect(200);
      await limited.get('/audit').set(...HTML).expect(403);
    });

    it('answers 200 for a limited role that holds stock.audit.view', async () => {
      await granted.get('/audit').set(...HTML).expect(200);
    });

    it('still refuses the generic routes for the audit trail', async () => {
      await admin.get('/api/v1/auditlog').set(...AJAX).expect(403);
      await admin.get('/api/v1/audit').set(...AJAX).expect(403);
    });
  });

  describe('the rows', () => {
    it('answers 403 without audit.view, and writes a denied row for audit.view', async () => {
      const start = Date.now();
      await table(limited, {draw: 1, start: 0, length: 10}).expect(403);
      const [row] = await waitFor({createdBy: limited.username, permission: 'audit.view'}, start);
      assert.strictEqual(row.outcome, 'denied');
    });

    it('answers a limited role that holds audit.view', async () => {
      const res = await table(granted, {draw: 3, start: 0, length: 5}).expect(200);
      assert.strictEqual(res.body.draw, 3);
    });

    it('returns the shape, newest first, with every row field', async () => {
      const res = await table(admin, {draw: 7, start: 0, length: 25}).expect(200);
      assert.strictEqual(res.body.draw, 7);
      assert.ok(res.body.recordsTotal >= res.body.recordsFiltered);
      assert.ok(res.body.data.length > 0, 'the sign-ins wrote rows');
      assert.deepStrictEqual(Object.keys(res.body.data[0]).sort(), [
        'affectedCount', 'authSource', 'correlationId', 'createdAt', 'createdBy', 'id', 'ip',
        'outcome', 'permission', 'subjectId', 'subjectLabel', 'subjectType', 'text', 'type'
      ]);
      const times = res.body.data.map((r) => r.createdAt);
      assert.deepStrictEqual(times, times.slice().sort((a, b) => b - a));
    });

    it('pages rows that share one createdAt without a skip or a repeat', async () => {
      const made = await AuditLog.createEach([0, 1, 2, 3, 4].map((i) => ({
        createdAt: FUTURE, createdBy: `${PREFIX}-row-tie-${i}`, type: 'test.tie', outcome: 'allowed'
      }))).fetch();
      const want = made.map((r) => r.id).sort().reverse();
      const got = [];
      for (const start of [0, 2, 4]) {
        const res = await table(admin, {draw: 1, start, length: 2}).expect(200);
        res.body.data.forEach((r) => got.push(r.id));
      }
      // The third page holds the last tied row, then the next older row.
      assert.deepStrictEqual(got.slice(0, want.length), want);
      assert.strictEqual(new Set(got).size, got.length, 'a row repeats');
    });

    it('reads at most 500 rows, and recordsTotal counts every row', async () => {
      await AuditLog.createEach(Array.from({length: 501}, (_unused, i) => ({
        createdAt: FUTURE - 1, createdBy: `${PREFIX}-row-bulk-${i}`, type: 'test.bulk', outcome: 'allowed'
      })));
      for (const length of [-1, 1000, undefined, 'x']) {
        const res = await table(admin, {draw: 1, start: 0, length}).expect(200);
        assert.strictEqual(res.body.data.length, 500, `length ${length}`);
        assert.ok(res.body.recordsTotal >= 501, `recordsTotal ${res.body.recordsTotal}`);
      }
      const res = await table(admin, {draw: 1, start: 0, length: 10}).expect(200);
      assert.strictEqual(res.body.data.length, 10);
    });

    it('answers 200 when search is sent as an object', async () => {
      await table(admin, {draw: 1, start: 0, length: 5, search: {value: {x: 1}}}).expect(200);
      await admin.post(URL).set(...AJAX).type('form').send('draw=1&start=0&length=5&search[value][x]=1').expect(200);
    });

    // A JSON body can hold any value: String() or parseInt() on an object with
    // a toString key throws, and a start of 1e20 is not a safe integer.
    it('answers 200 for a JSON body with a toString object and a start of 1e20', async () => {
      await table(admin, {draw: 1, start: 0, length: 5, search: {value: {toString: 1}}}).expect(200);
      await table(admin, {draw: {toString: 1}, start: {toString: 1}, length: {toString: 1}}).expect(200);
      await table(admin, {draw: 1, start: '99999999999999999999', length: 5}).expect(200);
    });

    it('searches case-insensitively, in the query, and counts only the matches', async () => {
      const res = await table(admin, {draw: 1, start: 0, length: 500, search: {value: 'LOGIN'}}).expect(200);
      assert.ok(res.body.recordsFiltered > 0, 'the sign-ins wrote auth.login rows');
      assert.ok(res.body.recordsFiltered < res.body.recordsTotal, 'a filter that keeps every row is no filter');
      assert.ok(res.body.data.some((r) => r.type === 'auth.login'));
      res.body.data.forEach((r) => {
        const fields = [r.createdBy, r.type, r.permission, r.outcome, r.subjectType, r.subjectLabel, r.ip].join('\n');
        assert.ok(/login/i.test(fields), JSON.stringify(r));
      });
      const none = await table(admin, {draw: 1, start: 0, length: 5, search: {value: `${PREFIX}-no-such-text`}}).expect(200);
      assert.strictEqual(none.body.recordsFiltered, 0);
      assert.deepStrictEqual(none.body.data, []);
      // The mixed-case user name of a row is found by its lowercase form.
      await AuditLog.create({createdBy: `${PREFIX}-row-CaSe`, type: 'test.case', outcome: 'allowed'});
      const hit = await table(admin, {draw: 1, start: 0, length: 5, search: {value: `${PREFIX}-ROW-case`.toLowerCase()}}).expect(200);
      assert.strictEqual(hit.body.recordsFiltered, 1);
      assert.strictEqual(mine(hit.body.data).length, 1);
    });

    it('writes no row for an allowed call', async () => {
      const start = Date.now();
      await table(admin, {draw: 1, start: 0, length: 5}).expect(200);
      await sentinel(admin, start);
      const rows = await AuditLog.find({createdBy: adminNames, createdAt: {'>=': start}});
      assert.deepStrictEqual(rows.filter((r) => r.permission === 'audit.view' || r.subjectLabel.includes('audit/datatable')), []);
      assert.deepStrictEqual(rows.filter((r) => /audit\/datatable/.test(r.text)), []);
    });
  });
});
