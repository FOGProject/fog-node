const assert = require('assert');
const crypto = require('crypto');
const supertest = require('supertest');

// The Pending Hosts page and its routes: the datatable rows, "Approve
// selected" and the pending-only delete. Each mutation checks its host
// permission and the same-origin guard (apiCsrfGuard).
describe('Pending hosts::', function () {
  this.timeout(20000);

  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mph' + RUN;
  const coll = (name) => sails.getDatastore(sails.models.host.datastore).manager.collection(name);

  // Signs in as a browser does (see limited-role.test.js).
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
    await sails.models.user.create({username: name, password: 'mocha-pending-pw', email: `${name}@example.com`, roles: [role.id]});
    return signIn(name, 'mocha-pending-pw');
  }

  const fingerprints = [];
  async function cleanup() {
    const hosts = await sails.models.host.find({name: {startsWith: PREFIX}});
    for (const h of hosts) {
      await coll('plugin_printer_host').deleteMany({host: String(h.id)});
    }
    await sails.models.host.destroy({name: {startsWith: PREFIX}});
    await sails.models.agentenrollment.destroy({fingerprint: fingerprints});
    await sails.models.user.destroy({username: {startsWith: PREFIX}});
    await sails.models.role.destroy({name: {startsWith: PREFIX}});
  }

  let admin;
  let lab;
  let other;
  let approved;
  const seed = async () => {
    // 'lab' is in the name of one pending host, and 0011 in the MAC of one.
    lab = await sails.models.host.create({name: `${PREFIX}-LAB-01`, pending: true, macs: ['001122334455'], description: 'the lab one'}).fetch();
    other = await sails.models.host.create({name: `${PREFIX}-zed`, pending: true, macs: ['aabbccddeeff']}).fetch();
    approved = await sails.models.host.create({name: `${PREFIX}-lab-approved`, pending: false, macs: ['001122998877']}).fetch();
  };

  before(async () => {
    await cleanup();
    admin = await signIn('mochatestadmin', 'mochatestadmin');
  });
  beforeEach(seed);
  afterEach(cleanup);

  const rows = (who, search = '') => who.agent.post('/api/v1/host/pending/datatable').set(...AJAX)
    .type('form').send({draw: 3, start: 0, length: 500, 'search[value]': search});

  describe('GET /hosts/pending', () => {
    it('answers 200 for an admin, with the 1.6 title, three columns and a delete URL', async () => {
      const res = await admin.agent.get('/hosts/pending').set(...HTML).expect(200);
      assert.ok(res.text.includes('<h4 class="card-title">All Pending Hosts</h4>'), 'the title');
      const heads = [...res.text.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
      assert.deepStrictEqual(heads, ['Host', 'Primary MAC', 'Description']);
      assert.ok(res.text.includes('data-delete-url="/api/v1/host/pending"'), 'the table carries the delete URL');
      assert.ok(res.text.includes('id="deleteSelected"'), 'Delete selected is shown');
    });

    it('answers 403 without host.read', async () => {
      const none = await limited('page-none', {update: true, destroy: true});
      await none.agent.get('/hosts/pending').set(...HTML).expect(403);
    });

    it('leaves /images without a delete URL and with its Delete selected button', async () => {
      const res = await admin.agent.get('/images').set(...HTML).expect(200);
      assert.ok(!res.text.includes('data-delete-url'), 'no delete URL');
      assert.ok(res.text.includes('id="deleteSelected"'), 'Delete selected is shown');
    });
  });

  describe('POST /api/v1/host/pending/datatable', () => {
    it('lists only the pending hosts, as {id, name, mac, description}', async () => {
      const res = await rows(admin).expect(200);
      assert.strictEqual(res.body.draw, 3);
      assert.strictEqual(res.body.recordsTotal, await sails.models.host.count({pending: true}));
      assert.strictEqual(res.body.recordsFiltered, res.body.recordsTotal);
      const ids = res.body.data.map((r) => r.id);
      assert.ok(ids.includes(lab.id) && ids.includes(other.id), 'both pending hosts');
      assert.ok(!ids.includes(approved.id), 'an approved host is not listed');
      assert.deepStrictEqual(res.body.data.find((r) => r.id === lab.id), {
        id: lab.id, name: lab.name, mac: '00:11:22:33:44:55', description: 'the lab one'
      });
      assert.ok(ids.indexOf(lab.id) < ids.indexOf(other.id), 'sorted by name');
    });

    it('matches lab to LAB-01 by name, without case', async () => {
      const ids = (await rows(admin, '  LaB-01 ').expect(200)).body.data.map((r) => r.id);
      assert.ok(ids.includes(lab.id), 'LAB-01 found');
      assert.ok(!ids.includes(other.id), 'zed not found');
      assert.ok(!ids.includes(approved.id), 'an approved host never matches');
    });

    it('matches 00:11 to 001122334455, and the bare and dashed forms', async () => {
      for (const text of ['00:11', '0011', '00-11-22', '00.11.22 33']) {
        const ids = (await rows(admin, text).expect(200)).body.data.map((r) => r.id);
        assert.ok(ids.includes(lab.id), `${text} finds the MAC`);
        assert.ok(!ids.includes(other.id), `${text} does not find the other host`);
      }
    });

    it('pages with start and length, and counts the filtered rows', async () => {
      const res = await admin.agent.post('/api/v1/host/pending/datatable').set(...AJAX)
        .type('form').send({draw: 1, start: 0, length: 1, 'search[value]': PREFIX}).expect(200);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.recordsFiltered, 2);
    });

    it('answers 403 without host.read', async () => {
      const none = await limited('rows-none', {update: true, destroy: true});
      await rows(none).expect(403);
      // The same route answers a user that holds host.read, so the 403 is the permission check.
      const reader = await limited('rows-read', {read: true});
      await rows(reader).expect(200);
    });
  });

  describe('POST /api/v1/host/pending/approve', () => {
    const approve = (who, ids, headers = [AJAX]) => {
      let req = who.agent.post('/api/v1/host/pending/approve');
      headers.forEach((h) => { req = req.set(...h); });
      return req.send({ids});
    };

    it('clears pending on a pending host and changes nothing else', async () => {
      const res = await approve(admin, [lab.id]).expect(200);
      assert.deepStrictEqual(res.body, {count: 1});
      const after = await sails.models.host.findOne({id: lab.id});
      assert.strictEqual(after.pending, false);
      assert.strictEqual(after.name, lab.name);
      assert.strictEqual(after.description, 'the lab one');
      assert.deepStrictEqual(after.macs, ['001122334455']);
      assert.strictEqual((await sails.models.host.findOne({id: other.id})).pending, true, 'an unlisted host stays pending');
    });

    it('changes nothing for an approved host id, and counts it as zero', async () => {
      const before = await sails.models.host.findOne({id: approved.id});
      const res = await approve(admin, [approved.id]).expect(200);
      assert.deepStrictEqual(res.body, {count: 0});
      assert.deepStrictEqual(await sails.models.host.findOne({id: approved.id}), before);
    });

    it('answers 403 without host.update', async () => {
      const none = await limited('approve-none', {read: true, destroy: true});
      await approve(none, [lab.id]).expect(403);
      assert.strictEqual((await sails.models.host.findOne({id: lab.id})).pending, true);
      // The same route answers a user that holds host.update, so the 403 is the permission check.
      const updater = await limited('approve-ok', {update: true});
      await approve(updater, [lab.id]).expect(200);
      assert.strictEqual((await sails.models.host.findOne({id: lab.id})).pending, false);
    });

    it('answers 403 to a cookie request without the CSRF header', async () => {
      await approve(admin, [lab.id], []).expect(403);
      assert.strictEqual((await sails.models.host.findOne({id: lab.id})).pending, true);
      // The same request with the header goes through, so the 403 is the same-origin guard.
      await approve(admin, [lab.id]).expect(200);
      assert.strictEqual((await sails.models.host.findOne({id: lab.id})).pending, false);
    });
  });

  describe('DELETE /api/v1/host/pending', () => {
    const del = (who, ids, headers = [AJAX]) => {
      let req = who.agent.delete('/api/v1/host/pending');
      headers.forEach((h) => { req = req.set(...h); });
      return req.send({id: ids});
    };
    const link = (host) => coll('plugin_printer_host').countDocuments({host: String(host.id)});
    const enrollment = async (host) => {
      const fingerprint = crypto.randomBytes(32).toString('hex');
      fingerprints.push(fingerprint);
      return sails.models.agentenrollment.create({fingerprint, csr: 'x', host: host.id, state: 'pending'}).fetch();
    };

    it('destroys a pending host and its plugin rows, and unbinds its enrollment rows', async () => {
      await coll('plugin_printer_host').insertOne({host: String(lab.id), printer: 'mocha-printer'});
      const row = await enrollment(lab);
      assert.strictEqual(await link(lab), 1);

      const res = await del(admin, [lab.id]).expect(200);
      assert.deepStrictEqual(res.body, {count: 1});
      assert.strictEqual(await sails.models.host.findOne({id: lab.id}), undefined);
      assert.strictEqual(await link(lab), 0, 'the plugin row is gone');
      assert.strictEqual((await sails.models.agentenrollment.findOne({id: row.id})).host, '');
      assert.ok(await sails.models.host.findOne({id: other.id}), 'an unlisted host stays');
    });

    it('destroys nothing for an approved host id', async () => {
      await coll('plugin_printer_host').insertOne({host: String(approved.id), printer: 'mocha-printer'});
      const row = await enrollment(approved);
      const res = await del(admin, [approved.id]).expect(200);
      assert.deepStrictEqual(res.body, {count: 0});
      assert.ok(await sails.models.host.findOne({id: approved.id}), 'the host stays');
      assert.strictEqual(await link(approved), 1, 'its plugin row stays');
      assert.strictEqual((await sails.models.agentenrollment.findOne({id: row.id})).host, approved.id);
    });

    it('answers 403 without host.destroy', async () => {
      const none = await limited('del-none', {read: true, update: true});
      await del(none, [lab.id]).expect(403);
      assert.ok(await sails.models.host.findOne({id: lab.id}));
      // The same route answers a user that holds host.destroy, so the 403 is the permission check.
      const destroyer = await limited('del-ok', {destroy: true});
      await del(destroyer, [lab.id]).expect(200);
      assert.strictEqual(await sails.models.host.findOne({id: lab.id}), undefined);
    });

    it('answers 403 to a cookie request without the CSRF header', async () => {
      await del(admin, [lab.id], []).expect(403);
      assert.ok(await sails.models.host.findOne({id: lab.id}));
      // The same request with the header goes through, so the 403 is the same-origin guard.
      await del(admin, [lab.id]).expect(200);
      assert.strictEqual(await sails.models.host.findOne({id: lab.id}), undefined);
    });
  });
});
