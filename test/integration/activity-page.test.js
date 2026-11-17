const assert = require('assert');
const crypto = require('crypto');
const supertest = require('supertest');
const support = require('../support/pki');
const auditWait = require('../support/audit-wait');
const {waitFor} = auditWait;

// The Activity page (issue #206): GET /activity and POST /api/v1/activity/datatable,
// behind the activity.view permission. It is a view over the audit trail: a
// successful write that named its record, and the renderable events. The seam
// writes after the response, so a test that expects a row polls for it. A test
// that expects NO row makes its request, then a sentinel request that does write
// a row, waits for the sentinel row, and only then asserts the absence
// (test/integration/audit.test.js).
describe('Activity page::', function () {
  this.timeout(120000);

  support.useFixture();
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mocha-act' + RUN;
  const PASSWORD = 'mocha-act-pw';
  const URL = '/api/v1/activity/datatable';
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
  let adminName;

  async function cleanup() {
    await AuditLog.destroy({createdBy: {startsWith: PREFIX}});
    await User.destroy({username: {startsWith: PREFIX}});
    await Role.destroy({name: {startsWith: PREFIX}});
  }

  before(async () => {
    await cleanup();
    adminName = await mkUser('admin', {isAdmin: true});
    const limitedName = await mkUser('limited', {permissions: {stock: {host: {read: true}}}});
    const grantedName = await mkUser('granted', {permissions: {stock: {activity: {view: true}}}});
    admin = await signIn(adminName);
    limited = await signIn(limitedName);
    granted = await signIn(grantedName);
    limited.username = limitedName;
  });
  after(cleanup);

  describe('the page', () => {
    it('answers 200 with the four headings for an admin', async () => {
      const res = await admin.get('/activity').set(...HTML).expect(200);
      // The <th> elements of the table head, in order.
      const heads = [...res.text.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]*>/g, '').trim());
      assert.deepStrictEqual(heads, ['Who', 'When', 'What', 'From']);
    });

    it('answers 403 for a limited user, and writes a denied row for activity.view', async () => {
      const start = Date.now();
      await limited.get('/activity').set(...HTML).expect(403);
      const [row] = await waitFor({createdBy: limited.username, permission: 'activity.view'}, start);
      assert.strictEqual(row.outcome, 'denied');
    });

    it('answers 200 for a limited role that holds stock.activity.view', async () => {
      await granted.get('/activity').set(...HTML).expect(200);
    });

    // A regression guard: it passes before and after the change.
    it('still refuses the generic route, and writes one denied row', async () => {
      const start = Date.now();
      await admin.get('/api/v1/activity').set(...AJAX).expect(403);
      await waitFor({createdBy: adminName, permission: 'activity.read'}, start);
      // A sentinel row proves that a late duplicate would be stored by now.
      await sentinel(admin, start);
      const rows = await AuditLog.find({createdBy: adminName, permission: 'activity.read', createdAt: {'>=': start}});
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].outcome, 'denied');
    });
  });

  describe('the rows', () => {
    it('answers 403 without activity.view, and writes a denied row for activity.view', async () => {
      const start = Date.now();
      await table(limited, {draw: 1, start: 0, length: 10}).expect(403);
      const [row] = await waitFor({createdBy: limited.username, permission: 'activity.view'}, start);
      assert.strictEqual(row.outcome, 'denied');
    });

    it('answers a limited role that holds activity.view', async () => {
      const res = await table(granted, {draw: 3, start: 0, length: 5}).expect(200);
      assert.strictEqual(res.body.draw, 3);
    });

    it('returns the shape, newest first, with the row fields', async () => {
      await AuditLog.create({
        createdAt: FUTURE, createdBy: `${PREFIX}-row-shape`, type: 'access.api', outcome: 'allowed',
        subjectType: 'host', subjectLabel: 'PC-01', text: 'PUT /api/v1/host/abc'
      });
      const res = await table(admin, {draw: 7, start: 0, length: 25}).expect(200);
      assert.strictEqual(res.body.draw, 7);
      assert.ok(res.body.recordsTotal >= res.body.recordsFiltered);
      assert.deepStrictEqual(Object.keys(res.body.data[0]).sort(), ['createdAt', 'createdBy', 'id', 'ip', 'summary', 'text']);
      const times = res.body.data.map((r) => r.createdAt);
      assert.deepStrictEqual(times, times.slice().sort((a, b) => b - a));
      assert.strictEqual(res.body.data[0].summary, 'Updated host "PC-01"');
    });

    it('returns a host update and a renderable agent row, and no other row', async () => {
      // Every row carries the marker -row-rr-, so the search finds only these rows.
      const marker = `${PREFIX}-row-rr-`;
      await AuditLog.createEach([
        {createdAt: FUTURE, createdBy: `${marker}ok`, type: 'access.api', outcome: 'allowed', subjectType: 'host', subjectLabel: 'ok-h', text: 'PUT /api/v1/host/1'},
        {createdAt: FUTURE, createdBy: `${marker}agent`, type: 'agent.token', outcome: 'allowed', renderable: true, subjectType: 'agentenrolltoken', subjectLabel: 'lab', text: 'minted'},
        {createdAt: FUTURE, createdBy: `${marker}denied`, type: 'access.api', outcome: 'denied', subjectType: 'host', text: 'PUT /api/v1/host/1'},
        {createdAt: FUTURE, createdBy: `${marker}failed`, type: 'access.api', outcome: 'failed', subjectType: 'host', text: 'PUT /api/v1/host/1'},
        {createdAt: FUTURE, createdBy: `${marker}login`, type: 'auth.login', outcome: 'allowed', text: 'signed in'},
        {createdAt: FUTURE, createdBy: `${marker}nosubject`, type: 'access.api', outcome: 'allowed', subjectType: '', text: 'POST /api/v1/x'}
      ]);
      const res = await table(admin, {draw: 1, start: 0, length: 500, search: {value: marker}}).expect(200);
      assert.deepStrictEqual(res.body.data.map((r) => r.createdBy.slice(marker.length)).sort(), ['agent', 'ok']);
      assert.strictEqual(res.body.recordsFiltered, 2);
    });

    it('counts recordsTotal over the rows that match the rule, not the whole trail', async () => {
      const res = await table(admin, {draw: 1, start: 0, length: 5}).expect(200);
      const all = await AuditLog.count();
      const rule = await AuditLog.count({
        outcome: 'allowed',
        or: [{renderable: true}, {type: {in: ['access.api', 'access.page']}, subjectType: {'!=': ''}}]
      });
      assert.strictEqual(res.body.recordsTotal, rule);
      assert.ok(rule < all, 'the sign-ins are not Activity');
    });

    it('reads at most 500 rows', async () => {
      await AuditLog.createEach(Array.from({length: 501}, (_unused, i) => ({
        createdAt: FUTURE - 1, createdBy: `${PREFIX}-row-bulk-${i}`, type: 'access.api', outcome: 'allowed', subjectType: 'host', text: 'PUT /api/v1/host/1'
      })));
      for (const length of [-1, 0, 9999, undefined, 'x']) {
        const res = await table(admin, {draw: 1, start: 0, length}).expect(200);
        assert.strictEqual(res.body.data.length, 500, `length ${length}`);
      }
      const res = await table(admin, {draw: 1, start: 0, length: 10}).expect(200);
      assert.strictEqual(res.body.data.length, 10);
    });

    it('answers 200 when search is sent as an object', async () => {
      await table(admin, {draw: 1, start: 0, length: 5, search: {value: {x: 1}}}).expect(200);
    });

    it('searches case-insensitively, and counts only the matches', async () => {
      await AuditLog.create({createdBy: `${PREFIX}-row-CaSe`, type: 'access.api', outcome: 'allowed', subjectType: 'host', text: 'PUT /api/v1/host/1'});
      const hit = await table(admin, {draw: 1, start: 0, length: 5, search: {value: `${PREFIX}-ROW-case`.toLowerCase()}}).expect(200);
      assert.strictEqual(hit.body.recordsFiltered, 1);
      assert.strictEqual(mine(hit.body.data).length, 1);
    });

    it('writes no row for an allowed call', async () => {
      const start = Date.now();
      await table(admin, {draw: 1, start: 0, length: 5}).expect(200);
      await sentinel(admin, start);
      const rows = await AuditLog.find({createdBy: adminName, createdAt: {'>=': start}});
      assert.deepStrictEqual(rows.filter((r) => r.permission === 'activity.view' || /activity\/datatable/.test(r.text)), []);
    });
  });
});
