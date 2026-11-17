const assert = require('assert');
const crypto = require('crypto');
const supertest = require('supertest');

// The FOG Settings page (GET /about/settings) and its save route
// (POST /api/v1/setting/save), issue #199. The page renders the settings
// catalog (config/fog-settings.js); the route stores one key, validated by
// the entry's normalize(), behind setting.update and apiCsrfGuard.
describe('FOG Settings page::', function () {
  this.timeout(20000);

  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const SAVE = '/api/v1/setting/save';
  const SCROLL = 'FOG_TABLE_SCROLL_MODE';
  const SCREEN = 'FOG_VIEW_DEFAULT_SCREEN';
  // The Setting records these tests touch. Each is put back after.
  const NAMES = [SCROLL, SCREEN, 'schema'];
  const RUN = crypto.randomBytes(3).toString('hex');
  const PREFIX = 'mset' + RUN;
  const PASSWORD = 'mocha-settings-pw';
  const OK = {msg: 'Settings successfully stored!', title: 'Settings Update Success'};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const Setting = () => sails.models.setting;

  // Signs in as a browser does (see limited-role.test.js): a CSRF token for
  // the login form, then the form POST, then a fresh token (the sign-in
  // regenerates the session).
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    ({body} = await agent.get('/csrfToken').expect(200));
    return {agent, csrf: body._csrf};
  }
  // A non-admin user whose role holds the given stock.setting permissions.
  async function limited(label, setting) {
    const name = `${PREFIX}-${label}`;
    const role = await sails.models.role.create({name, isAdmin: false, permissions: {stock: {setting}}}).fetch();
    await sails.models.user.create({username: name, password: PASSWORD, email: `${name}@example.com`, roles: [role.id]});
    return signIn(name, PASSWORD);
  }
  const cleanupUsers = async () => {
    await sails.models.user.destroy({username: {startsWith: PREFIX}});
    await sails.models.role.destroy({name: {startsWith: PREFIX}});
  };

  // A browser save: the session cookie, the CSRF header and X-Requested-With.
  const save = (who, body) => who.agent.post(SAVE).set(...AJAX).set('X-CSRF-Token', who.csrf)
    .set('Accept', 'application/json').send(body);
  const value = async (name) => {
    const row = await Setting().findOne({name});
    return row ? row.value : undefined;
  };
  // Stores a value directly, as an earlier admin change would have.
  const put = async (name, val) => {
    if (await Setting().findOne({name})) {
      await Setting().updateOne({name}).set({value: val});
    } else {
      await Setting().create({name, value: val});
    }
  };
  // The settings card of the page: from the card body to the no-result line.
  const card = (html) => {
    const start = html.indexOf('id="settings-content"');
    const end = html.indexOf('settings-noresults');
    assert.ok(start !== -1 && end > start, 'the page has no settings card');
    return html.slice(start, end);
  };
  const selects = (html) => card(html).match(/<select\b[^>]*>/g) || [];

  // Poll every 25 ms, up to 2 s, for an audit row at or after `start`
  // (audit.test.js): the hook writes after the response finishes.
  async function waitFor(where, start) {
    const deadline = Date.now() + 2000;
    for (;;) {
      const found = await AuditLog.find(Object.assign({}, where, {createdAt: {'>=': start}}));
      if (found.length) { return found; }
      if (Date.now() > deadline) { assert.fail(`no audit row for ${JSON.stringify(where)} within 2 s`); }
      await sleep(25);
    }
  }

  // Each record as it was before the tests (null for none). After the tests,
  // a record they created is deleted and a changed value is put back.
  const recorded = {};
  const restore = async (name) => {
    const was = recorded[name];
    const now = await Setting().findOne({name});
    if (!was) {
      if (now) { await Setting().destroy({name}); }
    } else if (!now) {
      await Setting().create(_.pick(was, ['name', 'description', 'value']));
    } else if (!_.isEqual(now.value, was.value)) {
      await Setting().updateOne({name}).set({value: was.value});
    }
  };

  let admin;
  let reader;
  let nobody;
  before(async () => {
    for (const name of NAMES) {
      recorded[name] = (await Setting().findOne({name})) || null;
    }
    await cleanupUsers();
    admin = await signIn('mochatestadmin', 'mochatestadmin');
    reader = await limited('reader', {read: true});
    nobody = await limited('nobody', {});
  });
  after(async () => {
    for (const name of NAMES) {
      await restore(name);
    }
    await cleanupUsers();
  });

  describe('GET /about/settings::', () => {
    it('answers 200 for an admin, with the category nav and a row for each catalog key', async () => {
      const res = await admin.agent.get('/about/settings').set(...HTML).expect(200);
      assert.ok(res.text.includes('<title>FOG Settings | FOG Project</title>'), 'no FOG Settings tab title');
      const html = card(res.text);
      assert.ok(/data-cat="FOG View Settings">FOG View Settings <span class="badge">2<\/span>/.test(html), 'no "FOG View Settings (2)" nav item');
      for (const key of Object.keys(sails.config.fogSettings)) {
        assert.ok(html.includes(`data-key="${key}"`), `no row for ${key}`);
        assert.ok(html.includes(`<select class="form-control" id="${key}" name="${key}"`), `no select for ${key}`);
      }
    });

    it('never shows the schema record, even when it exists', async () => {
      const created = !recorded.schema;
      if (created) { await Setting().create({name: 'schema', value: {revision: 0}}); }
      try {
        const res = await admin.agent.get('/about/settings').set(...HTML).expect(200);
        assert.ok(!/data-key="schema"|id="schema"/.test(res.text), 'the page shows a schema row');
      } finally {
        if (created) { await Setting().destroy({name: 'schema'}); }
      }
    });

    it('answers 403 for a signed-in user without setting.read', async () => {
      await nobody.agent.get('/about/settings').set(...HTML).expect(403);
    });

    it('disables every control for a user with setting.read but not setting.update', async () => {
      const res = await reader.agent.get('/about/settings').set(...HTML).expect(200);
      const found = selects(res.text);
      assert.strictEqual(found.length, Object.keys(sails.config.fogSettings).length);
      found.forEach((tag) => assert.ok(/\sdisabled(\s|>)/.test(tag), `not disabled: ${tag}`));
    });

    it('disables no control for an admin', async () => {
      const res = await admin.agent.get('/about/settings').set(...HTML).expect(200);
      const found = selects(res.text);
      assert.ok(found.length > 0, 'no select');
      found.forEach((tag) => assert.ok(!/\sdisabled(\s|>)/.test(tag), `disabled: ${tag}`));
    });

    it('adds a stored value that is not an option, selected', async () => {
      await put(SCREEN, 30);
      const res = await admin.agent.get('/about/settings').set(...HTML).expect(200);
      const select = card(res.text).match(new RegExp(`<select[^>]*id="${SCREEN}"[\\s\\S]*?</select>`));
      assert.ok(select, `no ${SCREEN} select`);
      assert.ok(/<option value="30" selected>30<\/option>/.test(select[0]), `no selected 30 option: ${select[0]}`);
      assert.strictEqual((select[0].match(/ selected>/g) || []).length, 1, 'more than one option is selected');
    });

    it('answers 500 for a catalog entry of a type it renders no control for', async () => {
      const KEY = 'MOCHA199_TEXT';
      sails.config.fogSettings[KEY] = {
        category: 'Mocha', description: 'A temporary text entry.', type: 'text',
        default: '', normalize: (v) => String(v), reload: false
      };
      try {
        await admin.agent.get('/about/settings').set(...HTML).expect(500);
      } finally {
        delete sails.config.fogSettings[KEY];
      }
      await admin.agent.get('/about/settings').set(...HTML).expect(200);
    });
  });

  describe('POST /api/v1/setting/save::', () => {
    it('stores a good value, answers 202 with the 1.6 message, and writes an audit row naming the setting', async () => {
      await put(SCROLL, 'infinite');
      const start = Date.now();
      const res = await save(admin, {key: SCROLL, value: 'paged'}).expect(202);
      assert.deepStrictEqual(res.body, OK);
      assert.strictEqual(await value(SCROLL), 'paged');
      const row = await Setting().findOne({name: SCROLL});
      const [audit] = await waitFor({subjectType: 'setting', subjectLabel: SCROLL}, start);
      assert.strictEqual(audit.subjectId, row.id);
      assert.strictEqual(audit.permission, 'setting.update');
      assert.strictEqual(audit.outcome, 'allowed');
    });

    it('creates the record when none exists, with the normalized value', async () => {
      await Setting().destroy({name: SCREEN});
      await save(admin, {key: SCREEN, value: ' 50 '}).expect(202);
      assert.strictEqual(await value(SCREEN), 50);
    });

    it('answers 400 for a value that is not valid, and stores nothing', async () => {
      await put(SCROLL, 'infinite');
      const res = await save(admin, {key: SCROLL, value: 'sideways'}).expect(400);
      assert.deepStrictEqual(res.body, {error: `${SCROLL} value is not valid`, title: 'Settings Update Fail'});
      assert.strictEqual(await value(SCROLL), 'infinite');
    });

    it('answers 400 for a key that is not in the catalog, and stores nothing', async () => {
      for (const key of ['FOG_MOCHA_NOPE', 'constructor']) {
        const res = await save(admin, {key, value: 'x'}).expect(400);
        assert.deepStrictEqual(res.body, {error: `Unknown setting: ${key}`, title: 'Settings Update Fail'});
        assert.strictEqual(await Setting().count({name: key}), 0);
      }
    });

    // A JSON body can replace toString, which String() and a template string
    // call: it must still be a 400, not a 500. An array is no value either.
    it('answers 400, not 500, for a key or a value that is not a string or a number', async () => {
      await put(SCROLL, 'infinite');
      const bad = {toString: 1};
      let res = await save(admin, {key: bad, value: 'paged'}).expect(400);
      assert.deepStrictEqual(res.body, {error: 'Unknown setting: {"toString":1}', title: 'Settings Update Fail'});
      for (const val of [bad, ['paged'], true, null]) {
        res = await save(admin, {key: SCROLL, value: val}).expect(400);
        assert.deepStrictEqual(res.body, {error: `${SCROLL} value is not valid`, title: 'Settings Update Fail'});
      }
      assert.strictEqual(await value(SCROLL), 'infinite');
    });

    it('answers 400 for the schema key, and leaves the schema record unchanged', async () => {
      const res = await save(admin, {key: 'schema', value: {revision: 99}}).expect(400);
      assert.deepStrictEqual(res.body, {error: 'Unknown setting: schema', title: 'Settings Update Fail'});
      assert.deepStrictEqual((await Setting().findOne({name: 'schema'})) || null, recorded.schema);
    });

    it('answers 403 to a cookie-session call with a CSRF token but no X-Requested-With, and stores nothing', async () => {
      await put(SCROLL, 'infinite');
      await admin.agent.post(SAVE).set('X-CSRF-Token', admin.csrf).set('Accept', 'application/json')
        .send({key: SCROLL, value: 'paged'}).expect(403);
      assert.strictEqual(await value(SCROLL), 'infinite');
    });

    it('answers 403 to a user without setting.update, and stores nothing', async () => {
      await put(SCROLL, 'infinite');
      await save(reader, {key: SCROLL, value: 'paged'}).expect(403);
      assert.strictEqual(await value(SCROLL), 'infinite');
    });
  });
});
