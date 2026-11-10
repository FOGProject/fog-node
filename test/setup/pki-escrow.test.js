const assert = require('assert');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');
const {setupPki} = require('../../tools/setup/pki');
const agentCa = require('../../tools/setup/agent-ca-lib');
const escrow = require('../../api/lib/agent-ca-escrow');
const {ROOT_SETTING, AGENT_CA_SETTING, fingerprintOf} = require('../../api/lib/agent-pki');
const support = require('../support/pki');

// The agent CA backup in setup (tools/setup/pki.js setupPki) and in
// npm run agent-ca (tools/setup/agent-ca-lib.js), with the real Setting,
// AgentCaEscrow and AuditLog models on the test database.
describe('Agent CA backup in setup::', function () {
  this.timeout(180000);

  const PASS = 'throwaway escrow test passphrase';
  const WRONG = 'a wrong escrow test passphrase';
  const FAST = {N: 1024, r: 8, p: 1};
  const CA = ['root.key', 'root.pem', 'agent-ca.key', 'agent-ca.pem'];
  const OLDER = 'The database backup holds an older agent CA; restoring it would cut off agents enrolled since.';
  const settings = () => sails.models.setting;
  const escrows = () => sails.models.agentcaescrow;
  let fixture;
  let foreign;
  let saved;
  let start;

  const setting = async (name) => {
    const record = await settings().findOne({name});
    return record ? record.value : undefined;
  };
  const put = async (name, value) => {
    await settings().destroy({name});
    if (value !== undefined) await settings().create({name, value});
  };
  const fpIn = (dir, name) => fingerprintOf(fs.readFileSync(path.join(dir, name), 'utf8'));
  const rowsSince = () => sails.models.auditlog.find({type: 'agent.ca', createdAt: {'>=': start}}).sort('createdAt ASC');
  // A private copy of a PKI folder, and the folders to remove after each test.
  let dirs = [];
  const copyOf = (dir) => {
    const to = support.copy(dir);
    dirs.push(to);
    return to;
  };
  const clear = (dir) => {
    for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name), {recursive: true, force: true});
  };

  // A getPassphrase that answers from a list and records each purpose.
  const answering = (...answers) => {
    const fn = async ({purpose}) => {
      fn.purposes.push(purpose);
      return answers.length > 1 ? answers.shift() : answers[0];
    };
    fn.purposes = [];
    return fn;
  };
  const refuse = async () => {
    throw new Error('getPassphrase must not be called');
  };
  const setup = (pkiDir, extra = {}) => setupPki(Object.assign({
    pkiDir, newRoot: false, settings: settings(), log: () => {}, command: 'setup', sans: support.SANS, escrows: escrows()
  }, extra));
  // The fixture as an install that setup has run on: both Settings and a backup.
  const installed = async () => {
    const dir = copyOf(fixture);
    await put(ROOT_SETTING, support.rootOf(dir));
    await put(AGENT_CA_SETTING, fpIn(dir, 'agent-ca.pem'));
    await escrows().create(await escrow.seal(dir, PASS, FAST));
    return dir;
  };

  before(async () => {
    fixture = await support.fixture();
    foreign = await support.foreign();
    saved = {root: await setting(ROOT_SETTING), ca: await setting(AGENT_CA_SETTING)};
  });
  beforeEach(async () => {
    await put(ROOT_SETTING, undefined);
    await put(AGENT_CA_SETTING, undefined);
    await escrows().destroy({});
    start = Date.now();
  });
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, {recursive: true, force: true});
    dirs = [];
  });
  after(async () => {
    await escrows().destroy({});
    await put(ROOT_SETTING, saved.root);
    await put(AGENT_CA_SETTING, saved.ca);
  });

  describe('setupPki with escrows::', () => {
    it('with no backup saves one, writes both Settings and one allowed row', async () => {
      const dir = copyOf(fixture);
      const ask = answering(PASS);
      await setup(dir, {getPassphrase: ask});
      assert.deepStrictEqual(ask.purposes, ['new']);
      assert.strictEqual(await setting(ROOT_SETTING), support.rootOf(dir));
      assert.strictEqual(await setting(AGENT_CA_SETTING), fpIn(dir, 'agent-ca.pem'));
      const records = await escrows().find({});
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].rootFingerprint, support.rootOf(dir));
      assert.strictEqual(records[0].kdf.N, 131072);
      assert.ok(!JSON.stringify(records[0]).includes('BEGIN'));
      const rows = await rowsSince();
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].outcome, 'allowed');
      assert.strictEqual(rows[0].createdBy, '(system)');
      assert.strictEqual(rows[0].authSource, 'setup');
      assert.strictEqual(rows[0].text, `agent CA backup saved, root ${support.rootOf(dir).replace(/:/g, '').slice(0, 16)}`);
    });

    it('writes the agent CA Setting without escrows too', async () => {
      const dir = copyOf(fixture);
      await setup(dir, {escrows: undefined});
      assert.strictEqual(await setting(AGENT_CA_SETTING), fpIn(dir, 'agent-ca.pem'));
      assert.strictEqual((await escrows().find({})).length, 0);
    });

    it('with a matching backup changes nothing and does not ask', async () => {
      const dir = await installed();
      const [before] = await escrows().find({});
      await setup(dir, {getPassphrase: refuse});
      const after = await escrows().find({});
      assert.deepStrictEqual(after, [before]);
      assert.strictEqual((await rowsSince()).length, 0);
    });

    it('replaces a backup of another CA', async () => {
      const dir = copyOf(fixture);
      await escrows().create(await escrow.seal(foreign, PASS, FAST));
      const ask = answering(PASS);
      await setup(dir, {getPassphrase: ask});
      assert.deepStrictEqual(ask.purposes, ['replace']);
      const records = await escrows().find({});
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].rootFingerprint, support.rootOf(dir));
      assert.strictEqual(records[0].agentCaFingerprint, fpIn(dir, 'agent-ca.pem'));
    });

    it('with null from getPassphrase makes no backup, says so and continues', async () => {
      const dir = copyOf(fixture);
      const lines = [];
      const result = await setup(dir, {getPassphrase: answering(null), log: (l) => lines.push(l)});
      assert.strictEqual(result.rootFingerprint, support.rootOf(dir));
      assert.strictEqual((await escrows().find({})).length, 0);
      assert.ok(lines.includes('No agent CA backup was made. Run: npm run agent-ca -- backup'));
    });

    it('with null for a stale backup keeps it and says it is out of date', async () => {
      const dir = copyOf(fixture);
      await escrows().create(await escrow.seal(foreign, PASS, FAST));
      const lines = [];
      await setup(dir, {getPassphrase: answering(null), log: (l) => lines.push(l)});
      assert.strictEqual((await escrows().find({}))[0].rootFingerprint, support.rootOf(foreign));
      assert.ok(lines.includes('The agent CA backup is out of date. Run: npm run agent-ca -- backup'));
    });

    it('restores a missing root with the right passphrase, with the same fingerprints', async () => {
      const dir = await installed();
      const root = support.rootOf(dir);
      const ca = fpIn(dir, 'agent-ca.pem');
      clear(dir);
      const lines = [];
      const ask = answering(PASS);
      const result = await setup(dir, {getPassphrase: ask, log: (l) => lines.push(l)});
      assert.deepStrictEqual(ask.purposes, ['restore']);
      assert.ok(lines.includes(`${dir} has no agent root, but the database holds a backup of it.`));
      assert.strictEqual(result.rootFingerprint, root);
      assert.strictEqual(support.rootOf(dir), root);
      assert.strictEqual(fpIn(dir, 'agent-ca.pem'), ca);
      assert.ok(fs.existsSync(path.join(dir, 'server.pem')));
      assert.ok(fs.existsSync(path.join(dir, 'agent-ca-bundle.pem')));
      if (process.platform !== 'win32') {
        for (const k of ['root.key', 'agent-ca.key', 'server.key']) assert.strictEqual(fs.statSync(path.join(dir, k)).mode & 0o777, 0o600, k);
      }
      const rows = await rowsSince();
      assert.deepStrictEqual(rows.map((r) => [r.outcome, r.text]),
        [['allowed', `agent CA restored from the backup, root ${root.replace(/:/g, '').slice(0, 16)}`]]);
    });

    it('refuses a wrong passphrase: E_AGENT_ROOT_MISSING, an empty folder and a denied row per try', async () => {
      const dir = await installed();
      clear(dir);
      await assert.rejects(() => setup(dir, {getPassphrase: answering(WRONG), restoreTries: 3}), (err) => {
        assert.strictEqual(err.code, 'E_AGENT_ROOT_MISSING');
        assert.ok(err.message.includes('The agent CA backup was not opened.'));
        assert.ok(!err.message.includes('--agent-ca-passphrase-file'));
        return true;
      });
      assert.deepStrictEqual(fs.readdirSync(dir), []);
      const rows = await rowsSince();
      assert.deepStrictEqual(rows.map((r) => [r.outcome, r.text]),
        Array(3).fill(['denied', 'agent CA restore refused: wrong passphrase']));
    });

    it('tries once by default, and names the passphrase file flag for setup:dev', async () => {
      const dir = await installed();
      clear(dir);
      const ask = answering(WRONG);
      await assert.rejects(() => setup(dir, {getPassphrase: ask, command: 'setup:dev'}),
        /The agent CA backup was not opened\.\nRun it again with --agent-ca-passphrase-file <file>\./);
      assert.strictEqual(ask.purposes.length, 1);
      assert.strictEqual((await rowsSince()).length, 1);
    });

    it('with null for a restore writes nothing and no row', async () => {
      const dir = await installed();
      clear(dir);
      await assert.rejects(() => setup(dir, {getPassphrase: answering(null)}), /The agent CA backup was not opened\./);
      assert.deepStrictEqual(fs.readdirSync(dir), []);
      assert.strictEqual((await rowsSince()).length, 0);
    });

    it('refuses a backup of an older agent CA, and one with the agent CA Setting unset', async () => {
      for (const value of [support.rootOf(foreign), undefined]) {
        const dir = await installed();
        await put(AGENT_CA_SETTING, value);
        clear(dir);
        await assert.rejects(() => setup(dir, {getPassphrase: refuse}), (err) => {
          assert.strictEqual(err.code, 'E_AGENT_ROOT_MISSING');
          assert.ok(err.message.includes(`${OLDER} Restore the pki folder from a file backup.`));
          return true;
        });
        assert.deepStrictEqual(fs.readdirSync(dir), []);
        await escrows().destroy({});
      }
      assert.strictEqual((await rowsSince()).length, 0);
    });

    it('refuses while a CA file remains', async () => {
      const dir = await installed();
      fs.unlinkSync(path.join(dir, 'root.pem'));
      await assert.rejects(() => setup(dir, {getPassphrase: refuse}), (err) => {
        assert.strictEqual(err.code, 'E_AGENT_ROOT_MISSING');
        assert.ok(err.message.includes(`Move the remaining CA files out of ${dir} first.`));
        return true;
      });
      assert.ok(!fs.existsSync(path.join(dir, 'root.pem')));
    });

    it('never restores on E_AGENT_ROOT_MISMATCH', async () => {
      const dir = await installed();
      fs.copyFileSync(path.join(foreign, 'root.pem'), path.join(dir, 'root.pem'));
      await assert.rejects(() => setup(dir, {getPassphrase: refuse}), {code: 'E_AGENT_ROOT_MISMATCH'});
      assert.strictEqual(support.rootOf(dir), support.rootOf(foreign));
    });
  });

  describe('npm run agent-ca::', () => {
    const args = (pkiDir, passphrase) => ({pkiDir, settings: settings(), escrows: escrows(), passphrase});
    const restoreArgs = (pkiDir, getPassphrase, tries) => ({pkiDir, settings: settings(), escrows: escrows(), getPassphrase, tries});

    it('backup seals the recorded CA, replaces the backup and writes one row', async () => {
      const dir = await installed();
      const [old] = await escrows().find({});
      await agentCa.backup(args(dir, PASS));
      const records = await escrows().find({});
      assert.strictEqual(records.length, 1);
      assert.notStrictEqual(records[0].id, old.id);
      assert.deepStrictEqual(await escrow.open(records[0], PASS), await escrow.open(old, PASS));
      assert.deepStrictEqual((await rowsSince()).map((r) => r.outcome), ['allowed']);
    });

    it('backup writes an unset agent CA Setting when the recorded root issued agent-ca.pem', async () => {
      const dir = copyOf(fixture);
      await put(ROOT_SETTING, support.rootOf(dir));
      await agentCa.backup(args(dir, PASS));
      assert.strictEqual(await setting(AGENT_CA_SETTING), fpIn(dir, 'agent-ca.pem'));
      assert.strictEqual((await escrows().find({})).length, 1);
    });

    it('backup refuses a missing root.pem, another root, another agent CA and a weak passphrase', async () => {
      const dir = await installed();
      const [old] = await escrows().find({});
      const noRoot = copyOf(dir);
      fs.unlinkSync(path.join(noRoot, 'root.pem'));
      await assert.rejects(() => agentCa.backup(args(noRoot, PASS)), {message: 'pki/ does not hold the recorded CA.'});
      await assert.rejects(() => agentCa.backup(args(foreign, PASS)), {message: 'pki/ does not hold the recorded CA.'});
      await put(AGENT_CA_SETTING, support.rootOf(foreign));
      await assert.rejects(() => agentCa.backup(args(dir, PASS)), {message: 'pki/ does not hold the recorded CA.'});
      await put(AGENT_CA_SETTING, fpIn(dir, 'agent-ca.pem'));
      await assert.rejects(() => agentCa.backup(args(dir, 'too short')), {code: 'E_ESCROW_WEAK'});
      assert.deepStrictEqual(await escrows().find({}), [old]);
      assert.strictEqual((await rowsSince()).length, 0);
    });

    it('restore writes the CA files, the bundle and server.pem, and one row', async () => {
      const dir = await installed();
      const root = support.rootOf(dir);
      clear(dir);
      const ask = answering(PASS);
      const result = await agentCa.restore(restoreArgs(dir, ask));
      assert.deepStrictEqual(ask.purposes, ['restore']);
      assert.strictEqual(result.rootFingerprint, root);
      for (const name of [...CA, 'agent-ca-bundle.pem', 'server.pem', 'server.key']) assert.ok(fs.existsSync(path.join(dir, name)), name);
      assert.deepStrictEqual((await rowsSince()).map((r) => r.outcome), ['allowed']);
    });

    it('restore refuses CA files on disk, and no backup, without asking for a passphrase', async () => {
      const dir = await installed();
      await assert.rejects(() => agentCa.restore(restoreArgs(dir, refuse)), {message: `${dir} already holds CA files; move them away first.`});
      // The CA-file refusal comes first, also with no backup.
      await escrows().destroy({});
      await assert.rejects(() => agentCa.restore(restoreArgs(dir, refuse)), {message: `${dir} already holds CA files; move them away first.`});
      clear(dir);
      await assert.rejects(() => agentCa.restore(restoreArgs(dir, refuse)), {message: 'The database holds no agent CA backup.'});
      assert.strictEqual((await rowsSince()).length, 0);
    });

    it('restore refuses another root and an older agent CA without asking, and a wrong passphrase per try', async () => {
      const dir = await installed();
      clear(dir);
      const ask = answering(WRONG);
      await assert.rejects(() => agentCa.restore(restoreArgs(dir, ask, 3)), {code: 'E_ESCROW_PASSPHRASE'});
      assert.strictEqual(ask.purposes.length, 3);
      assert.deepStrictEqual((await rowsSince()).map((r) => [r.outcome, r.text]),
        Array(3).fill(['denied', 'agent CA restore refused: wrong passphrase']));
      await put(AGENT_CA_SETTING, support.rootOf(foreign));
      await assert.rejects(() => agentCa.restore(restoreArgs(dir, refuse)), {message: `${OLDER} Restore the pki folder from a file backup.`});
      await put(ROOT_SETTING, support.rootOf(foreign));
      await assert.rejects(() => agentCa.restore(restoreArgs(dir, refuse)), {message: 'The agent CA backup is not of the recorded root.'});
      assert.deepStrictEqual(fs.readdirSync(dir), []);
      assert.strictEqual((await rowsSince()).length, 3);
    });

    it('status reports the backup against the Settings and the files', async () => {
      assert.deepStrictEqual(await agentCa.status(args(fixture)), {exists: false, lines: ['No agent CA backup is in the database.']});
      const dir = await installed();
      let facts = await agentCa.status(args(dir));
      assert.deepStrictEqual([facts.exists, facts.root, facts.agentCa], [true, {recorded: true, onDisk: true}, {recorded: true, onDisk: true}]);
      fs.unlinkSync(path.join(dir, 'agent-ca.pem'));
      await put(ROOT_SETTING, support.rootOf(foreign));
      facts = await agentCa.status(args(dir));
      assert.deepStrictEqual([facts.root, facts.agentCa], [{recorded: false, onDisk: true}, {recorded: true, onDisk: false}]);
      assert.strictEqual(facts.lines.length, 3);
    });
  });

  it('no agent.ca row holds the passphrase after a seal and a restore', async () => {
    const dir = copyOf(fixture);
    await setup(dir, {getPassphrase: answering(PASS)});
    clear(dir);
    await setup(dir, {getPassphrase: answering(WRONG, PASS), restoreTries: 2});
    const rows = await rowsSince();
    assert.deepStrictEqual(rows.map((r) => r.outcome), ['allowed', 'denied', 'allowed']);
    for (const row of rows) {
      for (const secret of [PASS, WRONG]) assert.ok(!JSON.stringify(row).includes(secret));
    }
  });

  it('GET /api/v1/agentcaescrow answers 403 for the admin', async () => {
    const dir = copyOf(fixture);
    const record = await escrows().create(await escrow.seal(dir, PASS, FAST)).fetch();
    const app = sails.hooks.http.app;
    const {body} = await supertest(app).post('/api/v1/auth/login').send({username: 'mochatestadmin', password: 'mochatestadmin'}).expect(200);
    await supertest(app).get('/api/v1/agentcaescrow').set('Authorization', body.token).set('X-Requested-With', 'XMLHttpRequest').expect(403);
    await supertest(app).get(`/api/v1/agentcaescrow/${record.id}`).set('Authorization', body.token).set('X-Requested-With', 'XMLHttpRequest').expect(403);
  });
});
