const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const supertest = require('supertest');
const {verifies} = require('../../api/lib/agent-pki');
const agentCsr = require('../support/agent-csr');
const support = require('../support/pki');

// POST /agent/v1/enroll: the fog-agent enrollment wire contract of FOG 1.6
// (briefs/research/2026-11-10-agent-enroll-contract.md, sections 1.1, 2.1 and
// 3). The same agent binary must work against both servers, so the statuses,
// the JSON keys and the strings are asserted exactly. The CSRs are built as the
// agent builds them: ECDSA P-256 and an empty subject (contract 4.3).
describe('Agent enroll::', function () {
  this.timeout(120000);

  const fixtureDir = support.useFixture();
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  // Every name this file creates starts with PREFIX. A host name is at most 15
  // characters, so the prefix and the counter stay short.
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mc' + RUN;
  let seq = 0;
  const uniq = () => PREFIX + (seq++);
  // A locally administered MAC, in the colon form that the agent sends.
  const mac = () => '02:' + crypto.randomBytes(5).toString('hex').match(/../g).join(':');
  const bare = (m) => m.replace(/[:-]/g, '').toLowerCase();

  const Enrollment = () => sails.models.agentenrollment;
  const Token = () => sails.models.agentenrolltoken;
  const fingerprints = [];

  // A CSR the way the agent makes it, and the fingerprint of its key. Each
  // fingerprint is recorded, so cleanup removes its row and host.
  const newKey = agentCsr.newKey;
  async function csrFor(keys) {
    const c = await agentCsr.csrFor(keys);
    if (!fingerprints.includes(c.fingerprint)) { fingerprints.push(c.fingerprint); }
    return c;
  }
  const newCsr = async () => csrFor(await newKey());

  // The request body of the agent (client.go:46-56).
  const request = (c, extra = {}) => Object.assign({
    protocol: 1,
    agent_version: 'v0.0.1',
    os: 'linux',
    arch: 'amd64',
    // A prefixed name, so the audit rows of the test are removable
    // (test/lifecycle.test.js). The fallback name test passes its own.
    hostname: uniq(),
    identity: {system_uuid: '', system_serial: '', board_serial: '', chassis_asset: '', macs: []},
    csr_pem: c.pem
  }, extra);
  const identity = (fields) => Object.assign({system_uuid: '', system_serial: '', board_serial: '', chassis_asset: '', macs: []}, fields);
  const post = (body) => supertest(app()).post('/agent/v1/enroll').send(body);
  const enroll = (c, extra) => post(request(c, extra));
  const rowOf = (c) => Enrollment().findOne({fingerprint: c.fingerprint});
  const keysOf = (body) => Object.keys(body).sort();

  const mkHost = (fields = {}) => sails.models.host.create(Object.assign({name: uniq(), pending: false}, fields)).fetch();
  const hostOf = (id) => sails.models.host.findOne({id});

  // A token with a known secret.
  async function mkToken(fields = {}) {
    const secret = crypto.randomBytes(24).toString('hex');
    const row = await Token().create(Object.assign({
      name: uniq(), uses: 1, expires: Date.now() + 3600000, createdBy: 'mocha',
      hash: crypto.createHash('sha256').update(secret).digest('hex')
    }, fields)).fetch();
    return {secret, row};
  }
  const usesOf = async (token) => (await Token().findOne({id: token.row.id})).uses;

  // The Settings that a test touches are put back after it.
  const settings = {};
  async function put(name, value) {
    if (!(name in settings)) { settings[name] = await Setting.findOne({name}) || null; }
    const updated = await Setting.updateOne({name}).set({value});
    if (!updated) { await Setting.create({name, description: 'mocha agent enroll', value}); }
  }
  async function restoreSettings() {
    for (const [name, saved] of Object.entries(settings)) {
      if (saved) { await Setting.updateOne({name}).set({value: saved.value}); } else { await Setting.destroy({name}); }
      delete settings[name];
    }
  }

  async function cleanup() {
    const rows = await Enrollment().find({fingerprint: fingerprints});
    await sails.models.host.destroy({id: rows.map((r) => r.host).filter(Boolean)});
    await sails.models.host.destroy({name: {startsWith: PREFIX}});
    await Enrollment().destroy({fingerprint: fingerprints});
    await Token().destroy({name: {startsWith: PREFIX}});
    await restoreSettings();
  }
  before(cleanup);
  afterEach(restoreSettings);
  after(cleanup);

  describe('the answers', () => {
    it('answers 426 unsupported for a protocol other than 1, and for no JSON body', async () => {
      const c = await newCsr();
      for (const protocol of [0, 2, undefined]) {
        const res = await enroll(c, {protocol}).expect(426);
        assert.deepStrictEqual(res.body, {status: 'unsupported', reason: 'protocol'});
      }
      assert.deepStrictEqual((await supertest(app()).post('/agent/v1/enroll').expect(426)).body, {status: 'unsupported', reason: 'protocol'});
      assert.deepStrictEqual((await supertest(app()).post('/agent/v1/enroll').type('form').send('protocol=1').expect(400)).body, {status: 'error', reason: 'csr'});
    });

    it('answers 400 csr for a CSR that is missing, garbage, or has a bad signature', async () => {
      const good = await newCsr();
      const forged = agentCsr.forge(good.pem);
      for (const csr_pem of [undefined, '', 'garbage', '-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n', forged]) {
        const res = await post(request(good, {csr_pem})).expect(400);
        assert.deepStrictEqual(res.body, {status: 'error', reason: 'csr'});
      }
      // The forged request left no row behind.
      assert.strictEqual(await Enrollment().count({fingerprint: good.fingerprint}), 0);
    });

    it('answers 400 csr for a csr_pem over 16384 characters, before it is parsed', async () => {
      const good = await newCsr();
      const res = await post(request(good, {csr_pem: good.pem + ' '.repeat(16384)})).expect(400);
      assert.deepStrictEqual(res.body, {status: 'error', reason: 'csr'});
      assert.strictEqual(await Enrollment().count({fingerprint: good.fingerprint}), 0);
    });

    it('stores only the contract identity keys, capped, and at most 32 MACs', async () => {
      const c = await newCsr();
      const macs = Array.from({length: 40}, mac);
      await enroll(c, {identity: {
        system_uuid: 'u'.repeat(1000), system_serial: 's', board_serial: 'b', chassis_asset: 'a',
        smbios_version: '3.2', warnings: ['w', 5, 'x'.repeat(1000)], _directoryIdentity: {required: true},
        extra: {deep: 'z'.repeat(40000)}, macs: [...macs, 'bad', 7]
      }}).expect(202);
      const stored = (await rowOf(c)).identity;
      assert.deepStrictEqual(Object.keys(stored).sort(),
        ['board_serial', 'chassis_asset', 'macs', 'smbios_version', 'system_serial', 'system_uuid', 'warnings']);
      assert.strictEqual(stored.system_uuid.length, 256);
      assert.deepStrictEqual(stored.macs, macs.slice(0, 32));
      assert.deepStrictEqual([stored.warnings.length, stored.warnings[0], stored.warnings[1].length], [2, 'w', 256]);
      assert.strictEqual(JSON.stringify(stored).includes('zzzz'), false);
    });

    it('hashes a token as the sha256 of its trimmed text', () => {
      const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
      assert.strictEqual(sails.models.agentenrolltoken.hashOf(' \nabc\t'), hash('abc'));
    });

    it('answers 202 pending with the reason and retry_after 300', async () => {
      const c = await newCsr();
      const res = await enroll(c, {identity: identity({macs: [mac()]})}).expect(202);
      assert.deepStrictEqual(keysOf(res.body), ['reason', 'retry_after', 'status']);
      assert.deepStrictEqual(res.body, {status: 'pending', reason: 'unknown-host', retry_after: 300});
    });

    it('accepts the CSR for the same key as one row, whatever its encoding', async () => {
      const keys = await newKey();
      const first = await csrFor(keys);
      const second = await csrFor(keys);
      assert.notStrictEqual(first.pem, second.pem, 'ECDSA signatures differ');
      assert.strictEqual(first.fingerprint, second.fingerprint);
    });
  });

  describe('the reasons', () => {
    it('unknown-host with a MAC: creates one pending host named by the request hostname', async () => {
      const c = await newCsr();
      const m = mac();
      const name = uniq();
      const res = await enroll(c, {hostname: name, identity: identity({macs: [m], system_serial: `MOCHA-${name}`, system_uuid: crypto.randomUUID()})}).expect(202);
      assert.strictEqual(res.body.reason, 'unknown-host');
      const row = await rowOf(c);
      const host = await hostOf(row.host);
      assert.strictEqual(host.name, name);
      assert.strictEqual(host.pending, true);
      assert.strictEqual(host.description, 'Pending Registration created by FOG_AGENT');
      assert.deepStrictEqual(host.macs, [bare(m)]);
      assert.strictEqual(host.serial, `mocha-${name}`);
      assert.strictEqual(row.state, 'pending');
      assert.strictEqual(row.cert, '');
      assert.strictEqual(row.agentVersion, '0.0.1', 'the leading v is stripped');
      assert.strictEqual(await sails.models.host.count({name: {startsWith: name}}), 1);
    });

    it('unknown-host: a hostname that fails the name rule or is over 15 characters becomes agent-<fingerprint>', async () => {
      const hostIds = [];
      try {
        for (const hostname of ['bad name!', 'x'.repeat(16), '']) {
          const c = await newCsr();
          await enroll(c, {hostname, identity: identity({macs: [mac()]})}).expect(202);
          const host = await hostOf((await rowOf(c)).host);
          hostIds.push(host.id);
          assert.strictEqual(host.name, 'agent-' + c.fingerprint.slice(0, 8), `hostname ${JSON.stringify(hostname)}`);
        }
      } finally {
        // The fallback name has no suite prefix, so remove the audit rows of
        // these hosts by their id (the lifecycle cleanup cannot attribute them).
        await AuditLog.destroy({subjectType: 'host', subjectId: hostIds});
      }
    });

    it('unknown-host: a second key with the same MAC gets its own pending host with a -1 name', async () => {
      const m = mac();
      const name = uniq();
      const names = [];
      for (const unused of [1, 2, 3]) {
        const c = await newCsr();
        const res = await enroll(c, {hostname: name, identity: identity({macs: [m]})}).expect(202);
        assert.strictEqual(res.body.reason, 'unknown-host', 'the resolver skips pending hosts');
        names.push((await hostOf((await rowOf(c)).host)).name);
      }
      assert.deepStrictEqual(names, [name, name + '-1', name + '-2']);
    });

    it('unknown-host: the -1 suffix cuts a 15 character base so the name stays at 15', async () => {
      const m = mac();
      const name = PREFIX + 'abcdefghi'.slice(0, 15 - PREFIX.length);
      assert.strictEqual(name.length, 15);
      const names = [];
      for (const unused of [1, 2]) {
        const c = await newCsr();
        await enroll(c, {hostname: name, identity: identity({macs: [m]})}).expect(202);
        names.push((await hostOf((await rowOf(c)).host)).name);
      }
      assert.deepStrictEqual(names, [name, name.slice(0, 13) + '-1']);
    });

    it('no-mac: creates no host, and 202 says no-mac', async () => {
      const c = await newCsr();
      const before = await sails.models.host.count();
      const res = await enroll(c, {hostname: uniq(), identity: identity({macs: ['not a mac', 'aa:bb:cc']})}).expect(202);
      assert.deepStrictEqual(res.body, {status: 'pending', reason: 'no-mac', retry_after: 300});
      assert.strictEqual(await sails.models.host.count(), before);
      assert.strictEqual((await rowOf(c)).host, '');
    });

    it('no-mac never auto-approves, even with a valid token', async () => {
      const token = await mkToken();
      const c = await newCsr();
      const res = await enroll(c, {token: token.secret}).expect(202);
      assert.strictEqual(res.body.reason, 'no-mac');
      assert.strictEqual(await usesOf(token), 1);
    });

    it('stores only the valid MACs, in the host form, without repeats', async () => {
      const c = await newCsr();
      const m = mac();
      const other = mac();
      await enroll(c, {identity: identity({macs: [m.toUpperCase(), m.replace(/:/g, '-'), 'zz:zz:zz:zz:zz:zz', 'aabbccddeeff', 42, other]})}).expect(202);
      const host = await hostOf((await rowOf(c)).host);
      assert.deepStrictEqual(host.macs, [bare(m), bare(other)]);
    });

    it('known-host-no-agent: a MAC matches a host without an agent', async () => {
      const m = mac();
      const host = await mkHost({macs: [bare(m)]});
      const c = await newCsr();
      const res = await enroll(c, {identity: identity({macs: [m]})}).expect(202);
      assert.strictEqual(res.body.reason, 'known-host-no-agent');
      assert.strictEqual((await rowOf(c)).host, host.id);
      assert.strictEqual((await hostOf(host.id)).pending, false, 'a known host is not changed');
    });

    it('known-host-no-agent: the SMBIOS serial and uuid match, without case', async () => {
      const serial = `MOCHA-${uniq()}`;
      const guid = crypto.randomUUID();
      const host = await mkHost({serial, guid});
      const c = await newCsr();
      const res = await enroll(c, {identity: identity({system_serial: ` ${serial.toUpperCase()}  `, system_uuid: guid.toUpperCase()})}).expect(202);
      assert.strictEqual(res.body.reason, 'known-host-no-agent');
      assert.strictEqual((await rowOf(c)).host, host.id);
    });

    it('the asset tag scores only next to a firmware match', async () => {
      const asset = `ASSET-${uniq()}`;
      await mkHost({asset});
      const c = await newCsr();
      const res = await enroll(c, {identity: identity({chassis_asset: asset, macs: [mac()]})}).expect(202);
      assert.strictEqual(res.body.reason, 'unknown-host', 'an asset alone matches nothing');
    });

    it('SMBIOS: a placeholder, a repeated character and an empty value match nothing', async () => {
      const shared = ['To be filled by O.E.M.', '0000000000', 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', 'N/A'];
      for (const value of shared) {
        await mkHost({serial: value});
        const c = await newCsr();
        const res = await enroll(c, {identity: identity({system_serial: value, macs: [mac()]})}).expect(202);
        assert.strictEqual(res.body.reason, 'unknown-host', value);
      }
    });

    it('SMBIOS: a tie between two hosts is no match', async () => {
      const serial = `MOCHA-${uniq()}`;
      await mkHost({serial});
      await mkHost({serial});
      const c = await newCsr();
      const res = await enroll(c, {identity: identity({system_serial: serial, macs: [mac()]})}).expect(202);
      assert.strictEqual(res.body.reason, 'unknown-host');
    });

    it('SMBIOS: more matching fields win over fewer', async () => {
      const serial = `MOCHA-${uniq()}`;
      const guid = crypto.randomUUID();
      await mkHost({serial});
      const best = await mkHost({serial, guid});
      const c = await newCsr();
      await enroll(c, {identity: identity({system_serial: serial, system_uuid: guid})}).expect(202);
      assert.strictEqual((await rowOf(c)).host, best.id);
    });

    it('the Setting FOG_HOST_IDENTIFY_SMBIOS off makes the match by MAC only', async () => {
      const serial = `MOCHA-${uniq()}`;
      const bySerial = await mkHost({serial});
      const m = mac();
      const byMac = await mkHost({macs: [bare(m)]});
      await put('FOG_HOST_IDENTIFY_SMBIOS', 'off');
      const c = await newCsr();
      const res = await enroll(c, {identity: identity({system_serial: serial, macs: [m]})}).expect(202);
      assert.strictEqual(res.body.reason, 'known-host-no-agent');
      assert.strictEqual((await rowOf(c)).host, byMac.id);
      assert.notStrictEqual(byMac.id, bySerial.id);
    });

    it('MAC: with several hosts, the one with the most matching MACs wins, and a tie is no match', async () => {
      const [a, b] = [mac(), mac()];
      await mkHost({macs: [bare(a)]});
      const both = await mkHost({macs: [bare(a), bare(b)]});
      const c = await newCsr();
      await enroll(c, {identity: identity({macs: [a, b]})}).expect(202);
      assert.strictEqual((await rowOf(c)).host, both.id);

      const [x, y] = [mac(), mac()];
      await mkHost({macs: [bare(x)]});
      await mkHost({macs: [bare(y)]});
      const tie = await newCsr();
      const res = await enroll(tie, {identity: identity({macs: [x, y]})}).expect(202);
      assert.strictEqual(res.body.reason, 'unknown-host');
    });

    it('a pending host never resolves', async () => {
      const m = mac();
      await mkHost({macs: [bare(m)], pending: true});
      const res = await enroll(await newCsr(), {identity: identity({macs: [m]})}).expect(202);
      assert.strictEqual(res.body.reason, 'unknown-host');
    });

    it('rebind: the resolved host already has an agent key', async () => {
      const m = mac();
      await mkHost({macs: [bare(m)], agentFingerprint: crypto.randomBytes(32).toString('hex')});
      const res = await enroll(await newCsr(), {identity: identity({macs: [m]})}).expect(202);
      assert.strictEqual(res.body.reason, 'rebind');
    });

    it('identity-conflict: firmware and MAC name different hosts, and the firmware host is kept', async () => {
      const serial = `MOCHA-${uniq()}`;
      const m = mac();
      const byFirmware = await mkHost({serial});
      await mkHost({macs: [bare(m)]});
      const c = await newCsr();
      const res = await enroll(c, {identity: identity({system_serial: serial, macs: [m]})}).expect(202);
      assert.strictEqual(res.body.reason, 'identity-conflict');
      assert.strictEqual((await rowOf(c)).host, byFirmware.id);
    });
  });

  describe('a repeat with the same key', () => {
    it('answers from the row: pending stays 202 with the same reason, and never re-resolves the host', async () => {
      const c = await newCsr();
      const m = mac();
      const name = uniq();
      const first = await enroll(c, {hostname: name, identity: identity({macs: [m]})}).expect(202);
      const row1 = await rowOf(c);
      // A host that would now match. The repeat must not look for it.
      await mkHost({macs: [bare(m)]});
      const second = await enroll(c, {agent_version: 'V9.9', os: 'windows', hostname: 'renamed', identity: identity({macs: [m]})}).expect(202);
      assert.deepStrictEqual(second.body, first.body);
      const row2 = await rowOf(c);
      assert.strictEqual(row2.reason, 'unknown-host');
      assert.strictEqual(row2.host, row1.host);
      assert.strictEqual(row2.csr, row1.csr, 'the first CSR is the one kept');
      assert.deepStrictEqual([row2.agentVersion, row2.os, row2.hostname], ['9.9', 'windows', 'renamed']);
      // The repeat created no second pending host for this machine.
      assert.strictEqual(await sails.models.host.count({name: {startsWith: name}}), 1);
    });

    it('signs the first CSR, not the latest, and checks the later CSR for the same key', async () => {
      const keys = await newKey();
      const first = await csrFor(keys);
      const m = mac();
      await mkHost({macs: [bare(m)]});
      await enroll(first, {identity: identity({macs: [m]})}).expect(202);
      const later = await csrFor(keys);
      // A later CSR that fails the signature check is still 400.
      await post(request(later, {csr_pem: agentCsr.forge(later.pem)})).expect(400);
      assert.strictEqual((await rowOf(first)).csr, first.pem);
    });

    it('approved: 200 once with the certificate, then 202 reissue', async () => {
      const m = mac();
      const host = await mkHost({macs: [bare(m)]});
      const c = await newCsr();
      await enroll(c, {identity: identity({macs: [m]})}).expect(202);
      const row = await rowOf(c);
      await sails.helpers.agent.issue.with({row, via: 'admin', by: 'mocha-admin', keepCert: true});

      const issued = await enroll(c, {identity: identity({macs: [m]})}).expect(200);
      assert.deepStrictEqual(keysOf(issued.body), ['certificate_pem', 'host_id', 'not_after', 'status']);
      assert.strictEqual(issued.body.status, 'issued');
      assert.ok(Number.isInteger(issued.body.host_id), 'host_id is a JSON integer');
      assert.match(issued.body.not_after, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
      const after = await hostOf(host.id);
      assert.strictEqual(issued.body.host_id, after.agentId);
      assert.strictEqual(after.agentNotAfter, issued.body.not_after);
      assert.strictEqual(after.agentFingerprint, c.fingerprint);
      assert.strictEqual(after.pending, false);
      assert.strictEqual(after.agentVersion, '0.0.1');
      assert.ok(after.agentCheckin > 0);

      // The leaf: the server's subject, the agent's key, then the agent CA.
      const pems = issued.body.certificate_pem.match(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----\n?/g);
      assert.strictEqual(pems.length, 2, 'the leaf, then the agent CA only');
      const leaf = new crypto.X509Certificate(pems[0]);
      assert.ok(leaf.subject.split('\n').includes(`CN=fog-agent host ${after.agentId}`));
      assert.strictEqual(sails.helpers.agent.keyFingerprint(pems[0]), c.fingerprint);
      assert.ok(verifies(pems[0], pems[1], true));
      assert.strictEqual(pems[1], fs.readFileSync(path.join(fixtureDir(), 'agent-ca.pem'), 'utf8'));

      const doneRow = await rowOf(c);
      assert.deepStrictEqual([doneRow.state, doneRow.cert, doneRow.decidedBy, doneRow.decidedVia], ['issued', '', 'mocha-admin', 'admin']);

      const again = await enroll(c, {identity: identity({macs: [m]})}).expect(202);
      assert.deepStrictEqual(again.body, {status: 'pending', reason: 'reissue', retry_after: 300});
      assert.strictEqual((await rowOf(c)).state, 'pending');
    });

    it('approved, then the host is deleted: the next request still gets 200 once, from the row and the stored leaf', async () => {
      const m = mac();
      const host = await mkHost({macs: [bare(m)]});
      const c = await newCsr();
      await enroll(c, {identity: identity({macs: [m]})}).expect(202);
      await sails.helpers.agent.issue.with({row: await rowOf(c), via: 'admin', by: 'mocha-admin', keepCert: true});
      const agentId = (await hostOf(host.id)).agentId;
      const notAfter = (await hostOf(host.id)).agentNotAfter;
      await sails.models.host.destroy({id: host.id});

      const res = await enroll(c, {identity: identity({macs: [m]})}).expect(200);
      assert.deepStrictEqual(keysOf(res.body), ['certificate_pem', 'host_id', 'not_after', 'status']);
      assert.strictEqual(res.body.host_id, agentId, 'host_id comes from CN=fog-agent host <id> in the leaf');
      assert.strictEqual(res.body.not_after, notAfter, 'not_after comes from the leaf');
      assert.strictEqual(sails.helpers.agent.keyFingerprint(res.body.certificate_pem), c.fingerprint);
      assert.strictEqual((await rowOf(c)).cert, '');
      const next = await enroll(c, {identity: identity({macs: [m]})}).expect(202);
      assert.strictEqual(next.body.reason, 'reissue');
    });

    it('denied: 403 every time, and only the row details refresh', async () => {
      const c = await newCsr();
      await enroll(c, {identity: identity({macs: [mac()]})}).expect(202);
      const row = await rowOf(c);
      await Enrollment().updateOne({id: row.id}).set({state: 'denied', decidedVia: 'admin'});
      for (const unused of [1, 2]) {
        const res = await enroll(c, {agent_version: '2.0'}).expect(403);
        assert.deepStrictEqual(res.body, {status: 'denied', reason: 'admin'});
      }
      assert.strictEqual((await rowOf(c)).agentVersion, '2.0');
      assert.strictEqual((await rowOf(c)).state, 'denied');
    });
  });

  describe('the host number', () => {
    it('gives each host its own number, and a host keeps its number for a new key', async () => {
      const [m1, m2] = [mac(), mac()];
      const h1 = await mkHost({macs: [bare(m1)]});
      const h2 = await mkHost({macs: [bare(m2)]});
      const ids = [];
      for (const [h, m] of [[h1, m1], [h2, m2], [h1, m1]]) {
        const c = await newCsr();
        await enroll(c, {identity: identity({macs: [m]})}).expect(202);
        await sails.helpers.agent.issue.with({row: await rowOf(c), via: 'admin', by: 'mocha', keepCert: true});
        ids.push((await enroll(c, {identity: identity({macs: [m]})}).expect(200)).body.host_id);
        assert.strictEqual((await hostOf(h.id)).agentId, ids[ids.length - 1]);
      }
      assert.ok(ids[0] > 0 && ids[1] > 0);
      assert.notStrictEqual(ids[0], ids[1]);
      assert.strictEqual(ids[2], ids[0], 'the second key of h1 is a rebind and keeps the number');
    });
  });

  describe('a token', () => {
    it('issues in the same request and spends one use', async () => {
      const token = await mkToken({uses: 2});
      const m = mac();
      const c = await newCsr();
      const res = await enroll(c, {token: `  ${token.secret}\n`, hostname: uniq(), identity: identity({macs: [m]})}).expect(200);
      assert.strictEqual(res.body.status, 'issued');
      assert.ok(Number.isInteger(res.body.host_id));
      assert.strictEqual(await usesOf(token), 1);
      const row = await rowOf(c);
      assert.deepStrictEqual([row.state, row.cert, row.decidedVia, row.decidedBy], ['issued', '', 'token', '']);
      const host = await hostOf(row.host);
      assert.strictEqual(host.pending, false, 'a pending host is approved with its agent');
      assert.strictEqual(host.agentFingerprint, c.fingerprint);
    });

    it('works for a repeat of a pending key', async () => {
      const c = await newCsr();
      const m = mac();
      await enroll(c, {hostname: uniq(), identity: identity({macs: [m]})}).expect(202);
      const token = await mkToken();
      await enroll(c, {token: token.secret, identity: identity({macs: [m]})}).expect(200);
      assert.strictEqual(await usesOf(token), 0);
    });

    it('with uses -1 never spends', async () => {
      const token = await mkToken({uses: -1});
      for (const unused of [1, 2]) {
        await enroll(await newCsr(), {token: token.secret, identity: identity({macs: [mac()]})}).expect(200);
      }
      assert.strictEqual(await usesOf(token), -1);
    });

    it('an expired, spent or unknown token waits', async () => {
      const expired = await mkToken({expires: Date.now() - 1000});
      const spent = await mkToken({uses: 0});
      const expiredUnlimited = await mkToken({uses: -1, expires: Date.now() - 1000});
      for (const secret of [expired.secret, spent.secret, expiredUnlimited.secret, crypto.randomBytes(24).toString('hex'), ' ']) {
        const res = await enroll(await newCsr(), {token: secret, identity: identity({macs: [mac()]})}).expect(202);
        assert.strictEqual(res.body.reason, 'unknown-host');
      }
      assert.strictEqual(await usesOf(expired), 1);
      assert.strictEqual(await usesOf(spent), 0);
    });

    it('a sign failure answers 503 signing, leaves the row pending, and spends nothing', async () => {
      const token = await mkToken();
      const saved = sails.config.custom.pkiDir;
      sails.config.custom.pkiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-pki-empty-'));
      const c = await newCsr();
      try {
        const res = await enroll(c, {token: token.secret, identity: identity({macs: [mac()]})}).expect(503);
        assert.deepStrictEqual(res.body, {status: 'error', reason: 'signing'});
      } finally {
        fs.rmSync(sails.config.custom.pkiDir, {recursive: true, force: true});
        sails.config.custom.pkiDir = saved;
      }
      assert.strictEqual(await usesOf(token), 1);
      assert.strictEqual((await rowOf(c)).state, 'pending');
      // With the PKI back, the same request issues.
      await enroll(c, {token: token.secret, identity: identity({macs: [mac()]})}).expect(200);
      assert.strictEqual(await usesOf(token), 0);
    });

    it('two requests that race for a one-use token issue at most one certificate', async () => {
      const token = await mkToken();
      const csrs = await Promise.all([newCsr(), newCsr()]);
      const results = await Promise.all(csrs.map((c) => enroll(c, {token: token.secret, identity: identity({macs: [mac()]})})));
      assert.deepStrictEqual(results.map((r) => r.status).sort(), [200, 202]);
      assert.strictEqual(await usesOf(token), 0);
    });
  });

  describe('the deploy window', () => {
    const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

    it('issues for known-host-no-agent when the host was deployed within 24 hours', async () => {
      const m = mac();
      await mkHost({macs: [bare(m)], deployed: hoursAgo(1)});
      const res = await enroll(await newCsr(), {identity: identity({macs: [m]})}).expect(200);
      assert.strictEqual(res.body.status, 'issued');
    });

    it('issues for rebind, and the host keeps its number', async () => {
      const m = mac();
      const host = await mkHost({macs: [bare(m)], deployed: hoursAgo(2), agentFingerprint: crypto.randomBytes(32).toString('hex'), agentId: 987654});
      const res = await enroll(await newCsr(), {identity: identity({macs: [m]})}).expect(200);
      assert.strictEqual(res.body.host_id, 987654);
      assert.notStrictEqual((await hostOf(host.id)).agentFingerprint, host.agentFingerprint);
    });

    it('waits when the deploy is older than the window, in the future, or unset', async () => {
      for (const deployed of [hoursAgo(25), hoursAgo(-5), '', 'not a date']) {
        const m = mac();
        await mkHost({macs: [bare(m)], deployed});
        const res = await enroll(await newCsr(), {identity: identity({macs: [m]})}).expect(202);
        assert.strictEqual(res.body.reason, 'known-host-no-agent', JSON.stringify(deployed));
      }
    });

    it('does not issue for unknown-host or identity-conflict', async () => {
      const res = await enroll(await newCsr(), {identity: identity({macs: [mac()]})}).expect(202);
      assert.strictEqual(res.body.reason, 'unknown-host');
      const serial = `MOCHA-${uniq()}`;
      const m = mac();
      await mkHost({serial, deployed: hoursAgo(1)});
      await mkHost({macs: [bare(m)], deployed: hoursAgo(1)});
      const conflict = await enroll(await newCsr(), {identity: identity({system_serial: serial, macs: [m]})}).expect(202);
      assert.strictEqual(conflict.body.reason, 'identity-conflict');
    });

    it('follows the Setting FOG_AGENT_ENROLL_DEPLOY_WINDOW: a wider window issues, below 1 disables', async () => {
      const m = mac();
      await mkHost({macs: [bare(m)], deployed: hoursAgo(30)});
      await enroll(await newCsr(), {identity: identity({macs: [m]})}).expect(202);
      await put('FOG_AGENT_ENROLL_DEPLOY_WINDOW', '48');
      await enroll(await newCsr(), {identity: identity({macs: [m]})}).expect(200);

      const m2 = mac();
      await mkHost({macs: [bare(m2)], deployed: hoursAgo(1)});
      await put('FOG_AGENT_ENROLL_DEPLOY_WINDOW', '0');
      await enroll(await newCsr(), {identity: identity({macs: [m2]})}).expect(202);
    });
  });

  describe('the Host record', () => {
    const collection = (model) => sails.getDatastore(model.datastore).manager.collection(model.tableName);
    let admin;

    async function signIn(username, password) {
      const agent = supertest.agent(app());
      let {body} = await agent.get('/csrfToken').expect(200);
      await agent.post('/login').type('form').set(...HTML)
        .send({username, password, _csrf: body._csrf})
        .expect(302).expect('Location', '/');
      ({body} = await agent.get('/csrfToken').expect(200));
      return {agent, csrf: body._csrf};
    }
    before(async () => { admin = await signIn('mochatestadmin', 'mochatestadmin'); });

    it('has the four indexes after a lift, and a second ensureIndexes does not fail', async () => {
      const check = async () => {
        const find = async (model, key) => (await collection(model).indexes()).find((i) => Object.keys(i.key).join() === key);
        const fp = await find(sails.models.agentenrollment, 'fingerprint');
        const hash = await find(sails.models.agentenrolltoken, 'hash');
        const hostFp = await find(sails.models.host, 'agentFingerprint');
        const hostId = await find(sails.models.host, 'agentId');
        assert.strictEqual(fp && fp.unique, true);
        assert.strictEqual(hash && hash.unique, true);
        assert.ok(hostFp);
        assert.notStrictEqual(hostFp.unique, true);
        assert.strictEqual(hostId && hostId.unique, true);
        assert.deepStrictEqual(hostId.partialFilterExpression, {agentId: {$gt: 0}});
      };
      await check();
      await sails.helpers.agent.ensureIndexes();
      await check();
    });

    it('lets two hosts with no agent exist (agentId 0 is not indexed)', async () => {
      const a = await mkHost();
      const b = await mkHost();
      assert.ok(!(a.agentId > 0) && !(b.agentId > 0));
    });

    it('refuses a second host with the same agentId', async () => {
      const a = await mkHost({agentId: 424242});
      assert.strictEqual(a.agentId, 424242);
      await assert.rejects(mkHost({agentId: 424242}), (err) => err.code === 'E_UNIQUE');
    });

    it('refuses a second row for one fingerprint', async () => {
      const c = await newCsr();
      await Enrollment().create({fingerprint: c.fingerprint, csr: c.pem});
      await assert.rejects(Enrollment().create({fingerprint: c.fingerprint, csr: c.pem}), (err) => err.code === 'E_UNIQUE');
    });

    it('lists the five fields as server-owned', () => {
      assert.deepStrictEqual([...sails.models.host.serverOwned].sort(), ['agentCheckin', 'agentFingerprint', 'agentId', 'agentNotAfter', 'agentVersion']);
    });

    it('does not show the agent fields on the host edit page', async () => {
      const host = await mkHost({agentFingerprint: 'a'.repeat(64), agentId: 515151});
      const res = await admin.agent.get(`/hosts/edit/${host.id}`).set(...HTML).expect(200);
      assert.ok(res.text.includes('host-kernelArgs'), 'the page lists the other host fields');
      assert.ok(!/agent(Fingerprint|NotAfter|Version|Checkin|Id)|host-agent/i.test(res.text), 'no agent field is on the page');
    });

    it('does not set the agent fields from a page save, POST /api/v1/host or PUT /api/v1/host/:id', async () => {
      const evil = {agentFingerprint: 'e'.repeat(64), agentId: 616161, agentNotAfter: '2099-01-01 00:00:00', agentVersion: '6.6.6', agentCheckin: 99};
      const clean = (h) => {
        assert.ok(!h.agentFingerprint, 'agentFingerprint');
        assert.ok(!(h.agentId > 0), 'agentId');
        assert.ok(!h.agentNotAfter, 'agentNotAfter');
        assert.ok(!h.agentVersion, 'agentVersion');
        assert.ok(!(h.agentCheckin > 0), 'agentCheckin');
      };

      const created = await admin.agent.post('/api/v1/host').set(...AJAX).send(Object.assign({name: uniq()}, evil)).expect(200);
      clean(await hostOf(created.body.id));

      const host = await mkHost();
      await admin.agent.put(`/api/v1/host/${host.id}`).set(...AJAX).send(Object.assign({description: 'put'}, evil)).expect(200);
      assert.strictEqual((await hostOf(host.id)).description, 'put');
      clean(await hostOf(host.id));

      await admin.agent.post(`/hosts/edit/${host.id}`).type('form').set(...HTML)
        .send(Object.assign({name: host.name, description: 'page', _csrf: admin.csrf}, evil)).expect(302);
      assert.strictEqual((await hostOf(host.id)).description, 'page');
      clean(await hostOf(host.id));

      const page = await admin.agent.post('/hosts/create').type('form').set(...HTML)
        .send(Object.assign({name: uniq(), _csrf: admin.csrf}, evil)).expect(302);
      clean(await hostOf(/\/hosts\/edit\/(\w+)/.exec(page.headers.location)[1]));
    });

    it('does not let a stock-less model through the generic API', async () => {
      const c = await newCsr();
      await Enrollment().create({fingerprint: c.fingerprint, csr: c.pem});
      for (const model of ['agentenrollment', 'agentenrolltoken']) {
        await admin.agent.get(`/api/v1/${model}`).set(...AJAX).expect(403);
      }
    });
  });
});
