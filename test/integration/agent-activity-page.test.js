const assert = require('assert');
const crypto = require('crypto');
const supertest = require('supertest');
const support = require('../support/pki');
const auditWait = require('../support/audit-wait');
const {waitFor} = auditWait;

// The Agent Activity page (issue #207): GET /agent-activity,
// POST /api/v1/agent-activity/summary and POST /api/v1/agent-activity/host,
// behind the agentactivity.view permission. It is a view over the agent rows of
// the audit trail, grouped by host. The seam writes after the response, so a
// test that expects a row polls for it. A test that expects NO row makes its
// request, then a sentinel request that does write a row, waits for the
// sentinel row, and only then asserts the absence (test/integration/audit.test.js).
describe('Agent Activity page::', function () {
  this.timeout(120000);

  support.useFixture();
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mocha-aa' + RUN;
  const PASSWORD = 'mocha-aa-pw';
  const SUMMARY = '/api/v1/agent-activity/summary';
  const HOST = '/api/v1/agent-activity/host';
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

  const post = (agent, url, body) => agent.post(url).set(...AJAX).send(body);

  // One agent row for a host, written the way the agent code writes it.
  const agentRow = (hostId, label, text, extra = {}) => sails.helpers.audit.record.with({req: null, row: {
    type: 'agent.enroll', subjectType: 'host', subjectId: hostId, subjectLabel: label,
    renderable: true, outcome: 'allowed', text, createdBy: `${PREFIX}-row`, ...extra
  }});

  const mkHost = async (name) => (await Host.create({name: `${PREFIX}-${name}`, macs: []}).fetch()).id;

  let admin;
  let limited;
  let auditOnly;
  let granted;

  async function cleanup() {
    await AuditLog.destroy({createdBy: {startsWith: PREFIX}});
    await Host.destroy({name: {startsWith: PREFIX}});
    await User.destroy({username: {startsWith: PREFIX}});
    await Role.destroy({name: {startsWith: PREFIX}});
  }

  before(async () => {
    await cleanup();
    const adminName = await mkUser('admin', {isAdmin: true});
    const limitedName = await mkUser('limited', {permissions: {stock: {host: {read: true}}}});
    const auditName = await mkUser('auditonly', {permissions: {stock: {audit: {view: true}}}});
    const grantedName = await mkUser('granted', {permissions: {stock: {agentactivity: {view: true}}}});
    admin = await signIn(adminName);
    limited = await signIn(limitedName);
    auditOnly = await signIn(auditName);
    granted = await signIn(grantedName);
    admin.username = adminName;
    limited.username = limitedName;
  });
  after(cleanup);

  describe('the page', () => {
    it('answers 200 with the six headings for an admin', async () => {
      const res = await admin.get('/agent-activity').set(...HTML).expect(200);
      const heads = [...res.text.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]*>/g, '').trim());
      assert.deepStrictEqual(heads, ['When', 'Event', 'Detail', 'Outcome', 'Host', 'Order']);
    });

    it('answers 403 for a limited user, and writes a denied row for agentactivity.view', async () => {
      const start = Date.now();
      await limited.get('/agent-activity').set(...HTML).expect(403);
      const [row] = await waitFor({createdBy: limited.username, permission: 'agentactivity.view'}, start);
      assert.strictEqual(row.outcome, 'denied');
    });

    it('answers 403 for a role that holds only audit.view', async () => {
      await auditOnly.get('/agent-activity').set(...HTML).expect(403);
    });

    it('answers 200 for a limited role that holds stock.agentactivity.view', async () => {
      await granted.get('/agent-activity').set(...HTML).expect(200);
    });

    // A regression guard: it passes before and after the change.
    it('does not open a generic route on the key', async () => {
      await admin.get('/api/v1/agentactivity').set(...AJAX).expect(403);
    });
  });

  describe('the gate on both endpoints', () => {
    for (const url of [SUMMARY, HOST]) {
      it(`answers 403 on ${url} without agentactivity.view, and for audit.view only`, async () => {
        const start = Date.now();
        await post(limited, url, {hostId: 'x'}).expect(403);
        const [row] = await waitFor({createdBy: limited.username, permission: 'agentactivity.view'}, start);
        assert.strictEqual(row.outcome, 'denied');
        await post(auditOnly, url, {hostId: 'x'}).expect(403);
      });

      it(`answers 200 on ${url} for a role that holds agentactivity.view`, async () => {
        await post(granted, url, {hostId: 'x'}).expect(200);
      });
    }
  });

  describe('the summary', () => {
    let hostA;
    let hostB;
    let hostGone;
    const goneId = crypto.randomBytes(12).toString('hex');

    before(async () => {
      hostA = await mkHost('A');
      hostB = await mkHost('B');
      // B is written first, so A is the host with the newest row.
      await agentRow(hostB, 'old-name-B', 'b-1');
      await agentRow(hostA, 'old-name-A', 'a-1');
      await agentRow(hostA, 'old-name-A', 'a-2');
      await agentRow(goneId, 'Gone-PC', 'g-1');
      await agentRow(hostA, 'old-name-A', 'a-3');
      hostGone = goneId;
      // None of these may count: a token row, a non-agent row, a hostless agent row, a near-miss type.
      await agentRow(hostA, '', 'token', {type: 'agent.token', subjectType: 'agentenrolltoken'});
      await agentRow(hostA, '', 'access', {type: 'access.api'});
      await agentRow('', 'nohost', 'hostless');
      await agentRow(hostA, '', 'near-miss', {type: 'agentx.enroll'});
    });

    it('has one entry per host, the newest host first, with a correct count', async () => {
      const {body} = await post(admin, SUMMARY, {}).expect(200);
      const mine = body.hosts.filter((h) => [hostA, hostB, hostGone].includes(h.hostId));
      assert.deepStrictEqual(mine.map((h) => h.hostId), [hostA, hostGone, hostB]);
      assert.deepStrictEqual(mine.map((h) => h.count), [3, 1, 1]);
      assert.deepStrictEqual(Object.keys(body.hosts[0]).sort(), ['count', 'hostId', 'hostName', 'latest']);
      assert.deepStrictEqual(Object.keys(mine[0].latest).sort(), ['createdAt', 'id', 'outcome', 'text', 'type']);
      assert.strictEqual(typeof mine[0].latest.id, 'string');
      assert.strictEqual(mine[0].latest.text, 'a-3');
      assert.strictEqual(mine[0].latest.type, 'agent.enroll');
      assert.strictEqual(mine[0].latest.outcome, 'allowed');
    });

    it('names a host by its current name, and leaves out the rows that are not agent rows with a host', async () => {
      const {body} = await post(admin, SUMMARY, {}).expect(200);
      const a = body.hosts.find((h) => h.hostId === hostA);
      assert.strictEqual(a.hostName, `${PREFIX}-A`);
      assert.strictEqual(body.hosts.find((h) => h.hostId === ''), undefined);
    });

    it('shows a deleted host as its stored label followed by (deleted)', async () => {
      const {body} = await post(admin, SUMMARY, {}).expect(200);
      assert.strictEqual(body.hosts.find((h) => h.hostId === hostGone).hostName, 'Gone-PC (deleted)');
    });

    it('writes no row for an allowed call to either endpoint', async () => {
      const start = Date.now();
      await post(admin, SUMMARY, {}).expect(200);
      await post(admin, HOST, {hostId: hostA}).expect(200);
      await sentinel(admin, start);
      const rows = await AuditLog.find({createdBy: admin.username, createdAt: {'>=': start}});
      assert.deepStrictEqual(rows.filter((r) => r.permission === 'agentactivity.view' || /agent-activity/.test(r.text)), []);
    });

    describe('the host rows', () => {
      it('returns the host rows, newest first, with a total', async () => {
        const {body} = await post(admin, HOST, {hostId: hostA}).expect(200);
        assert.deepStrictEqual(body.rows.map((r) => r.text), ['a-3', 'a-2', 'a-1']);
        assert.strictEqual(body.total, 3);
        assert.strictEqual(body.limit, 500);
        assert.deepStrictEqual(Object.keys(body.rows[0]).sort(), ['createdAt', 'id', 'outcome', 'text', 'type']);
        assert.strictEqual(typeof body.rows[0].id, 'string');
      });

      it('returns no row for a host with none', async () => {
        const {body} = await post(admin, HOST, {hostId: crypto.randomBytes(12).toString('hex')}).expect(200);
        assert.deepStrictEqual(body, {rows: [], total: 0, limit: 500});
      });

      it('answers 400, and does not crash, for a missing or non-string hostId', async () => {
        await post(admin, HOST, {}).expect(400);
        await post(admin, HOST, {hostId: {}}).expect(400);
        await post(admin, HOST, {hostId: {$ne: ''}}).expect(400);
        await post(admin, HOST, {hostId: 5}).expect(400);
        // An empty id would match every hostless agent row (seeded in before()).
        await post(admin, HOST, {hostId: ''}).expect(400);
        // The server still answers.
        await post(admin, HOST, {hostId: hostA}).expect(200);
      });

      it('returns at most 500 rows and counts all of them in total', async () => {
        const hostBig = await mkHost('Big');
        for (let i = 0; i < 501; i++) { await agentRow(hostBig, '', `big-${i}`); }
        const {body} = await post(admin, HOST, {hostId: hostBig}).expect(200);
        assert.strictEqual(body.rows.length, 500);
        assert.strictEqual(body.total, 501);
        assert.strictEqual(body.rows[0].text, 'big-500');
        const sum = await post(admin, SUMMARY, {}).expect(200);
        assert.strictEqual(sum.body.hosts.find((h) => h.hostId === hostBig).count, 501);
      });
    });
  });
});
