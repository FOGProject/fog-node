const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const redis = require('redis');
const supertest = require('supertest');
const x509 = require('@peculiar/x509');
const pki = require('../../api/lib/agent-pki');
const agentCsr = require('../support/agent-csr');
const support = require('../support/pki');

// The agent listener and the routes that need the client certificate: the
// principal policy (contract 1.5, 5.4), renew (1.3) and the minimal poll (1.6).
// The requests are Node https requests with a client certificate, to the port
// that test/lifecycle.test.js gives the lift as custom.agentTlsPort. The
// wire contract is FOG 1.6's, so the statuses, keys and strings are exact.
describe('Agent mTLS::', function () {
  this.timeout(120000);

  const fixtureDir = support.useFixture();
  const app = () => sails.hooks.http.app;
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  // Every name this file creates starts with PREFIX, so the names never
  // collide with another test file's names in the same run.
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mcm' + RUN;
  let seq = 0;
  const uniq = () => PREFIX + (seq++);
  const mac = () => '02:' + crypto.randomBytes(5).toString('hex').match(/../g).join(':');
  const bare = (m) => m.replace(/[:-]/g, '');
  const Host = () => sails.models.host;
  const fingerprints = [];
  const read = (name) => fs.readFileSync(path.join(fixtureDir(), name), 'utf8');

  // A request to the agent listener, with or without a client certificate.
  const mtls = (method, urlPath, {cert, key, body, headers = {}} = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request({
      host: '127.0.0.1',
      port: sails.config.custom.agentTlsPort,
      path: urlPath,
      method,
      ca: read('root.pem'),
      cert,
      key,
      agent: false,
      headers: Object.assign(payload === undefined ? {} : {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)}, headers)
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(text); } catch (unused) { json = undefined; }
        resolve({status: res.statusCode, headers: res.headers, text, json});
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
  const poll = (a, body = {}) => mtls('POST', '/agent/v1/poll', {cert: a.cert, key: a.key, body});
  const renew = (a, body) => mtls('POST', '/agent/v1/renew', {cert: a.cert, key: a.key, body});

  // The 401 body of contract 1.5, exact.
  const unauthorized = (reason) => ({status: 'unauthorized', reason, error: 'client certificate required'});
  const assert401 = (res, reason) => {
    assert.strictEqual(res.status, 401);
    assert.match(res.headers['content-type'], /^application\/json/);
    assert.deepStrictEqual(res.json, unauthorized(reason));
  };

  async function newCsr() {
    const c = await agentCsr.newCsr();
    fingerprints.push(c.fingerprint);
    return c;
  }
  const enrollBody = (c, m) => ({
    protocol: 1,
    agent_version: 'v0.0.1',
    os: 'linux',
    arch: 'amd64',
    hostname: uniq(),
    identity: {system_uuid: '', system_serial: '', board_serial: '', chassis_asset: '', macs: m ? [m] : []},
    csr_pem: c.pem
  });

  // Signs in as a browser does (see agent-admin.test.js).
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let res = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set('Accept', 'text/html')
      .send({username, password, _csrf: res.body._csrf})
      .expect(302).expect('Location', '/');
    res = await agent.get('/csrfToken').expect(200);
    return {agent, csrf: res.body._csrf};
  }

  let admin;

  // An enrolled agent, through the routes: enroll (pending), the admin approve,
  // enroll again (the certificate). Returns {c, host, cert, key, agentId}.
  async function enrolled() {
    const m = mac();
    const host = await Host().create({name: uniq(), macs: [bare(m)], pending: false}).fetch();
    const c = await newCsr();
    const first = await mtls('POST', '/agent/v1/enroll', {body: enrollBody(c, m)});
    assert.strictEqual(first.status, 202, first.text);
    const row = await sails.models.agentenrollment.findOne({fingerprint: c.fingerprint});
    await admin.agent.post(`/api/v1/agent/enrollment/${row.id}/approve`).set(...AJAX).expect(200);
    const got = await mtls('POST', '/agent/v1/enroll', {body: enrollBody(c, m)});
    assert.strictEqual(got.status, 200, got.text);
    return {c, host, cert: got.json.certificate_pem, key: agentCsr.keyPem(c.keys), agentId: got.json.host_id};
  }

  // A leaf for `publicKey` signed by the fixture's agent CA with the given
  // dates and extended key usage, then the agent CA: the shape signCsr gives.
  async function forgeLeaf(publicKey, {notBefore, notAfter, eku = pki.CLIENT_AUTH}) {
    const caPem = read('agent-ca.pem');
    const caKeys = await pki.importPair(crypto.createPrivateKey(read('agent-ca.key')), 'SHA-256');
    const leaf = await x509.X509CertificateGenerator.create({
      serialNumber: pki.randomSerial(),
      subject: pki.subjectOf(pki.agentCn('99'), 'FOG Agent'),
      issuer: new x509.X509Certificate(caPem).subjectName,
      notBefore,
      notAfter,
      signingAlgorithm: pki.RSA,
      publicKey,
      signingKey: caKeys.privateKey,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
        new x509.ExtendedKeyUsageExtension([eku], false)
      ]
    });
    return leaf.toString('pem') + '\n' + caPem;
  }

  // The number of Redis session keys: the sails session store prefix is "sess:".
  const sessionCount = () => new Promise((resolve, reject) => {
    const client = redis.createClient(sails.config.session.url);
    client.on('error', reject);
    client.keys('sess:*', (err, keys) => {
      client.quit();
      return err ? reject(err) : resolve(keys.length);
    });
  });

  const hostOf = (id) => Host().findOne({id});

  async function cleanup() {
    const rows = await sails.models.agentenrollment.find({fingerprint: fingerprints});
    await Host().destroy({id: rows.map((r) => r.host).filter(Boolean)});
    await Host().destroy({name: {startsWith: PREFIX}});
    await sails.models.agentenrollment.destroy({fingerprint: fingerprints});
  }

  before(async () => {
    // The hook starts the listener after the lift, so wait for it.
    for (let i = 0; i < 100 && !(sails.hooks['agent-tls'].server && sails.hooks['agent-tls'].server.listening); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(sails.hooks['agent-tls'].server && sails.hooks['agent-tls'].server.listening, 'the agent listener is up');
    await cleanup();
    admin = await signIn('mochatestadmin', 'mochatestadmin');
  });
  after(cleanup);

  describe('the listener::', () => {
    it('answers 404 for the UI, the login and the admin API, and runs no session code', async () => {
      const before = await sessionCount();
      for (const [method, urlPath] of [['GET', '/'], ['GET', '/login'], ['POST', '/api/v1/host'], ['GET', '/csrfToken'], ['GET', '/agent/v1/../login']]) {
        const res = await mtls(method, urlPath, {headers: {Accept: 'text/html'}, body: method === 'POST' ? {} : undefined});
        assert.strictEqual(res.status, 404, `${method} ${urlPath}`);
        assert.match(res.headers['content-type'], /^application\/json/);
        assert.deepStrictEqual(res.json, {error: 'not found'});
        assert.strictEqual(res.headers['set-cookie'], undefined, 'no cookie');
      }
      assert.strictEqual(await sessionCount(), before, 'no new sess: key');
    });

    it('still serves the CA file and the agent routes', async () => {
      const ca = await mtls('GET', '/management/other/ca.cert.pem');
      assert.strictEqual(ca.status, 200);
      assert.match(ca.text, /-----BEGIN CERTIFICATE-----/);
      assert.strictEqual((await mtls('POST', '/agent/v1/poll', {body: {}})).status, 401);
    });

    it('serves a certificate that verifies against the root, with the right SAN entry types', async () => {
      // https.request above verified it against root.pem for 127.0.0.1 (an IP entry).
      const served = new crypto.X509Certificate(read('server.pem'));
      assert.strictEqual(served.subjectAltName, 'DNS:localhost, IP Address:127.0.0.1');
      assert.ok(served.verify(new crypto.X509Certificate(read('root.pem')).publicKey));
    });
  });

  describe('sessions::', () => {
    it('a poll and an asset request create no session, and a login request does', async () => {
      const a = await enrolled();
      const before = await sessionCount();
      const res = await poll(a);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['set-cookie'], undefined, 'no cookie');
      const asset = await supertest(app()).get('/styles/importer.css');
      assert.strictEqual(asset.headers['set-cookie'], undefined, 'no cookie for an asset');
      assert.strictEqual(await sessionCount(), before, 'no new sess: key');
      // The counter works: a page that needs a session adds one.
      await supertest(app()).get('/csrfToken').expect(200);
      assert.strictEqual(await sessionCount(), before + 1);
    });
  });

  describe('agentPrincipal::', () => {
    it('no_client_certificate: no certificate', async () => {
      assert401(await mtls('POST', '/agent/v1/poll', {body: {}}), 'no_client_certificate');
    });

    it('no_client_certificate: not on the agent listener (the main port)', async () => {
      const res = await supertest(app()).post('/agent/v1/poll').send({});
      assert.strictEqual(res.status, 401);
      assert.deepStrictEqual(res.body, unauthorized('no_client_certificate'));
    });

    it('no_client_certificate: a certificate from another CA', async () => {
      const other = await support.foreign();
      const c = await newCsr();
      const saved = sails.config.custom.pkiDir;
      let issued;
      await support.setRoot(support.rootOf(other));
      sails.config.custom.pkiDir = other;
      try {
        issued = await sails.helpers.agent.signCsr.with({csrPem: c.pem, hostId: '98'});
      } finally {
        sails.config.custom.pkiDir = saved;
        await support.setRoot(support.rootOf(fixtureDir()));
      }
      // A host is bound to the key, so only the issuer can be the reason.
      await Host().create({name: uniq(), macs: [bare(mac())], pending: false, agentFingerprint: c.fingerprint});
      assert401(await poll({cert: issued.leafPem + issued.chainPem, key: agentCsr.keyPem(c.keys)}), 'no_client_certificate');
    });

    it('no_client_certificate: an expired leaf', async () => {
      const c = await newCsr();
      await Host().create({name: uniq(), macs: [bare(mac())], pending: false, agentFingerprint: c.fingerprint});
      const cert = await forgeLeaf(c.keys.publicKey, {notBefore: new Date(Date.now() - 10 * pki.DAY_MS), notAfter: new Date(Date.now() - pki.DAY_MS)});
      assert401(await poll({cert, key: agentCsr.keyPem(c.keys)}), 'no_client_certificate');
    });

    it('no_client_certificate: a leaf that is valid but is not for clientAuth', async () => {
      const c = await newCsr();
      await Host().create({name: uniq(), macs: [bare(mac())], pending: false, agentFingerprint: c.fingerprint});
      const cert = await forgeLeaf(c.keys.publicKey, {
        notBefore: new Date(Date.now() - pki.DAY_MS), notAfter: new Date(Date.now() + pki.DAY_MS), eku: '1.3.6.1.5.5.7.3.1'
      });
      assert401(await poll({cert, key: agentCsr.keyPem(c.keys)}), 'no_client_certificate');
      // The control: the same leaf with clientAuth is accepted.
      const good = await forgeLeaf(c.keys.publicKey, {notBefore: new Date(Date.now() - pki.DAY_MS), notAfter: new Date(Date.now() + pki.DAY_MS)});
      assert.strictEqual((await poll({cert: good, key: agentCsr.keyPem(c.keys)})).status, 200);
    });

    it('unknown_certificate: an issued key whose host was deleted', async () => {
      const a = await enrolled();
      assert.strictEqual((await poll(a)).status, 200);
      await Host().destroy({id: a.host.id});
      assert401(await poll(a), 'unknown_certificate');
    });

    it('unknown_certificate: a host that is still pending', async () => {
      const a = await enrolled();
      await Host().updateOne({id: a.host.id}).set({pending: true});
      assert401(await poll(a), 'unknown_certificate');
    });

    it('ambiguous_certificate: two hosts with the same fingerprint', async () => {
      const a = await enrolled();
      await Host().create({name: uniq(), macs: [bare(mac())], pending: false, agentFingerprint: a.c.fingerprint});
      assert401(await poll(a), 'ambiguous_certificate');
    });

    it('server_error: the host lookup fails', async () => {
      const a = await enrolled();
      const model = Host();
      const find = model.find;
      model.find = () => { throw new Error('database down'); };
      try {
        assert401(await poll(a), 'server_error');
      } finally {
        model.find = find;
      }
    });

    it('guards renew the same way', async () => {
      assert401(await mtls('POST', '/agent/v1/renew', {body: {csr_pem: 'x'}}), 'no_client_certificate');
    });
  });

  describe('POST /agent/v1/poll', () => {
    it('answers 200 with the 1.6 shape, and writes the check-in and the version', async () => {
      const a = await enrolled();
      await Host().updateOne({id: a.host.id}).set({agentCheckin: 1, agentVersion: 'old'});
      const res = await poll(a, {agent_version: 'v1.2.3'});
      assert.strictEqual(res.status, 200);
      const {server_time: serverTime, poll_interval: interval, ...rest} = res.json;
      assert.deepStrictEqual(rest, {
        status: 'ok',
        protocol: 1,
        host: {id: a.agentId, name: a.host.name},
        revision: '',
        state: {revision: '', capabilities: []}
      });
      assert.strictEqual(typeof interval, 'number');
      // 1.6 format('c'): 2026-11-10T17:06:09+00:00.
      assert.match(serverTime, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/);
      const after = await hostOf(a.host.id);
      assert.ok(after.agentCheckin > Date.now() - 60000);
      assert.strictEqual(after.agentVersion, '1.2.3');
      // No version in the body leaves the version as it is.
      assert.strictEqual((await poll(a, {})).status, 200);
      assert.strictEqual((await hostOf(a.host.id)).agentVersion, '1.2.3');
    });

    it('takes poll_interval from FOG_CLIENT_CHECKIN_TIME, and defaults to 60', async () => {
      const a = await enrolled();
      const name = 'FOG_CLIENT_CHECKIN_TIME';
      const saved = await sails.models.setting.findOne({name});
      try {
        await sails.models.setting.destroy({name});
        assert.strictEqual((await poll(a)).json.poll_interval, 60);
        await sails.models.setting.create({name, description: 'mocha', value: '45'});
        assert.strictEqual((await poll(a)).json.poll_interval, 45);
        // The Go agent's PollInterval is an int and fails to decode 90.5.
        await sails.models.setting.update({name}).set({value: '90.5'});
        const fractional = await poll(a);
        assert.strictEqual(fractional.status, 200);
        assert.strictEqual(fractional.json.poll_interval, 90);
        assert.ok(Number.isInteger(fractional.json.poll_interval));
        assert.match(fractional.text, /"poll_interval":\s*90\s*[,}]/, 'the JSON number has no fraction');
        await sails.models.setting.update({name}).set({value: 'soon'});
        assert.strictEqual((await poll(a)).json.poll_interval, 60);
      } finally {
        await sails.models.setting.destroy({name});
        if (saved) { await sails.models.setting.create(saved); }
      }
    });
  });

  describe('POST /agent/v1/renew', () => {
    const certs = (pem) => pem.match(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----\n?/g);

    it('same key: 200 with a new leaf for the same key; both certificates still authenticate', async () => {
      const a = await enrolled();
      await Host().updateOne({id: a.host.id}).set({agentNotAfter: '2000-01-01 00:00:00', agentCheckin: 1});
      const res = await renew(a, {csr_pem: a.c.pem});
      assert.strictEqual(res.status, 200, res.text);
      assert.deepStrictEqual(Object.keys(res.json).sort(), ['certificate_pem', 'host_id', 'not_after', 'status']);
      assert.strictEqual(res.json.status, 'issued');
      assert.strictEqual(res.json.host_id, a.agentId);
      assert.match(res.json.not_after, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);

      const pems = certs(res.json.certificate_pem);
      assert.strictEqual(pems.length, 2, 'the leaf, then the agent CA');
      const leaf = new crypto.X509Certificate(pems[0]);
      const old = new crypto.X509Certificate(certs(a.cert)[0]);
      assert.notStrictEqual(leaf.serialNumber, old.serialNumber, 'a new leaf');
      assert.ok(leaf.subject.split('\n').includes(`CN=fog-agent host ${a.agentId}`));
      assert.strictEqual(sails.helpers.agent.keyFingerprint(pems[0]), a.c.fingerprint);
      assert.ok(pki.verifies(pems[0], pems[1], true));
      assert.strictEqual(pems[1], read('agent-ca.pem'));

      const after = await hostOf(a.host.id);
      assert.strictEqual(after.agentNotAfter, res.json.not_after);
      assert.notStrictEqual(after.agentNotAfter, '2000-01-01 00:00:00');
      assert.ok(after.agentCheckin > Date.now() - 60000);
      assert.strictEqual(after.agentFingerprint, a.c.fingerprint, 'the fingerprint does not change');

      // The 1.6 audit row (Enrollment.php:581-595): exactly one, written by the agent.
      const rows = await AuditLog.find({subjectId: a.host.id, text: {startsWith: 'certificate renewed'}});
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].text, `certificate renewed to ${res.json.not_after}, key ${a.c.fingerprint.slice(0, 16)}`);
      assert.strictEqual(rows[0].authSource, 'agent');
      assert.deepStrictEqual(
        [rows[0].type, rows[0].subjectType, rows[0].subjectLabel, rows[0].renderable, rows[0].outcome, rows[0].createdBy],
        ['agent.enroll', 'host', a.host.name, true, 'allowed', '(system)']
      );
      const total = await AuditLog.count({subjectId: a.host.id});

      // The old certificate stays valid, and so does the new one.
      assert.strictEqual((await poll(a)).status, 200);
      assert.strictEqual((await poll({cert: res.json.certificate_pem, key: a.key})).status, 200);
      // A poll writes no row (1.6 has none).
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.strictEqual(await AuditLog.count({subjectId: a.host.id}), total);
    });

    it('a different key: 400 with the exact error, and the host is unchanged', async () => {
      const a = await enrolled();
      const other = await agentCsr.newCsr();
      const before = await hostOf(a.host.id);
      const res = await renew(a, {csr_pem: other.pem});
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(res.json, {status: 'error', error: 'the request is not for the key this certificate proved'});
      const after = await hostOf(a.host.id);
      assert.deepStrictEqual([after.agentNotAfter, after.agentFingerprint], [before.agentNotAfter, before.agentFingerprint]);
    });

    it('a bad CSR: 400 with the exact error', async () => {
      const a = await enrolled();
      const bad = {status: 'error', error: 'csr_pem is not a certificate request'};
      for (const body of [{}, {csr_pem: 'not a csr'}, {csr_pem: agentCsr.forge(a.c.pem)}, {csr_pem: 7}]) {
        const res = await renew(a, body);
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(res.json, bad);
      }
    });

    it('signing not configured: 503 with the exact error', async () => {
      const a = await enrolled();
      await support.setRoot('00:00');
      try {
        const res = await renew(a, {csr_pem: a.c.pem});
        assert.strictEqual(res.status, 503);
        assert.deepStrictEqual(res.json, {status: 'error', error: 'agent certificate issuance is not configured'});
      } finally {
        await support.setRoot(support.rootOf(fixtureDir()));
      }
    });
  });
});
