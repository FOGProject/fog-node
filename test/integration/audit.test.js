const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');
const agentCsr = require('../support/agent-csr');
const support = require('../support/pki');
const {PREFIXES} = require('../lifecycle.test');

// The audit trail core (docs/adr/0003-audit-trail.md): the AuditLog model, the
// record helper, the request seam (api/hooks/audit), the sign-in events and the
// fog-agent enrollment and token events.
//
// The seam writes after the response finishes, so a test that expects a row
// polls for it. A test that expects NO row makes its request, then a sentinel
// request that does write a row (a denied GET by the same actor), waits for the
// sentinel row, and only then asserts the absence. Every name a test creates
// starts with a lifecycle PREFIXES entry. The correlation id is not exposed to
// a client, so no test filters on it.
describe('Audit trail::', function () {
  this.timeout(120000);

  support.useFixture();
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const RUN = crypto.randomBytes(3).toString('hex');
  // Users, roles and attempted sign-in names.
  const PREFIX = PREFIXES[0] + '-aud' + RUN;
  // Hosts, tokens and agent hostnames: a host name is at most 15 characters.
  const SHORT = PREFIXES[1] + RUN;
  const PASSWORD = 'mocha-audit-pw';
  let seq = 0;
  const uniq = () => PREFIX + '-' + (seq++);
  const short = () => SHORT + (seq++);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const mac = () => '02:' + crypto.randomBytes(5).toString('hex').match(/../g).join(':');
  const bare = (m) => m.replace(/[:-]/g, '').toLowerCase();
  const LOOPBACK = ['127.0.0.1', '::ffff:127.0.0.1', '::1'];

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
  const rowsOf = (where, start) => AuditLog.find(Object.assign({}, where, {createdAt: {'>=': start}})).sort('createdAt ASC');

  // Users. `permissions` is the role's {stock: {...}}; isAdmin gives all.
  const roleNames = [];
  async function mkUser(label, {isAdmin = false, permissions = {}} = {}) {
    const name = `${PREFIX}-${label}`;
    roleNames.push(name);
    const role = await Role.create({name, isAdmin, permissions}).fetch();
    const user = await User.create({username: name, password: PASSWORD, email: `${name}@example.com`, roles: [role.id]}).fetch();
    return {username: name, id: user.id};
  }

  // Signs in as a browser does: a CSRF token for the login form, then the form
  // POST. The agent keeps the session cookie.
  async function signIn(username) {
    const agent = supertest.agent(app());
    const {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password: PASSWORD, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    return {kind: 'session', username, agent};
  }
  // A JSON sign-in: the answer holds a JWT.
  async function jwtOf(username) {
    const res = await supertest(app()).post('/api/v1/auth/login').send({username, password: PASSWORD}).expect(200);
    return {kind: 'jwt', username, token: res.body.token};
  }
  // An API token, set on the user as POST /users/:id/api-token does.
  async function tokenOf(user) {
    const token = 'fpat_' + crypto.randomBytes(24).toString('hex');
    await User.updateOne({id: user.id}).set({apiTokenHash: crypto.createHash('sha256').update(token).digest('hex')});
    return {kind: 'apitoken', username: user.username, token};
  }
  // A request by an actor, with its credential. A cookie actor sends the same
  // origin header that the UI sends.
  const as = (actor) => {
    const verb = (method) => (url) => {
      let req;
      if (actor.kind === 'session') {
        req = actor.agent[method](url);
      } else {
        req = supertest(app())[method](url);
        req = actor.kind === 'jwt' ? req.set('Authorization', actor.token) : req.set('Authorization', `Bearer ${actor.token}`);
      }
      return req.set(...AJAX);
    };
    return {get: verb('get'), post: verb('post'), put: verb('put'), del: verb('delete')};
  };
  // A denied GET by the actor on a model that no one can read: a row for sure.
  // Returns the row once it is stored. It proves the earlier writes landed.
  async function sentinel(actor, start) {
    const model = `${PREFIX}-sentinel-${seq++}`;
    await as(actor).get(`/api/v1/${model}`).expect(403);
    const [row] = await waitFor({permission: `${model}.read`}, start);
    return row;
  }

  let admin;
  let adminSession;
  let limitedUser;
  let limitedSession;
  const hostIds = [];
  const mkHost = async (fields = {}) => {
    const host = await sails.models.host.create(Object.assign({name: short(), pending: false}, fields)).fetch();
    hostIds.push(host.id);
    return host;
  };

  async function cleanup() {
    await sails.models.host.destroy({name: {startsWith: SHORT}});
    await sails.models.host.destroy({id: hostIds});
    await sails.models.image.destroy({name: {startsWith: PREFIX}});
    await sails.models.group.destroy({name: {startsWith: PREFIX}});
    await sails.models.agentenrolltoken.destroy({name: {startsWith: SHORT}});
    await User.destroy({username: {startsWith: PREFIX}});
    await Role.destroy({name: {startsWith: PREFIX}});
  }

  before(async () => {
    await cleanup();
    admin = await mkUser('admin', {isAdmin: true});
    limitedUser = await mkUser('limited', {permissions: {stock: {host: {read: true, update: true}}}});
    adminSession = await signIn(admin.username);
    limitedSession = await signIn(limitedUser.username);
  });
  after(cleanup);

  describe('the model and the helper', () => {
    it('stores a row with the defaults: outcome unknown, a string id, text cut to 4096', async () => {
      const start = Date.now();
      const label = uniq();
      const row = await sails.helpers.audit.record.with({req: null, row: {
        type: 'test.helper', subjectType: 'host', subjectId: 12345, subjectLabel: label, text: 'x'.repeat(5000)
      }});
      assert.strictEqual(row.outcome, 'unknown', 'an incomplete row never claims allowed');
      assert.strictEqual(row.subjectId, '12345');
      assert.strictEqual(row.text.length, 4096);
      assert.strictEqual(row.createdBy, '(system)');
      assert.strictEqual(row.ip, '');
      assert.strictEqual(row.correlationId, '');
      assert.strictEqual(row.authSource, 'anonymous');
      assert.strictEqual(row.affectedCount, 0);
      assert.strictEqual(row.renderable, false);
      assert.strictEqual(row.permission, '');
      const [stored] = await waitFor({subjectLabel: label}, start);
      assert.strictEqual(stored.id, row.id);
    });

    it('refuses an outcome that is not one of the five', async () => {
      const row = await sails.helpers.audit.record.with({req: null, row: {type: 'test.helper', outcome: 'maybe', subjectLabel: uniq()}});
      assert.strictEqual(row, null);
    });

    it('never throws: a failing write returns null and logs one warning', async () => {
      const create = sails.models.auditlog.create;
      const warn = sails.log.warn;
      const warnings = [];
      sails.models.auditlog.create = () => { throw new Error('boom'); };
      sails.log.warn = (...args) => { warnings.push(args.join(' ')); };
      let row;
      try {
        row = await sails.helpers.audit.record.with({req: null, row: {type: 'test.helper'}});
      } finally {
        sails.models.auditlog.create = create;
        sails.log.warn = warn;
      }
      assert.strictEqual(row, null);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].includes('test.helper'), warnings[0]);
    });

    it('creates the indexes at bootstrap, and none is unique', async () => {
      const model = sails.models.auditlog;
      const indexes = await sails.getDatastore(model.datastore).manager.collection(model.tableName).indexes();
      const keys = indexes.map((i) => Object.keys(i.key).join('+'));
      for (const key of ['createdAt', 'createdBy', 'correlationId', 'outcome', 'subjectType+subjectId']) {
        assert.ok(keys.includes(key), `no index on ${key}: ${keys}`);
      }
      assert.ok(!indexes.some((i) => i.unique && i.name !== '_id_'), 'an audit index is unique');
    });

    it('gives each request its own 32-hex correlation id', async () => {
      const start = Date.now();
      const a = await sentinel(limitedSession, start);
      const b = await sentinel(limitedSession, start);
      assert.match(a.correlationId, /^[0-9a-f]{32}$/);
      assert.match(b.correlationId, /^[0-9a-f]{32}$/);
      assert.notStrictEqual(a.correlationId, b.correlationId);
    });

    it('has no route that writes, changes or deletes a row, and no code that does', async () => {
      const start = Date.now();
      const before = await AuditLog.count();
      for (const method of ['post', 'put', 'del']) {
        const url = method === 'post' ? '/api/v1/auditlog' : '/api/v1/auditlog/abc';
        await as(adminSession)[method](url).send({text: 'x'}).expect(403);
      }
      await as(adminSession).get('/api/v1/auditlog').expect(403);
      await sentinel(adminSession, start);
      // Only audit rows of the refusals themselves were added.
      const added = (await AuditLog.count()) - before;
      assert.ok(added >= 5, `the refusals and the sentinel write rows (${added})`);
      assert.strictEqual(await AuditLog.count({permission: 'auditlog.update', text: 'x'}), 0);

      // Nothing in the app updates or destroys an AuditLog row.
      const root = path.join(__dirname, '..', '..');
      const hits = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(file); } else if (entry.name.endsWith('.js') && /auditlog\s*\.\s*(update|destroy|archive)/i.test(fs.readFileSync(file, 'utf8'))) { hits.push(file); }
        }
      };
      ['api', 'config', 'plugins', 'tools', 'migrations'].forEach((d) => fs.existsSync(path.join(root, d)) && walk(path.join(root, d)));
      assert.deepStrictEqual(hits, []);
    });
  });

  describe('authentication events', () => {
    it('writes one auth.login row for a correct sign-in through POST /api/v1/auth/login', async () => {
      const user = await mkUser('login');
      const start = Date.now();
      await supertest(app()).post('/api/v1/auth/login').send({username: user.username, password: PASSWORD}).expect(200);
      const [row] = await waitFor({type: 'auth.login', createdBy: user.username}, start);
      assert.strictEqual(row.outcome, 'allowed');
      assert.strictEqual(row.authSource, 'local');
      assert.strictEqual(row.subjectType, 'user');
      assert.strictEqual(row.subjectId, user.id);
      assert.strictEqual(row.subjectLabel, user.username);
      assert.ok(LOOPBACK.includes(row.ip), row.ip);
      assert.match(row.correlationId, /^[0-9a-f]{32}$/);
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({createdBy: user.username}, start)).length, 1, 'the seam added no second row');
    });

    it('writes one auth.login.failed row each for a wrong password and an unknown name', async () => {
      const user = await mkUser('wrongpw');
      const unknown = uniq() + '-nobody';
      const start = Date.now();
      await supertest(app()).post('/api/v1/auth/login').send({username: user.username, password: 'wrong'}).expect(401);
      await supertest(app()).post('/api/v1/auth/login').send({username: `  ${unknown}  `, password: 'wrong'}).expect(401);
      const [bad] = await waitFor({type: 'auth.login.failed', createdBy: user.username}, start);
      const [none] = await waitFor({type: 'auth.login.failed', createdBy: unknown}, start);
      for (const [row, name] of [[bad, user.username], [none, unknown]]) {
        assert.strictEqual(row.outcome, 'denied');
        assert.strictEqual(row.text, '', 'no reason is stored');
        assert.strictEqual(row.subjectType, 'user');
        assert.strictEqual(row.subjectId, '');
        assert.strictEqual(row.subjectLabel, name);
        assert.strictEqual(row.authSource, 'local');
      }
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({createdBy: user.username}, start)).length, 1);
      assert.strictEqual((await rowsOf({createdBy: unknown}, start)).length, 1);
    });

    it('cuts the attempted name to 191 characters', async () => {
      const long = PREFIX + 'n'.repeat(300);
      const start = Date.now();
      await supertest(app()).post('/api/v1/auth/login').send({username: long, password: 'wrong'}).expect(401);
      const [row] = await waitFor({type: 'auth.login.failed', createdBy: long.slice(0, 191)}, start);
      assert.strictEqual(row.createdBy.length, 191);
    });

    it('writes auth.logout naming the user, before the user is gone', async () => {
      const user = await mkUser('logout');
      const session = await signIn(user.username);
      const start = Date.now();
      await session.agent.post('/api/v1/auth/logout').set(...HTML).expect(302);
      const [row] = await waitFor({type: 'auth.logout', createdBy: user.username}, start);
      assert.strictEqual(row.outcome, 'allowed');
      assert.strictEqual(row.subjectType, 'user');
      assert.strictEqual(row.subjectId, user.id);
      assert.strictEqual(row.subjectLabel, user.username);
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({createdBy: user.username}, start)).length, 1, 'the seam added no second row');
    });

    it('writes auth.token.rejected for an unknown fpat_ token, and never stores the token', async () => {
      const secret = 'fpat_' + crypto.randomBytes(24).toString('hex');
      const start = Date.now();
      await supertest(app()).get('/api/v1/user/me').set('Authorization', `Bearer ${secret}`).expect(403);
      const [row] = await waitFor({type: 'auth.token.rejected'}, start);
      assert.strictEqual(row.outcome, 'denied');
      assert.strictEqual(row.subjectType, 'system');
      assert.strictEqual(row.authSource, 'apitoken');
      assert.strictEqual(row.createdBy, '');
      await sentinel(adminSession, start);
      const all = await rowsOf({}, start);
      assert.ok(!JSON.stringify(all).includes(secret), 'a row holds the token text');
      assert.ok(!JSON.stringify(all).includes(crypto.createHash('sha256').update(secret).digest('hex')), 'a row holds the token hash');
    });

    it('keeps a sign-in working when the audit write fails, and logs one warning', async () => {
      const user = await mkUser('stub');
      const create = sails.models.auditlog.create;
      const warn = sails.log.warn;
      const warnings = [];
      sails.models.auditlog.create = () => { throw new Error('boom'); };
      sails.log.warn = (...args) => { warnings.push(args.join(' ')); };
      let res;
      try {
        res = await supertest(app()).post('/api/v1/auth/login').send({username: user.username, password: PASSWORD});
      } finally {
        sails.models.auditlog.create = create;
        sails.log.warn = warn;
      }
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(warnings.filter((w) => w.includes('auth.login')).length, 1, warnings.join('\n'));
    });
  });

  describe('the request seam', () => {
    it('records a denied write: 403, access.api, denied, the permission that refused', async () => {
      const host = await mkHost();
      const start = Date.now();
      // limitedUser holds host.update, so use a user with host.read only.
      const reader = await mkUser('reader', {permissions: {stock: {host: {read: true}}}});
      const actor = await signIn(reader.username);
      await as(actor).put(`/api/v1/host/${host.id}`).send({description: 'x'}).expect(403);
      const [row] = await waitFor({type: 'access.api', createdBy: reader.username, permission: 'host.update'}, start);
      assert.strictEqual(row.outcome, 'denied');
      assert.strictEqual(row.text, `PUT /api/v1/host/${host.id}`);
      assert.strictEqual(row.authSource, 'session');
      await sentinel(actor, start);
      assert.strictEqual((await rowsOf({createdBy: reader.username, type: 'access.api', permission: 'host.update'}, start)).length, 1);
    });

    it('records an allowed admin PUT of a host with the subject, and a browser session as authSource session', async () => {
      const host = await mkHost();
      const start = Date.now();
      await as(adminSession).put(`/api/v1/host/${host.id}`).send({description: 'audited'}).expect(200);
      const [row] = await waitFor({type: 'access.api', createdBy: admin.username, subjectId: host.id}, start);
      assert.strictEqual(row.outcome, 'allowed');
      assert.strictEqual(row.subjectType, 'host');
      assert.strictEqual(row.subjectLabel, host.name);
      assert.strictEqual(row.permission, 'host.update');
      assert.strictEqual(row.authSource, 'session');
      assert.strictEqual(row.text, `PUT /api/v1/host/${host.id}`);
      assert.match(row.correlationId, /^[0-9a-f]{32}$/);
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({createdBy: admin.username, subjectId: host.id}, start)).length, 1);
    });

    it('records the authSource of a JWT write as jwt and of an fpat_ write as apitoken', async () => {
      const jwtUser = await mkUser('jwt', {isAdmin: true});
      const jwt = await jwtOf(jwtUser.username);
      const tokUser = await mkUser('tok', {isAdmin: true});
      const tok = await tokenOf(tokUser);
      for (const [actor, source] of [[jwt, 'jwt'], [tok, 'apitoken']]) {
        const host = await mkHost();
        const start = Date.now();
        await as(actor).put(`/api/v1/host/${host.id}`).send({description: source}).expect(200);
        const [row] = await waitFor({type: 'access.api', createdBy: actor.username, subjectId: host.id}, start);
        assert.strictEqual(row.authSource, source);
        assert.strictEqual(row.outcome, 'allowed');
      }
    });

    it('records one row with affectedCount 2 for an admin DELETE of two images', async () => {
      const names = [uniq(), uniq()];
      const images = [];
      for (const name of names) { images.push(await sails.models.image.create({name}).fetch()); }
      const start = Date.now();
      await as(adminSession).del('/api/v1/image').send({id: images.map((i) => i.id)}).expect(200);
      const [row] = await waitFor({type: 'access.api', createdBy: admin.username, subjectType: 'image'}, start);
      assert.strictEqual(row.affectedCount, 2);
      assert.strictEqual(row.subjectId, '');
      assert.strictEqual(row.permission, 'image.destroy');
      assert.strictEqual(row.outcome, 'allowed');
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({createdBy: admin.username, subjectType: 'image'}, start)).length, 1);
    });

    it('records a created row with its id and name, and a deleted one with its name', async () => {
      const name = uniq();
      const start = Date.now();
      const created = await as(adminSession).post('/api/v1/group').send({name}).expect(200);
      const [made] = await waitFor({type: 'access.api', createdBy: admin.username, subjectType: 'group', subjectLabel: name}, start);
      assert.strictEqual(made.subjectId, created.body.id);
      assert.strictEqual(made.permission, 'group.create');
      await as(adminSession).del(`/api/v1/group/${created.body.id}`).expect(200);
      const gone = await waitFor({type: 'access.api', createdBy: admin.username, subjectType: 'group', permission: 'group.destroy'}, start);
      assert.strictEqual(gone[0].subjectLabel, name);
      assert.strictEqual(gone[0].subjectId, created.body.id);
    });

    it('records no row for an allowed GET, and one for a denied GET', async () => {
      const start = Date.now();
      await as(adminSession).get('/api/v1/host').expect(200);
      await as(adminSession).get('/hosts').set(...HTML).expect(200);
      const denied = await sentinel(adminSession, start);
      assert.strictEqual(denied.outcome, 'denied');
      assert.strictEqual(denied.type, 'access.api');
      assert.strictEqual((await rowsOf({createdBy: admin.username, text: 'GET /api/v1/host'}, start)).length, 0);
      assert.strictEqual((await rowsOf({createdBy: admin.username, text: 'GET /hosts'}, start)).length, 0);
    });

    it('records a denied page request as access.page', async () => {
      const user = await mkUser('page');
      const actor = await signIn(user.username);
      const start = Date.now();
      // The Agent Tokens page needs host.read, which this user lacks.
      await actor.agent.get('/hosts/agentTokens').set(...HTML).expect(403);
      const [row] = await waitFor({createdBy: user.username, type: 'access.page'}, start);
      assert.strictEqual(row.outcome, 'denied');
      assert.strictEqual(row.text, 'GET /hosts/agentTokens');
    });

    it('records no row for the datatable and task-history POST reads', async () => {
      const start = Date.now();
      await as(adminSession).post('/api/v1/host/datatable').send({draw: 1, start: 0, length: 5}).expect(200);
      await as(adminSession).post('/api/v1/host/columns').send({}).expect(200);
      // /task-history is not under /api/v1, so Sails CSRF applies to it.
      const {body: csrf} = await adminSession.agent.get('/csrfToken').expect(200);
      await as(adminSession).post('/task-history').set('X-CSRF-Token', csrf._csrf).send({period: 1}).expect(200);
      await as(adminSession).post('/api/v1/auth/token').expect(200);
      await sentinel(adminSession, start);
      const rows = await rowsOf({createdBy: admin.username}, start);
      assert.deepStrictEqual(rows.map((r) => r.text).filter((t) => !/sentinel/.test(t)), []);
    });

    it('records a cookie request that apiCsrfGuard refuses as denied', async () => {
      const host = await mkHost();
      const start = Date.now();
      // No X-Requested-With: the guard refuses a plain cookie mutation.
      await adminSession.agent.put(`/api/v1/host/${host.id}`).send({description: 'x'}).expect(403);
      const [row] = await waitFor({type: 'access.api', createdBy: admin.username, text: `PUT /api/v1/host/${host.id}`}, start);
      assert.strictEqual(row.outcome, 'denied');
      assert.strictEqual(row.permission, '', 'the guard is not a permission check');
    });

    it('records a Sails CSRF refusal of a page form as denied', async () => {
      const start = Date.now();
      // A page form POST with no _csrf field: Sails answers 403 before any route runs.
      await adminSession.agent.post('/hosts/create').type('form').set(...HTML).send({name: short()}).expect(403);
      const rows = await waitFor({type: 'access.page', createdBy: admin.username, text: 'POST /hosts/create'}, start);
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({type: 'access.page', createdBy: admin.username, text: 'POST /hosts/create'}, start)).length, 1, 'one row per request');
      assert.strictEqual(rows[0].outcome, 'denied');
    });

    it('records a refused or failed full-page save by its outcome, not by the 302', async () => {
      const user = await mkUser('pagesave', {permissions: {stock: {host: {read: true, update: true, create: true}}}});
      const actor = await signIn(user.username);
      const host = await mkHost();
      const csrf = async () => (await actor.agent.get('/csrfToken').expect(200)).body._csrf;

      // A refused group change: the save redirects, and the row says denied.
      let token = await csrf();
      let start = Date.now();
      await actor.agent.post(`/hosts/edit/${host.id}`).type('form').set(...HTML)
        .send({name: host.name, groups: uniq(), _csrf: token}).expect(302);
      let [row] = await waitFor({type: 'access.page', createdBy: user.username}, start);
      assert.strictEqual(row.outcome, 'denied');
      assert.strictEqual(row.permission, 'group.update');
      await sentinel(actor, start);
      assert.strictEqual((await rowsOf({type: 'access.page', createdBy: user.username}, start)).length, 1);

      // Any other error: failed.
      token = await csrf();
      start = Date.now();
      await actor.agent.post(`/hosts/edit/${host.id}`).type('form').set(...HTML)
        .send({name: host.name, macs: 'not a mac', _csrf: token}).expect(302);
      [row] = await waitFor({type: 'access.page', createdBy: user.username}, start);
      assert.strictEqual(row.outcome, 'failed');
      assert.strictEqual(row.permission, 'host.update');
      assert.match(row.text, /^HTTP 302 POST \/hosts\/edit\//);
    });

    it('records a 500 from a write as failed, with HTTP 500 in the text', async () => {
      const start = Date.now();
      // A well-formed id that matches no host: update.js reads obj.id of null.
      const id = '0'.repeat(24);
      const res = await as(adminSession).put(`/api/v1/host/${id}`).send({description: 'x'});
      assert.strictEqual(res.status, 500);
      const [row] = await waitFor({type: 'access.api', createdBy: admin.username, text: `HTTP 500 PUT /api/v1/host/${id}`}, start);
      assert.strictEqual(row.outcome, 'failed');
    });

    it('writes no query string into the text', async () => {
      const host = await mkHost();
      const start = Date.now();
      await as(adminSession).put(`/api/v1/host/${host.id}?token=secret`).send({description: 'q'}).expect(200);
      const [row] = await waitFor({type: 'access.api', createdBy: admin.username, subjectId: host.id}, start);
      assert.strictEqual(row.text, `PUT /api/v1/host/${host.id}`);
    });

    it('records the group permission that refused a membership change', async () => {
      const noGroup = await mkUser('nogroup', {permissions: {stock: {host: {read: true, update: true, create: true}}}});
      const updateOnly = await mkUser('grpupd', {permissions: {stock: {host: {read: true, update: true, create: true}, group: {update: true}}}});
      const host = await mkHost();
      const newName = uniq();

      let actor = await signIn(noGroup.username);
      let start = Date.now();
      await as(actor).put(`/api/v1/host/${host.id}`).send({groups: [newName]}).expect(403);
      let [row] = await waitFor({type: 'access.api', createdBy: noGroup.username}, start);
      assert.strictEqual(row.outcome, 'denied');
      assert.strictEqual(row.permission, 'group.update');

      // Through host/bulk.
      start = Date.now();
      await as(actor).post('/api/v1/host/bulk').send({id: [host.id], addGroups: newName}).expect(403);
      [row] = await waitFor({type: 'access.api', createdBy: noGroup.username, text: 'POST /api/v1/host/bulk'}, start);
      assert.strictEqual(row.permission, 'group.update');

      // A new name with group.update but no group.create.
      actor = await signIn(updateOnly.username);
      start = Date.now();
      await as(actor).post('/api/v1/host').send({name: short(), groups: [newName]}).expect(403);
      [row] = await waitFor({type: 'access.api', createdBy: updateOnly.username}, start);
      assert.strictEqual(row.outcome, 'denied');
      assert.strictEqual(row.permission, 'group.create');
    });

    it('records the permission of an inline check that answers 403', async () => {
      const user = await mkUser('inline');
      const actor = await signIn(user.username);
      const start = Date.now();
      await as(actor).get('/api/v1/host/groups').expect(403);
      await as(actor).post('/api/v1/image/scan').expect(403);
      await as(actor).get('/api/v1/agent/tokens').expect(403);
      const rows = await waitFor({createdBy: user.username}, start, 3);
      assert.deepStrictEqual(rows.map((r) => r.permission).sort(), ['host.read', 'host.read', 'image.create']);
    });

    it('records a denied agent route by the paths it takes, not under /agent/v1/', async () => {
      const start = Date.now();
      await supertest(app()).post('/agent/v1/enroll').send({protocol: 2}).expect(426);
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({text: 'POST /agent/v1/enroll'}, start)).length, 0);
    });
  });

  describe('the fog-agent events', () => {
    const Enrollment = () => sails.models.agentenrollment;
    const fingerprints = [];
    async function newCsr() {
      const c = await agentCsr.newCsr();
      fingerprints.push(c.fingerprint);
      return c;
    }
    const body = (c, macs, extra = {}) => Object.assign({
      protocol: 1,
      agent_version: 'v0.0.1',
      os: 'linux',
      arch: 'amd64',
      hostname: '',
      identity: {system_uuid: '', system_serial: '', board_serial: '', chassis_asset: '', macs},
      csr_pem: c.pem
    }, extra);
    const enroll = (b) => supertest(app()).post('/agent/v1/enroll').send(b);
    const rowOf = (c) => Enrollment().findOne({fingerprint: c.fingerprint});
    const eventsOf = (hostId, start) => rowsOf({type: 'agent.enroll', subjectId: hostId}, start);

    after(async () => {
      const rows = await Enrollment().find({fingerprint: fingerprints});
      await sails.models.host.destroy({id: rows.map((r) => r.host).filter(Boolean)});
      await Enrollment().destroy({fingerprint: fingerprints});
    });

    it('first contact: waiting: <reason>, by (system) with authSource anonymous; a pending repeat writes none', async () => {
      const m = mac();
      const host = await mkHost({macs: [bare(m)]});
      const c = await newCsr();
      const start = Date.now();
      await enroll(body(c, [m])).expect(202);
      const [row] = await waitFor({type: 'agent.enroll', subjectId: host.id}, start);
      assert.strictEqual(row.text, 'waiting: known-host-no-agent');
      assert.strictEqual(row.createdBy, '(system)');
      assert.strictEqual(row.authSource, 'anonymous');
      assert.strictEqual(row.subjectType, 'host');
      assert.strictEqual(row.subjectLabel, host.name);
      assert.strictEqual(row.renderable, true);
      assert.strictEqual(row.permission, '');
      await enroll(body(c, [m])).expect(202);
      await enroll(body(c, [m])).expect(202);
      await sentinel(adminSession, start);
      assert.strictEqual((await eventsOf(host.id, start)).length, 1, 'an unchanged pending repeat writes no row');
    });

    it('first contact with no MAC: waiting: no MAC address reported', async () => {
      const hostname = short();
      const c = await newCsr();
      const start = Date.now();
      await enroll(body(c, [], {hostname})).expect(202);
      const [row] = await waitFor({type: 'agent.enroll', subjectLabel: hostname}, start);
      assert.strictEqual(row.text, 'waiting: no MAC address reported');
      assert.strictEqual(row.subjectId, '');
    });

    it('admin approve and deny: issued via admin, key <16>, and denied by <admin>, as the admin, with no access row', async () => {
      const m1 = mac();
      const m2 = mac();
      const h1 = await mkHost({macs: [bare(m1)]});
      const h2 = await mkHost({macs: [bare(m2)]});
      const c1 = await newCsr();
      const c2 = await newCsr();
      await enroll(body(c1, [m1])).expect(202);
      await enroll(body(c2, [m2])).expect(202);
      const start = Date.now();
      await as(adminSession).post(`/api/v1/agent/enrollment/${(await rowOf(c1)).id}/approve`).expect(200);
      await as(adminSession).post(`/api/v1/agent/enrollment/${(await rowOf(c2)).id}/deny`).expect(200);
      const [issued] = await waitFor({type: 'agent.enroll', subjectId: h1.id, createdBy: admin.username}, start);
      assert.strictEqual(issued.text, `issued via admin, key ${c1.fingerprint.slice(0, 16)}`);
      assert.strictEqual(issued.authSource, 'session');
      assert.strictEqual(issued.renderable, true);
      const [denied] = await waitFor({type: 'agent.enroll', subjectId: h2.id, createdBy: admin.username}, start);
      assert.strictEqual(denied.text, `denied by ${admin.username}`);
      await sentinel(adminSession, start);
      assert.strictEqual((await rowsOf({createdBy: admin.username, type: 'access.api'}, start))
        .filter((r) => r.text.startsWith('POST /api/v1/agent/enrollment/')).length, 0, 'the seam added a row beside the explicit event');
    });

    it('reissue: waiting: reissue, and a token auto-approve: issued via token', async () => {
      const m = mac();
      const host = await mkHost({macs: [bare(m)]});
      const c = await newCsr();
      await enroll(body(c, [m])).expect(202);
      await sails.helpers.agent.issue.with({row: await rowOf(c), via: 'admin', by: admin.username, keepCert: true});
      await enroll(body(c, [m])).expect(200);
      const start = Date.now();
      await enroll(body(c, [m])).expect(202);
      const [again] = await waitFor({type: 'agent.enroll', subjectId: host.id}, start);
      assert.strictEqual(again.text, 'waiting: reissue');
      assert.strictEqual(again.authSource, 'anonymous');

      const m2 = mac();
      const h2 = await mkHost({macs: [bare(m2)]});
      const secret = crypto.randomBytes(24).toString('hex');
      await sails.models.agentenrolltoken.create({
        name: short(), uses: 1, expires: Date.now() + 3600000, createdBy: 'mocha',
        hash: crypto.createHash('sha256').update(secret).digest('hex')
      });
      const c2 = await newCsr();
      const start2 = Date.now();
      await enroll(body(c2, [m2], {token: secret})).expect(200);
      const [via] = await waitFor({type: 'agent.enroll', subjectId: h2.id}, start2);
      assert.strictEqual(via.text, `issued via token, key ${c2.fingerprint.slice(0, 16)}`);
      assert.strictEqual(via.createdBy, '(system)');
      assert.strictEqual(via.authSource, 'anonymous');
      await sentinel(adminSession, start2);
      assert.ok(!JSON.stringify(await rowsOf({}, start2)).includes(secret), 'a row holds the token');
      assert.strictEqual((await eventsOf(h2.id, start2)).length, 1);
    });

    it('token mint and revoke: the 1.6 texts, no token and no hash, no access row', async () => {
      const start = Date.now();
      const name = short();
      const expires = Date.now() + 3600000;
      const stamp = new Date(expires).toISOString().slice(0, 19).replace('T', ' ');
      const minted = await as(adminSession).post('/api/v1/agent/token').send({name, uses: 2, expires}).expect(200);
      const [mint] = await waitFor({type: 'agent.token', subjectLabel: name}, start);
      assert.strictEqual(mint.text, `minted, 2 use(s), expires ${stamp}`);
      assert.strictEqual(mint.subjectType, 'agentenrolltoken');
      assert.strictEqual(mint.subjectId, minted.body.id);
      assert.strictEqual(mint.permission, 'host.create');
      assert.strictEqual(mint.createdBy, admin.username);
      assert.strictEqual(mint.renderable, true);

      const name2 = short();
      const unlimited = await as(adminSession).post('/api/v1/agent/token').send({name: name2, uses: -1, expires}).expect(200);
      const [mint2] = await waitFor({type: 'agent.token', subjectLabel: name2}, start);
      assert.strictEqual(mint2.text, `minted, unlimited uses, expires ${stamp}`);

      await as(adminSession).del(`/api/v1/agent/token/${minted.body.id}`).expect(200);
      const revoked = await waitFor({type: 'agent.token', subjectId: minted.body.id}, start, 2);
      assert.strictEqual(revoked[1].text, `revoked by ${admin.username}`);
      assert.strictEqual(revoked[1].permission, 'host.destroy');
      assert.strictEqual(revoked[1].subjectLabel, name);

      await sentinel(adminSession, start);
      const all = await rowsOf({}, start);
      const json = JSON.stringify(all);
      for (const token of [minted.body.token, unlimited.body.token]) {
        assert.ok(!json.includes(token) && !json.includes(crypto.createHash('sha256').update(token).digest('hex')), 'a row holds a token or a hash');
      }
      assert.strictEqual(all.filter((r) => r.type === 'access.api' && /\/agent\/token/.test(r.text)).length, 0);
    });
  });
});
