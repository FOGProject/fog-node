const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const supertest = require('supertest');
const agentCsr = require('../support/agent-csr');
const support = require('../support/pki');

// The fog-agent admin JSON routes (contract 6.2): the pending enrollments, the
// approve and deny decision, and the enrollment tokens. They follow fog-node's
// conventions (camelCase, ms timestamps, errors as {error}), and each action
// checks its host permission: read, update, create, destroy.
describe('Agent admin::', function () {
  this.timeout(120000);

  support.useFixture();
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mca' + RUN;
  let seq = 0;
  const uniq = () => PREFIX + (seq++);
  const mac = () => '02:' + crypto.randomBytes(5).toString('hex').match(/../g).join(':');
  const bare = (m) => m.replace(/[:-]/g, '');

  const Enrollment = () => sails.models.agentenrollment;
  const Token = () => sails.models.agentenrolltoken;
  const fingerprints = [];

  async function newCsr() {
    const c = await agentCsr.newCsr();
    fingerprints.push(c.fingerprint);
    return c;
  }
  const body = (c, macs, extra = {}) => Object.assign({
    protocol: 1,
    agent_version: '1.0.0',
    os: 'linux',
    arch: 'amd64',
    // A prefixed name, so the audit rows of the test are removable
    // (test/lifecycle.test.js).
    hostname: uniq(),
    identity: {system_uuid: '', system_serial: '', board_serial: '', chassis_asset: '', macs},
    csr_pem: c.pem
  }, extra);
  const enroll = (b) => supertest(app()).post('/agent/v1/enroll').send(b);
  const rowOf = (c) => Enrollment().findOne({fingerprint: c.fingerprint});

  // Signs in as a browser does (see group-membership.test.js).
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let res = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: res.body._csrf})
      .expect(302).expect('Location', '/');
    res = await agent.get('/csrfToken').expect(200);
    return {agent, csrf: res.body._csrf};
  }
  // A non-admin user whose role holds the given stock.host permissions.
  async function limited(label, host) {
    const name = `${PREFIX}-${label}`;
    const role = await sails.models.role.create({name, isAdmin: false, permissions: {stock: {host}}}).fetch();
    await sails.models.user.create({username: name, password: 'mocha-agent-pw', email: `${name}@example.com`, roles: [role.id]});
    return signIn(name, 'mocha-agent-pw');
  }

  async function cleanup() {
    const rows = await Enrollment().find({fingerprint: fingerprints});
    await sails.models.host.destroy({id: rows.map((r) => r.host).filter(Boolean)});
    await sails.models.host.destroy({name: {startsWith: PREFIX}});
    await Enrollment().destroy({fingerprint: fingerprints});
    await Token().destroy({name: {startsWith: PREFIX}});
    await sails.models.user.destroy({username: {startsWith: PREFIX}});
    await sails.models.role.destroy({name: {startsWith: PREFIX}});
  }

  let admin;
  before(async () => {
    await cleanup();
    admin = await signIn('mochatestadmin', 'mochatestadmin');
  });
  after(cleanup);

  // A known host that has no agent, and a pending request for it.
  async function pendingFor(extra = {}) {
    const m = mac();
    const host = await sails.models.host.create({name: uniq(), macs: [bare(m)], pending: false}).fetch();
    const c = await newCsr();
    await enroll(body(c, [m], extra)).expect(202);
    return {host, c, m, row: await rowOf(c)};
  }

  describe('GET /api/v1/agent/enrollments', () => {
    it('lists the pending rows oldest first, with the admin fields and never the csr or cert', async () => {
      const first = await pendingFor({hostname: 'one'});
      const second = await pendingFor({hostname: 'two'});
      const done = await pendingFor();
      await Enrollment().updateOne({id: done.row.id}).set({state: 'denied'});

      const res = await admin.agent.get('/api/v1/agent/enrollments').set(...AJAX).expect(200);
      assert.deepStrictEqual(Object.keys(res.body), ['data']);
      const ids = res.body.data.map((r) => r.id);
      assert.ok(ids.indexOf(first.row.id) >= 0 && ids.indexOf(first.row.id) < ids.indexOf(second.row.id), 'oldest first');
      assert.ok(!ids.includes(done.row.id), 'a denied row is not pending');
      const entry = res.body.data.find((r) => r.id === first.row.id);
      assert.deepStrictEqual(Object.keys(entry).sort(), [
        'agentVersion', 'arch', 'createdAt', 'fingerprint', 'hostID', 'hostname', 'id', 'identity', 'os', 'reason', 'remoteIp', 'updatedAt'
      ]);
      assert.strictEqual(entry.hostID, first.host.id);
      assert.strictEqual(entry.hostname, 'one');
      assert.strictEqual(entry.reason, 'known-host-no-agent');
      assert.strictEqual(entry.fingerprint, first.c.fingerprint);
      assert.deepStrictEqual(entry.identity.macs, [first.m]);
      assert.strictEqual(typeof entry.createdAt, 'number');
      assert.strictEqual(typeof entry.updatedAt, 'number');
      assert.ok(!JSON.stringify(res.body).includes('BEGIN CERTIFICATE REQUEST'));
    });

    it('answers 403 without host.read', async () => {
      const none = await limited('enr-none', {update: true, create: true, destroy: true});
      await none.agent.get('/api/v1/agent/enrollments').set(...AJAX).expect(403);
    });

    it('answers 403 to a request with no session', async () => {
      await supertest(app()).get('/api/v1/agent/enrollments').set('Accept', 'application/json').expect(403);
    });
  });

  describe('POST /api/v1/agent/enrollment/:id/:action', () => {
    const decide = (who, id, action, headers = [AJAX]) => {
      let req = who.agent.post(`/api/v1/agent/enrollment/${id}/${action}`);
      for (const h of headers) { req = req.set(...h); }
      return req;
    };

    it('approve: issues, stores the certificate for the agent, and the agent collects it once', async () => {
      const {host, c, m, row} = await pendingFor();
      const res = await decide(admin, row.id, 'approve').expect(200);
      assert.deepStrictEqual(res.body, {id: row.id, hostID: host.id, state: 'issued'});

      const issued = await rowOf(c);
      assert.deepStrictEqual([issued.state, issued.decidedVia, issued.decidedBy], ['issued', 'admin', 'mochatestadmin']);
      assert.ok(issued.cert.startsWith('-----BEGIN CERTIFICATE-----'));
      assert.ok(issued.decidedAt > 0);
      const bound = await sails.models.host.findOne({id: host.id});
      assert.strictEqual(bound.agentFingerprint, c.fingerprint);
      assert.strictEqual(bound.pending, false);
      assert.ok(bound.agentId > 0);

      // It is not pending any more.
      const list = await admin.agent.get('/api/v1/agent/enrollments').set(...AJAX).expect(200);
      assert.ok(!list.body.data.some((r) => r.id === row.id));

      // The agent's next request: 200, once, with the leaf for this host and key.
      const got = await enroll(body(c, [m])).expect(200);
      assert.strictEqual(got.body.host_id, bound.agentId);
      assert.ok(Number.isInteger(got.body.host_id));
      const leaf = new crypto.X509Certificate(got.body.certificate_pem);
      assert.ok(leaf.subject.split('\n').includes(`CN=fog-agent host ${bound.agentId}`));
      assert.strictEqual(sails.helpers.agent.keyFingerprint(got.body.certificate_pem), c.fingerprint);
      assert.strictEqual((await rowOf(c)).cert, '');
      const reissue = await enroll(body(c, [m])).expect(202);
      assert.strictEqual(reissue.body.reason, 'reissue');
    });

    it('approve: also approves the pending host that an unknown machine created', async () => {
      const c = await newCsr();
      const name = uniq();
      await enroll(body(c, [mac()], {hostname: name})).expect(202);
      const row = await rowOf(c);
      assert.strictEqual((await sails.models.host.findOne({id: row.host})).pending, true);
      await decide(admin, row.id, 'approve').expect(200);
      assert.strictEqual((await sails.models.host.findOne({id: row.host})).pending, false);
    });

    it('deny: the row is final, the agent gets 403, and a later approve is 409', async () => {
      const {c, m, row} = await pendingFor();
      const res = await decide(admin, row.id, 'deny').expect(200);
      assert.deepStrictEqual(res.body, {id: row.id, hostID: row.host, state: 'denied'});
      const denied = await rowOf(c);
      assert.deepStrictEqual([denied.state, denied.cert, denied.decidedVia, denied.decidedBy], ['denied', '', 'admin', 'mochatestadmin']);
      assert.ok(await sails.models.host.findOne({id: row.host}), 'the host stays');

      const agent = await enroll(body(c, [m])).expect(403);
      assert.deepStrictEqual(agent.body, {status: 'denied', reason: 'admin'});
      const again = await decide(admin, row.id, 'approve').expect(409);
      assert.deepStrictEqual(again.body, {error: 'enrollment is not pending'});
      await decide(admin, row.id, 'deny').expect(409);
    });

    it('answers 409 for an issued row', async () => {
      const {row} = await pendingFor();
      await decide(admin, row.id, 'approve').expect(200);
      const res = await decide(admin, row.id, 'approve').expect(409);
      assert.deepStrictEqual(res.body, {error: 'enrollment is not pending'});
    });

    it('answers 409 for a row with no host (no-mac), and leaves it pending', async () => {
      const c = await newCsr();
      await enroll(body(c, [])).expect(202);
      const row = await rowOf(c);
      assert.strictEqual(row.reason, 'no-mac');
      const res = await decide(admin, row.id, 'approve').expect(409);
      assert.deepStrictEqual(res.body, {error: 'enrollment is not bound to a host'});
      assert.strictEqual((await rowOf(c)).state, 'pending');
      // Deny still works for it.
      await decide(admin, row.id, 'deny').expect(200);
    });

    it('answers 404 for an unknown action and for no such enrollment', async () => {
      const {row} = await pendingFor();
      assert.deepStrictEqual((await decide(admin, row.id, 'revoke').expect(404)).body, {error: 'unknown action'});
      assert.strictEqual((await rowOf({fingerprint: row.fingerprint})).state, 'pending');
      for (const id of ['5f0000000000000000000000', 'nonsense']) {
        assert.deepStrictEqual((await decide(admin, id, 'approve').expect(404)).body, {error: 'no such enrollment'}, id);
      }
    });

    it('answers 503 signing when the PKI is missing, and leaves the row pending', async () => {
      const {c, row} = await pendingFor();
      const saved = sails.config.custom.pkiDir;
      sails.config.custom.pkiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-pki-empty-'));
      try {
        const res = await decide(admin, row.id, 'approve').expect(503);
        assert.deepStrictEqual(res.body, {error: 'signing'});
      } finally {
        fs.rmSync(sails.config.custom.pkiDir, {recursive: true, force: true});
        sails.config.custom.pkiDir = saved;
      }
      assert.strictEqual((await rowOf(c)).state, 'pending');
      await decide(admin, row.id, 'approve').expect(200);
    });

    it('answers 403 without host.update', async () => {
      const {row} = await pendingFor();
      const readOnly = await limited('dec-ro', {read: true, create: true, destroy: true});
      await decide(readOnly, row.id, 'approve').expect(403);
      await decide(readOnly, row.id, 'deny').expect(403);
      assert.strictEqual((await Enrollment().findOne({id: row.id})).state, 'pending');
    });

    it('answers 403 to a cookie mutation without the CSRF header', async () => {
      const {row} = await pendingFor();
      await decide(admin, row.id, 'approve', []).expect(403);
      assert.strictEqual((await Enrollment().findOne({id: row.id})).state, 'pending');
    });
  });

  describe('tokens', () => {
    const mint = (who, fields, headers = [AJAX]) => {
      let req = who.agent.post('/api/v1/agent/token');
      for (const h of headers) { req = req.set(...h); }
      return req.send(fields);
    };
    const future = () => Date.now() + 3600000;

    it('mints a token: 48 hex characters, shown once, stored only as its sha256', async () => {
      const expires = future();
      const res = await mint(admin, {name: ` ${uniq()} `, uses: 3, expires}).expect(200);
      assert.deepStrictEqual(Object.keys(res.body).sort(), ['expires', 'id', 'name', 'token']);
      assert.match(res.body.token, /^[0-9a-f]{48}$/);
      assert.ok(res.body.name.startsWith(PREFIX) && res.body.name === res.body.name.trim());
      assert.strictEqual(res.body.expires, expires);
      const row = await Token().findOne({id: res.body.id});
      assert.strictEqual(row.hash, crypto.createHash('sha256').update(res.body.token).digest('hex'));
      assert.deepStrictEqual([row.uses, row.expires, row.createdBy], [3, expires, 'mochatestadmin']);
      assert.ok(!JSON.stringify(row).includes(res.body.token));
    });

    it('defaults uses to 1, accepts -1 and an ISO date', async () => {
      const dflt = await mint(admin, {name: uniq(), expires: future()}).expect(200);
      assert.strictEqual((await Token().findOne({id: dflt.body.id})).uses, 1);
      const unlimited = await mint(admin, {name: uniq(), uses: -1, expires: new Date(future()).toISOString()}).expect(200);
      const row = await Token().findOne({id: unlimited.body.id});
      assert.strictEqual(row.uses, -1);
      assert.strictEqual(unlimited.body.expires, row.expires);
      assert.ok(row.expires > Date.now());
    });

    it('answers 400 {error} for a bad name, uses or expires, and stores nothing', async () => {
      const before = await Token().count();
      const cases = [
        [{expires: future()}, /name/],
        [{name: '  ', expires: future()}, /name/],
        [{name: 'x'.repeat(192), expires: future()}, /name/],
        [{name: uniq(), uses: 0, expires: future()}, /uses/],
        [{name: uniq(), uses: -2, expires: future()}, /uses/],
        [{name: uniq(), uses: 1.5, expires: future()}, /uses/],
        [{name: uniq(), uses: 'many', expires: future()}, /uses/],
        [{name: uniq()}, /expires/],
        [{name: uniq(), expires: Date.now() - 1000}, /expires/],
        [{name: uniq(), expires: 'next week'}, /expires/],
        [{name: uniq(), expires: null}, /expires/]
      ];
      for (const [fields, pattern] of cases) {
        const res = await mint(admin, fields).expect(400);
        assert.deepStrictEqual(Object.keys(res.body), ['error']);
        assert.match(res.body.error, pattern, JSON.stringify(fields));
      }
      assert.strictEqual(await Token().count(), before);
    });

    it('lists tokens with state spent, expired or active, and never the hash', async () => {
      const active = (await mint(admin, {name: uniq(), expires: future()}).expect(200)).body;
      const spent = await Token().create({name: uniq(), hash: crypto.randomBytes(32).toString('hex'), uses: 0, expires: future(), createdBy: 'x'}).fetch();
      const expired = await Token().create({name: uniq(), hash: crypto.randomBytes(32).toString('hex'), uses: 4, expires: Date.now() - 1000, createdBy: 'x'}).fetch();
      const res = await admin.agent.get('/api/v1/agent/tokens').set(...AJAX).expect(200);
      assert.deepStrictEqual(Object.keys(res.body), ['data']);
      const byId = (id) => res.body.data.find((t) => t.id === id);
      assert.strictEqual(byId(active.id).state, 'active');
      assert.strictEqual(byId(spent.id).state, 'spent');
      assert.strictEqual(byId(expired.id).state, 'expired');
      assert.deepStrictEqual(Object.keys(byId(active.id)).sort(), ['createdAt', 'createdBy', 'expires', 'id', 'name', 'state', 'uses']);
      assert.ok(!JSON.stringify(res.body).includes('"hash"'));
      assert.ok(!JSON.stringify(res.body).includes(active.token));
    });

    it('a minted token enrolls an agent at once', async () => {
      const minted = (await mint(admin, {name: uniq(), expires: future()}).expect(200)).body;
      const c = await newCsr();
      await enroll(body(c, [mac()], {token: minted.token})).expect(200);
      const list = await admin.agent.get('/api/v1/agent/tokens').set(...AJAX).expect(200);
      assert.strictEqual(list.body.data.find((t) => t.id === minted.id).state, 'spent');
    });

    it('revokes a token: the row goes, and the token no longer works', async () => {
      const minted = (await mint(admin, {name: uniq(), expires: future()}).expect(200)).body;
      const res = await admin.agent.delete(`/api/v1/agent/token/${minted.id}`).set(...AJAX).expect(200);
      assert.deepStrictEqual(res.body, {id: minted.id});
      assert.strictEqual(await Token().findOne({id: minted.id}), undefined);
      const gone = await admin.agent.delete(`/api/v1/agent/token/${minted.id}`).set(...AJAX).expect(404);
      assert.deepStrictEqual(gone.body, {error: 'no such token'});
      await admin.agent.delete('/api/v1/agent/token/nonsense').set(...AJAX).expect(404);
      const res2 = await enroll(body(await newCsr(), [mac()], {token: minted.token})).expect(202);
      assert.strictEqual(res2.body.status, 'pending');
    });

    it('answers 403 without the host permission, for each route', async () => {
      const minted = (await mint(admin, {name: uniq(), expires: future()}).expect(200)).body;
      const noRead = await limited('tok-noread', {create: true, destroy: true, update: true});
      const noCreate = await limited('tok-nocreate', {read: true, destroy: true, update: true});
      const noDestroy = await limited('tok-nodestroy', {read: true, create: true, update: true});
      await noRead.agent.get('/api/v1/agent/tokens').set(...AJAX).expect(403);
      await mint(noCreate, {name: uniq(), expires: future()}).expect(403);
      await noDestroy.agent.delete(`/api/v1/agent/token/${minted.id}`).set(...AJAX).expect(403);
      assert.ok(await Token().findOne({id: minted.id}));
    });

    it('answers 403 to a cookie mutation without the CSRF header', async () => {
      const before = await Token().count();
      await mint(admin, {name: uniq(), expires: future()}, []).expect(403);
      assert.strictEqual(await Token().count(), before);
      const minted = (await mint(admin, {name: uniq(), expires: future()}).expect(200)).body;
      await admin.agent.delete(`/api/v1/agent/token/${minted.id}`).expect(403);
      assert.ok(await Token().findOne({id: minted.id}));
    });
  });
});
