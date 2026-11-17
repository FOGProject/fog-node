const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');
const auditWait = require('../support/audit-wait');
const {waitFor} = auditWait;

// The Log Viewer (issue #209): GET /logviewer and POST /api/v1/log/tail,
// behind setting.read. The fixture files go in a sub folder of
// sails.config.custom.logDir (the mocha lift's temporary folder), which this
// file points custom.logDir at for its run: the running logger keeps its own
// fog-node.log open in the lift's folder, and a fixture must not meet it.
// The seam writes after the response, so a test that expects a row polls for
// it. A test that expects NO row makes its request, then a sentinel request
// that does write a row, waits for the sentinel row, and only then asserts
// the absence (test/integration/audit.test.js).
describe('Log Viewer::', function () {
  this.timeout(30000);

  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mocha-lv' + RUN;
  const PASSWORD = 'mocha-lv-pw';
  const TAIL = '/api/v1/log/tail';
  const MAIN = 'fog-node.log';
  let seq = 0;
  let realDir;
  let dir;

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
    agent.username = username;
    return agent;
  }

  const sentinel = (agent, start) => auditWait.sentinel((url) => agent.get(url).set(...AJAX), `${PREFIX}-sentinel-${seq++}`, start);
  const post = (agent, body) => agent.post(TAIL).set(...AJAX).send(body);
  const numbered = (count) => Array.from({length: count}, (_, i) => `L${i + 1}`);
  const put = (name, text) => fs.writeFileSync(path.join(dir, name), text);

  async function cleanup() {
    await AuditLog.destroy({createdBy: {startsWith: PREFIX}});
    await User.destroy({username: {startsWith: PREFIX}});
    await Role.destroy({name: {startsWith: PREFIX}});
  }

  let admin;
  let limited;
  before(async () => {
    await cleanup();
    realDir = sails.config.custom.logDir;
    dir = path.join(realDir, `viewer-${RUN}`);
    fs.mkdirSync(dir, {recursive: true});
    sails.config.custom.logDir = dir;
    admin = await signIn(await mkUser('admin', {isAdmin: true}));
    limited = await signIn(await mkUser('limited', {permissions: {stock: {host: {read: true}}}}));
  });
  after(async () => {
    sails.config.custom.logDir = realDir;
    fs.rmSync(dir, {recursive: true, force: true});
    await cleanup();
  });
  beforeEach(() => {
    for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name), {recursive: true, force: true});
  });

  describe('the page', () => {
    it('answers 200 for an admin, and the File select lists fog-node.log and the old files', async () => {
      put(MAIN, 'x\n');
      put(`${MAIN}.2`, 'y\n');
      const res = await admin.get('/logviewer').set(...HTML).expect(200);
      assert.ok(res.text.includes('<title>Log Viewer | FOG Project</title>'), 'no Log Viewer tab title');
      const select = res.text.match(/<select id="logviewer-file"[\s\S]*?<\/select>/);
      assert.ok(select, 'no File select');
      assert.deepStrictEqual([...select[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), [MAIN, `${MAIN}.2`]);
      const lines = res.text.match(/<select id="logviewer-lines"[\s\S]*?<\/select>/)[0];
      assert.deepStrictEqual([...lines.matchAll(/<option value="(\d+)"( selected)?/g)].map((m) => [m[1], Boolean(m[2])]),
        [['10', false], ['25', false], ['50', false], ['100', true], ['250', false], ['500', false], ['1000', false]]);
      assert.ok(res.text.includes('id="logviewer-reverse"') && res.text.includes('id="logviewer-pause"') && res.text.includes('id="logviewer-pre"'));
    });

    it('answers 403 for a role without setting.read, and writes a denied row', async () => {
      const start = Date.now();
      await limited.get('/logviewer').set(...HTML).expect(403);
      const [row] = await waitFor({createdBy: limited.username, permission: 'setting.read'}, start);
      assert.strictEqual(row.outcome, 'denied');
    });
  });

  describe('the gate on the tail', () => {
    it('answers 403 without setting.read, and writes a denied row', async () => {
      put(MAIN, 'x\n');
      const start = Date.now();
      await post(limited, {file: MAIN}).expect(403);
      const [row] = await waitFor({createdBy: limited.username, permission: 'setting.read', text: `POST ${TAIL}`}, start);
      assert.strictEqual(row.outcome, 'denied');
    });

    it('writes no AuditLog row for an allowed tail', async () => {
      put(MAIN, 'x\n');
      const start = Date.now();
      await post(admin, {file: MAIN}).expect(200);
      await sentinel(admin, start);
      const rows = await AuditLog.find({createdBy: admin.username, createdAt: {'>=': start}});
      assert.deepStrictEqual(rows.filter((r) => r.permission === 'setting.read' || r.text.includes(TAIL)), []);
    });
  });

  describe('the tail', () => {
    // 300 lines of about 20 bytes: well over 4096 bytes.
    const all = numbered(300).map((l) => `${l} ${'.'.repeat(16)}`);
    beforeEach(() => put(MAIN, all.join('\n') + '\n'));

    it('returns exactly the last N lines, in order', async () => {
      const {body} = await post(admin, {file: MAIN, lines: 10}).expect(200);
      assert.deepStrictEqual(body, {file: MAIN, lines: all.slice(-10)});
    });

    it('returns newest first with reverse true, and with the string "true"', async () => {
      const want = all.slice(-10).reverse();
      assert.deepStrictEqual((await post(admin, {file: MAIN, lines: 10, reverse: true}).expect(200)).body.lines, want);
      assert.deepStrictEqual((await post(admin, {file: MAIN, lines: 10, reverse: 'true'}).expect(200)).body.lines, want);
      assert.deepStrictEqual((await post(admin, {file: MAIN, lines: 10, reverse: 'yes'}).expect(200)).body.lines, all.slice(-10));
    });

    it('reads 250 lines for "250", and 100 for 99999, "x" and a missing value', async () => {
      assert.strictEqual((await post(admin, {file: MAIN, lines: '250'}).expect(200)).body.lines.length, 250);
      assert.strictEqual((await post(admin, {file: MAIN, lines: 250}).expect(200)).body.lines.length, 250);
      for (const lines of [99999, 'x', '99999', 12, -5, null, {}, undefined]) {
        assert.strictEqual((await post(admin, {file: MAIN, lines}).expect(200)).body.lines.length, 100, `lines ${JSON.stringify(lines)}`);
      }
    });

    it('reads an old file, and answers 200 with no lines for a file that is gone after the list', async () => {
      put(`${MAIN}.1`, 'old1\nold2\n');
      assert.deepStrictEqual((await post(admin, {file: `${MAIN}.1`, lines: 10}).expect(200)).body, {file: `${MAIN}.1`, lines: ['old1', 'old2']});
      const real = sails.helpers.log.files;
      // The files rule lists the file, and it is gone when the action opens it.
      const st = fs.lstatSync(path.join(dir, MAIN), {bigint: true});
      sails.helpers.log.files = () => ({dir, files: [{name: `${MAIN}.4`, dev: st.dev, ino: st.ino}]});
      try {
        assert.deepStrictEqual((await post(admin, {file: `${MAIN}.4`}).expect(200)).body, {file: `${MAIN}.4`, lines: []});
      } finally {
        sails.helpers.log.files = real;
      }
    });

    it('answers 400 when the dev and ino of the list differ from the opened file', async () => {
      const real = sails.helpers.log.files;
      const st = fs.lstatSync(path.join(dir, MAIN), {bigint: true});
      sails.helpers.log.files = () => ({dir, files: [{name: MAIN, dev: st.dev, ino: st.ino + 1n}]});
      try {
        const {body} = await post(admin, {file: MAIN}).expect(400);
        assert.deepStrictEqual(body, {error: 'Unknown log file.'});
      } finally {
        sails.helpers.log.files = real;
      }
    });

    it('answers 400 and reads nothing for a name outside the files rule', async () => {
      const opened = [];
      const realOpen = fs.openSync;
      fs.openSync = function (p, ...rest) { opened.push(String(p)); return realOpen.call(this, p, ...rest); };
      try {
        for (const file of ['../config/local.js', '/etc/passwd', `${MAIN}.6`, 'x.log', `${MAIN}.0`, ` ${MAIN}`, `${MAIN}\u0000`, {}, [MAIN], 5, null, undefined]) {
          const {body} = await post(admin, {file}).expect(400);
          assert.deepStrictEqual(body, {error: 'Unknown log file.'}, `file ${JSON.stringify(file)}`);
        }
        await admin.post(TAIL).set(...AJAX).send({}).expect(400);
      } finally {
        fs.openSync = realOpen;
      }
      assert.deepStrictEqual(opened.filter((p) => /passwd|local\.js|\.log/.test(p)), []);
    });

    it('does not list a folder or a symlink, and answers 400 for them', async () => {
      fs.mkdirSync(path.join(dir, `${MAIN}.2`));
      let linked = true;
      try {
        fs.symlinkSync(path.join(dir, MAIN), path.join(dir, `${MAIN}.3`));
      } catch (err) {
        // Windows without the symlink privilege cannot make one.
        linked = false;
        if (process.platform !== 'win32') throw err;
      }
      const {files} = sails.helpers.log.files();
      assert.deepStrictEqual(files.map((f) => f.name), [MAIN]);
      await post(admin, {file: `${MAIN}.2`}).expect(400);
      if (linked) {
        await post(admin, {file: `${MAIN}.3`}).expect(400);
      } else {
        console.log('        (the symlink part is skipped: this system cannot make a symlink)');
      }
    });
  });

  describe('the files rule', () => {
    it('lists only the exact names that are regular files, in order, with a bigint dev and ino', () => {
      put(`${MAIN}.5`, 'a\n');
      put(MAIN, 'b\n');
      put(`${MAIN}.1`, 'c\n');
      put(`${MAIN}.6`, 'd\n');
      put('other.log', 'e\n');
      put(`${MAIN}.old`, 'f\n');
      const got = sails.helpers.log.files();
      assert.strictEqual(got.dir, dir);
      assert.deepStrictEqual(got.files.map((f) => f.name), [MAIN, `${MAIN}.1`, `${MAIN}.5`]);
      for (const f of got.files) {
        assert.strictEqual(typeof f.dev, 'bigint');
        assert.strictEqual(typeof f.ino, 'bigint');
      }
    });

    it('reads the folder on each call', () => {
      put(MAIN, 'b\n');
      assert.deepStrictEqual(sails.helpers.log.files().files.map((f) => f.name), [MAIN]);
      fs.rmSync(path.join(dir, MAIN));
      assert.deepStrictEqual(sails.helpers.log.files().files, []);
    });
  });
});
